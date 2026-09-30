// SMC-M01 mission ledger (migration 0018, amendment A08), level: sql-run. Every call runs on the non-owner sophia_api
// login with a transaction-local actor, as the API does; the migration owner only seeds and inspects.
import { createHash, createHmac, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  createProject,
  decideMissionChange,
  mediaAssignments,
  presentMissionProposal,
  previewMissionWithdrawal,
  proposeMissionChange,
  readConfirmationTarget,
  readMissionContext,
  readMissionSource,
  readSnapshot,
  recordMissionEntry,
  setMissionNoteConsent,
  setMissionNotePolicy,
  shownReach,
  startExchange,
  transferInputFloor,
  withActor,
  withdrawMissionEntry,
  withService,
  type DecisionWrite,
  type MissionTurn,
  type NoteWrite,
  type ProposalWrite,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const F = randomUUID() // second editor
const V = randomUUID() // viewer
const O = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
})
after(async () => {
  await pool.end()
  await db.drop()
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

const project = () => seedProject(db.ownerUrl, { admin: A, editors: [E, F], viewers: [V] })
const note = (actor: string, projectId: string, write: NoteWrite, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) => recordMissionEntry(c, projectId, key, write))
const propose = (actor: string, projectId: string, write: ProposalWrite, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) => proposeMissionChange(c, projectId, key, write))
const decide = (actor: string, projectId: string, decisionId: string, write: DecisionWrite, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) => decideMissionChange(c, projectId, decisionId, key, write))
const context = async (actor: string, projectId: string, channel: 'studio' | 'voice' = 'studio') => {
  const ctx = await withActor(pool, actor, 'read', (c) => readMissionContext(c, projectId, { actorId: actor, channel }))
  assert.ok(ctx)
  return ctx
}
const capture = (projectId: string, on: boolean, expectedRevision: number) =>
  withActor(pool, A, 'write', (c) => setMissionNotePolicy(c, projectId, on ? 'automatic' : 'off', expectedRevision))
const consent = (actor: string, projectId: string, state: 'accepted' | 'declined') =>
  withActor(pool, actor, 'write', (c) => setMissionNoteConsent(c, projectId, state))
const preview = (actor: string, projectId: string, entryId: string) =>
  withActor(pool, actor, 'read', (c) => previewMissionWithdrawal(c, projectId, entryId))
/** Forget a note as the Studio does: read what goes, then withdraw exactly that. */
const forget = async (actor: string, projectId: string, entryId: string, key = randomUUID()) => {
  const shown = shownReach(await preview(actor, projectId, entryId))
  return withActor(pool, actor, 'write', (c) => withdrawMissionEntry(c, projectId, entryId, key, shown))
}
/** A proof in the right format that no server issued. */
const madeUp = `v1.9999999999.${'0'.repeat(64)}`
/** Withdraw with a list given outright and a made-up proof, bypassing the preview. */
const withdraw = (actor: string, projectId: string, entryId: string, entryIds: string[], previewToken = madeUp) =>
  withActor(pool, actor, 'write', (c) =>
    withdrawMissionEntry(c, projectId, entryId, randomUUID(), {
      expectedAffected: { entryIds, decisions: [] },
      previewToken,
    }),
  )

/** Open the room's exchange with `actor` holding the floor; their current turn. */
async function exchange(actor: string, projectId: string): Promise<MissionTurn> {
  const snap = await withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const receipt = await withActor(pool, actor, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { exchangeId: receipt.exchangeId, inputEpoch: await epochOf(receipt.exchangeId) }
}
const epochOf = async (exchangeId: string) =>
  Number(
    (await owner<{ e: string }>(`SELECT input_epoch AS e FROM sophia.room_exchanges WHERE id=$1`, [exchangeId]))[0]!.e,
  )

/** Pass the floor to `next`; the new turn. */
async function passFloor(projectId: string, from: string, next: string, exchangeId: string): Promise<MissionTurn> {
  const snap = await withActor(pool, from, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  await withActor(pool, from, 'write', (c) =>
    transferInputFloor(c, snap.room.id, randomUUID(), { nextActorId: next, expectedRoomRevision: snap.room.revision }),
  )
  return { exchangeId, inputEpoch: await epochOf(exchangeId) }
}

const observation = (text: string): NoteWrite => ({ kind: 'observation', epistemic: 'reported', text })

describe('mission ledger: reading the current state (T02)', () => {
  it('reads empty only when nothing exists; a note, proposal or any history makes it present', async () => {
    const created = await withActor(pool, A, 'write', (c) => createProject(c, randomUUID(), { title: 'Fresh idea' }))
    const fresh = await context(A, created.projectId)
    assert.equal(fresh.readState, 'empty')
    assert.equal(fresh.mission, null)
    assert.deepEqual(fresh.missing, ['accepted_mission', 'constraints', 'notes', 'work'])
    assert.equal(fresh.compiler, 'sophia.mission-context.v1')
    assert.match(fresh.digest, /^[0-9a-f]{64}$/)

    await note(A, created.projectId, observation('People want to find nearby workshops.'))
    const later = await context(A, created.projectId)
    assert.equal(later.readState, 'present', 'a draft note is history, even without an accepted mission')
    assert.equal(later.mission, null)
    assert.notEqual(later.digest, fresh.digest)

    const seeded = await project()
    assert.equal((await context(A, seeded.projectId)).readState, 'present', 'existing work is history')
  })

  it('a non-member reads nothing', async () => {
    const { projectId } = await project()
    assert.equal(
      await withActor(pool, O, 'read', (c) => readMissionContext(c, projectId, { actorId: O, channel: 'studio' })),
      null,
    )
  })
})

describe('mission ledger: notes (T03, T04, T11)', () => {
  it('a typed note is a source-backed, attributed entry; the same key and request returns the same receipt', async () => {
    const { projectId } = await project()
    const key = randomUUID()
    const receipt = await note(E, projectId, observation('The first test users skipped the sign-up step.'), key)
    assert.equal(receipt.status, 'committed')
    assert.equal(receipt.operation, 'record_note')
    assert.match(receipt.sha256 ?? '', /^[0-9a-f]{64}$/)
    assert.deepEqual(
      await note(E, projectId, observation('The first test users skipped the sign-up step.'), key),
      receipt,
    )
    assert.equal(
      await codeOf(note(E, projectId, observation('Something else entirely.'), key)),
      'idempotency_conflict',
      'a changed request under the same key is refused',
    )
    const ctx = await context(V, projectId)
    const entry = ctx.entries.find((e) => e.id === receipt.entryId)
    assert.ok(entry)
    assert.deepEqual(
      [entry.actorId, entry.authoredBy, entry.origin, entry.textKind, entry.state, entry.sourceId],
      [E, 'member', 'studio', 'member_text', 'current', receipt.sourceId],
    )
    const rows = await owner<{ n: string }>(`SELECT count(*) AS n FROM sophia.mission_entries WHERE project_id=$1`, [
      projectId,
    ])
    assert.equal(rows[0]!.n, '1', 'the retry wrote nothing')
  })

  it('an outcome links its expectation and leaves the original prediction and its time unchanged', async () => {
    const { projectId } = await project()
    const expected = await note(E, projectId, {
      kind: 'expectation',
      epistemic: 'inferred',
      text: 'We expect people to understand the first step without help.',
    })
    const earlier = await context(E, projectId)
    const original = earlier.entries.find((e) => e.id === expected.entryId)
    assert.ok(original)
    const outcome = await note(F, projectId, {
      kind: 'outcome',
      epistemic: 'observed',
      text: 'Three of five people needed help with the first step.',
      relatedEntryId: expected.entryId,
    })
    const later = await context(E, projectId)
    assert.deepEqual(
      later.entries.find((e) => e.id === expected.entryId),
      original,
      'the expectation is untouched',
    )
    assert.equal(later.entries.find((e) => e.id === outcome.entryId)?.relatedEntryId, expected.entryId)
  })

  it('a correction keeps what the note was about: its links carry over unless it names its own', async () => {
    const { projectId, goalId } = await project()
    const expected = await note(E, projectId, { kind: 'expectation', epistemic: 'inferred', text: 'Eight people.' })
    const outcome = await note(E, projectId, {
      kind: 'outcome',
      epistemic: 'observed',
      text: 'Five people came.',
      relatedEntryId: expected.entryId!,
      goalId,
    })
    const corrected = await note(E, projectId, {
      kind: 'outcome',
      epistemic: 'observed',
      text: 'Six people came.',
      correctsEntryId: outcome.entryId!,
    })
    const current = (await context(E, projectId)).entries.find((e) => e.id === corrected.entryId)
    assert.deepEqual(
      [current?.relatedEntryId, current?.goalId, current?.supersedesEntryId],
      [expected.entryId, goalId, outcome.entryId],
    )
  })

  it('a correction supersedes the note; the original stays readable as history', async () => {
    const { projectId } = await project()
    const first = await note(E, projectId, observation('The workshop list loads in ten seconds.'))
    const fixed = await note(E, projectId, {
      ...observation('The workshop list loads in two seconds.'),
      correctsEntryId: first.entryId,
    })
    assert.equal(fixed.operation, 'correct_note')
    assert.deepEqual(fixed.affected, [first.entryId])
    const ctx = await context(A, projectId)
    assert.deepEqual(
      ctx.entries.map((e) => e.text),
      ['The workshop list loads in two seconds.'],
    )
    const old = ctx.history.find((e) => e.id === first.entryId)
    assert.equal(old?.state, 'superseded')
    assert.equal(old?.text, 'The workshop list loads in ten seconds.')
    assert.equal(old?.supersededById, fixed.entryId)
    assert.equal(
      await codeOf(note(F, projectId, { ...observation('A second correction.'), correctsEntryId: first.entryId })),
      'stale_revision',
      'a note that is no longer current cannot be corrected again',
    )
  })
})

describe('mission ledger: who may write (T07)', () => {
  it('a viewer cannot record, propose or decide; a revoked editor cannot either', async () => {
    const { projectId } = await project()
    assert.equal(await codeOf(note(V, projectId, observation('A viewer note'))), 'forbidden')
    assert.equal(await codeOf(propose(V, projectId, { kind: 'mission', statement: 'A viewer mission' })), 'forbidden')
    const p = await propose(E, projectId, { kind: 'constraint', statement: 'Keep it free for learners.' })
    assert.equal(
      await codeOf(decide(V, projectId, p.decisionId!, { decision: 'accept', expectedRevision: 1 })),
      'forbidden',
    )
    await owner(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [projectId, F])
    assert.equal(await codeOf(note(F, projectId, observation('After revocation'))), 'forbidden')
    assert.equal(
      await codeOf(decide(F, projectId, p.decisionId!, { decision: 'accept', expectedRevision: 1 })),
      'forbidden',
    )
    assert.equal(await codeOf(note(O, projectId, observation('An outsider'))), 'forbidden')
  })

  it('an author demoted to viewer can still withdraw their own note, not correct it; only an admin withdraws others', async () => {
    const { projectId } = await project()
    const mine = await note(E, projectId, observation('Mine to forget'))
    const theirs = await note(F, projectId, observation('Not mine'))
    assert.equal(await codeOf(withdraw(E, projectId, theirs.entryId!, [theirs.entryId!])), 'forbidden')
    await owner(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [projectId, E])
    assert.equal(
      await codeOf(note(E, projectId, { ...observation('Changed'), correctsEntryId: mine.entryId })),
      'forbidden',
    )
    const withdrawn = await forget(E, projectId, mine.entryId!)
    assert.equal(withdrawn.operation, 'withdraw_note')
    await forget(A, projectId, theirs.entryId!)
  })
})

describe('mission ledger: proposals and decisions (T05, T06)', () => {
  it('a proposal accepts nothing; a Studio decision accepts it once, appends the frame and moves the mission revision', async () => {
    const { projectId } = await project()
    const earlier = await context(A, projectId)
    const p = await propose(E, projectId, {
      kind: 'mission',
      statement: 'Help people find nearby creative workshops.',
      purpose: 'So that beginners discover what is around them.',
    })
    assert.deepEqual([p.status, p.operation, p.decisionRevision], ['proposed', 'propose', 1])
    const pending = await context(A, projectId)
    assert.equal(pending.mission, null)
    assert.equal(pending.missionRevision, earlier.missionRevision, 'proposing is not accepting')
    assert.ok(pending.ledgerRevision > earlier.ledgerRevision)
    assert.equal(pending.pending[0]?.statement, 'Help people find nearby creative workshops.')
    assert.equal(pending.pending[0]?.state, 'proposed')

    const accepted = await decide(A, projectId, p.decisionId!, { decision: 'accept', expectedRevision: 1 })
    assert.deepEqual([accepted.status, accepted.decision, accepted.missionRevision], ['committed', 'accepted', 2])
    const ctx = await context(V, projectId)
    assert.equal(ctx.mission?.statement, 'Help people find nearby creative workshops.')
    assert.equal(ctx.mission?.purpose, 'So that beginners discover what is around them.')
    assert.deepEqual([ctx.mission?.acceptedBy, ctx.mission?.decisionId, ctx.missionRevision], [A, p.decisionId, 2])
    assert.equal(ctx.pending.length, 0)
    const frames = await owner<{ revision: string; accepted_by: string }>(
      `SELECT revision, accepted_by FROM sophia.project_revisions WHERE project_id=$1 ORDER BY revision`,
      [projectId],
    )
    assert.deepEqual(
      frames.map((f) => [f.revision, f.accepted_by]),
      [
        ['1', A],
        ['2', A],
      ],
    )
    assert.equal(
      await codeOf(decide(E, projectId, p.decisionId!, { decision: 'reject', expectedRevision: 1 })),
      'stale_revision',
      'a decided proposal cannot be decided again',
    )
  })

  it('a proposal, a rejected alternative, a hypothesis and an accepted constraint stay distinct', async () => {
    const { projectId } = await project()
    const mine = await propose(E, projectId, { kind: 'mission', statement: 'An app for workshops.' })
    const theirs = await propose(F, projectId, { kind: 'mission', statement: 'A printed guide for workshops.' })
    await decide(A, projectId, theirs.decisionId!, { decision: 'reject', expectedRevision: 1 })
    const rule = await propose(E, projectId, { kind: 'constraint', statement: 'No paid ads.' })
    await decide(A, projectId, rule.decisionId!, { decision: 'accept', expectedRevision: 1 })
    await note(E, projectId, { kind: 'explanation', epistemic: 'inferred', text: 'Maybe people distrust apps.' })
    const ctx = await context(A, projectId)
    assert.deepEqual(
      ctx.pending.map((d) => [d.id, d.state, d.proposedBy]),
      [[mine.decisionId, 'proposed', E]],
    )
    assert.deepEqual(
      ctx.constraints.map((d) => [d.id, d.kind, d.state]),
      [[rule.decisionId, 'constraint', 'accepted']],
    )
    const rejected = ctx.decided.find((d) => d.id === theirs.decisionId)
    assert.deepEqual([rejected?.state, rejected?.decidedBy, rejected?.proposedBy], ['rejected', A, F])
    assert.deepEqual(
      ctx.entries.map((e) => [e.kind, e.epistemic]),
      [['explanation', 'inferred']],
    )
    assert.equal(ctx.mission, null)
  })

  it('a proposal replaces only a decision of its own kind: a constraint never retires the mission', async () => {
    const { projectId } = await project()
    const aim = await propose(E, projectId, { kind: 'mission', statement: 'Workshops near the lab.' })
    await decide(A, projectId, aim.decisionId!, { decision: 'accept', expectedRevision: 1 })
    const cheap = await propose(E, projectId, { kind: 'constraint', statement: 'Under 30 euros.' })
    await decide(A, projectId, cheap.decisionId!, { decision: 'accept', expectedRevision: 1 })
    assert.equal(
      await codeOf(
        propose(E, projectId, { kind: 'constraint', statement: 'Free.', supersedesDecisionId: aim.decisionId! }),
      ),
      'invalid_request',
      'a constraint cannot name the mission',
    )
    const cheaper = await propose(E, projectId, {
      kind: 'constraint',
      statement: 'Under 20 euros.',
      supersedesDecisionId: cheap.decisionId!,
    })
    await decide(A, projectId, cheaper.decisionId!, { decision: 'accept', expectedRevision: 1 })
    const ctx = await context(A, projectId)
    assert.deepEqual([ctx.mission?.decisionId, ctx.missionRevision], [aim.decisionId, 2], 'the mission stands')
    assert.deepEqual(
      ctx.constraints.map((d) => d.statement),
      ['Under 20 euros.'],
    )
    assert.equal(ctx.decided.find((d) => d.id === cheap.decisionId)?.state, 'superseded')
  })

  it('two replacements of one decision: the second acceptance is a conflict, never two in its place', async () => {
    const { projectId } = await project()
    const cheap = await propose(E, projectId, { kind: 'constraint', statement: 'Under 30 euros.' })
    await decide(A, projectId, cheap.decisionId!, { decision: 'accept', expectedRevision: 1 })
    const replace = (statement: string) =>
      propose(E, projectId, { kind: 'constraint', statement, supersedesDecisionId: cheap.decisionId! })
    const first = await replace('Under 20 euros.')
    const second = await replace('Free.')
    await decide(A, projectId, first.decisionId!, { decision: 'accept', expectedRevision: 1 })
    assert.equal(
      await codeOf(decide(A, projectId, second.decisionId!, { decision: 'accept', expectedRevision: 1 })),
      'stale_revision',
    )
    const ctx = await context(A, projectId)
    assert.deepEqual(
      ctx.constraints.map((d) => d.statement),
      ['Under 20 euros.'],
    )
    assert.equal(ctx.pending.find((d) => d.id === second.decisionId)?.state, 'proposed', 'nothing was decided')
  })

  it('two proposals from one mission revision: the second acceptance is a conflict, never a silent overwrite', async () => {
    const { projectId } = await project()
    const one = await propose(E, projectId, { kind: 'mission', statement: 'First direction.' })
    const two = await propose(F, projectId, { kind: 'mission', statement: 'Second direction.' })
    await decide(A, projectId, one.decisionId!, { decision: 'accept', expectedRevision: 1 })
    assert.equal((await context(A, projectId)).pending.find((d) => d.id === two.decisionId)?.stale, true)
    assert.equal(
      await codeOf(decide(A, projectId, two.decisionId!, { decision: 'accept', expectedRevision: 1 })),
      'stale_revision',
    )
    assert.equal((await context(A, projectId)).mission?.statement, 'First direction.')
  })

  it('concurrent decisions on one proposal: exactly one commits', async () => {
    const { projectId } = await project()
    const p = await propose(E, projectId, { kind: 'lesson', statement: 'Test with five people before building.' })
    const outcomes = await Promise.all([
      codeOf(decide(A, projectId, p.decisionId!, { decision: 'accept', expectedRevision: 1 })),
      codeOf(decide(E, projectId, p.decisionId!, { decision: 'reject', expectedRevision: 1 })),
      codeOf(decide(F, projectId, p.decisionId!, { decision: 'accept', expectedRevision: 1 })),
    ])
    assert.equal(outcomes.filter((o) => o === 'resolved').length, 1, outcomes.join(', '))
    assert.equal(outcomes.filter((o) => o === 'stale_revision').length, 2, outcomes.join(', '))
  })

  it('concurrent corrections of one note: exactly one supersedes it', async () => {
    const { projectId } = await project()
    const n = await note(E, projectId, observation('Original wording'))
    const outcomes = await Promise.all(
      [E, F, A].map((actor, i) =>
        codeOf(note(actor, projectId, { ...observation(`Correction ${String(i)}`), correctsEntryId: n.entryId })),
      ),
    )
    assert.equal(outcomes.filter((o) => o === 'resolved').length, 1, outcomes.join(', '))
    assert.equal((await context(A, projectId)).entries.length, 1)
  })
})

describe('mission ledger: voice notes follow the note policy (T09)', () => {
  it('capture off, consent unset or declined, a turn that binds someone else, or a paused exchange write nothing', async () => {
    const { projectId } = await project()
    const turn = await exchange(E, projectId)
    const voiceNote = (actor: string, t: MissionTurn) =>
      note(actor, projectId, { ...observation('Heard in the room'), turn: t })
    await capture(projectId, false, 0)
    assert.equal(await codeOf(voiceNote(E, turn)), 'note_policy_denied', 'explicit project capture off')
    assert.equal((await context(E, projectId, 'voice')).capabilities.recordNote.available, false)
    await capture(projectId, true, 1)
    assert.equal(await codeOf(voiceNote(E, turn)), 'note_policy_denied', 'the speaker has not consented')
    await consent(E, projectId, 'accepted')
    const saved = await voiceNote(E, turn)
    const entry = (await context(A, projectId)).entries.find((e) => e.id === saved.entryId)
    assert.deepEqual(
      [entry?.actorId, entry?.authoredBy, entry?.origin, entry?.textKind, entry?.exchangeId, entry?.inputEpoch],
      [E, 'sophia', 'voice', 'sophia_paraphrase', turn.exchangeId, turn.inputEpoch],
    )
    assert.equal(await codeOf(voiceNote(F, turn)), 'forbidden', 'the epoch binds E, not F')
    await consent(E, projectId, 'declined')
    assert.equal(await codeOf(voiceNote(E, turn)), 'note_policy_denied', 'a declined consent stops capture')
    await consent(E, projectId, 'accepted')
    await owner(`UPDATE sophia.room_exchanges SET state='paused', pause_reason='guest' WHERE id=$1`, [turn.exchangeId])
    assert.equal(await codeOf(voiceNote(E, turn)), 'invalid_state', 'a guest pause writes nothing')
    await capture(projectId, false, 2)
    await owner(`UPDATE sophia.room_exchanges SET state='open', pause_reason=NULL WHERE id=$1`, [turn.exchangeId])
    assert.equal(await codeOf(voiceNote(E, turn)), 'note_policy_denied', 'capture turned off again')
  })

  it('only an admin sets capture, at the revision they saw; each member sets only their own consent', async () => {
    const { projectId } = await project()
    assert.equal(
      await codeOf(withActor(pool, E, 'write', (c) => setMissionNotePolicy(c, projectId, 'automatic', 0))),
      'forbidden',
    )
    await capture(projectId, true, 0)
    assert.equal(await codeOf(capture(projectId, false, 0)), 'stale_revision')
    await consent(V, projectId, 'accepted')
    const ctx = await context(V, projectId)
    assert.deepEqual(
      [ctx.notePolicy.capture, ctx.notePolicy.revision, ctx.notePolicy.consent, ctx.notePolicy.acceptedMembers],
      ['automatic', 1, 'accepted', 1],
    )
    assert.equal(ctx.notePolicy.exactTextRetention, false)
    assert.deepEqual(ctx.notePolicy.transientBuffer, { turns: 0, bytes: 0, seconds: 0 })
    assert.equal((await context(E, projectId)).notePolicy.consent, 'unset', 'consent is per member')
  })
})

describe('mission ledger: a voice decision binds to the proposal put to that speaker (T08)', () => {
  async function voiceProposal() {
    const { projectId } = await project()
    await consent(E, projectId, 'accepted')
    const turn = await exchange(E, projectId)
    const put: MissionTurn = { ...turn, connectionGeneration: 7, utterance: 3 }
    const p = await propose(E, projectId, { kind: 'mission', statement: 'Workshops near you.', turn: put })
    return { projectId, turn, put, decisionId: p.decisionId! }
  }
  const answer = (projectId: string, decisionId: string, t: MissionTurn, actor = E, expectedRevision = 1) =>
    decide(actor, projectId, decisionId, { decision: 'accept', expectedRevision, turn: t })

  it('an answer in the same utterance is refused; the next utterance commits once and clears the target', async () => {
    const { projectId, put, decisionId } = await voiceProposal()
    const target = await withActor(pool, E, 'read', (c) => readConfirmationTarget(c, put.exchangeId))
    assert.deepEqual([target?.decisionId, target?.actorId, target?.inputEpoch], [decisionId, E, put.inputEpoch])
    assert.equal(await codeOf(answer(projectId, decisionId, put)), 'confirmation_required', 'no answer yet')
    const key = randomUUID()
    const later = { ...put, utterance: 4 }
    const committed = await decide(
      E,
      projectId,
      decisionId,
      { decision: 'accept', expectedRevision: 1, turn: later },
      key,
    )
    assert.deepEqual([committed.decision, committed.missionRevision], ['accepted', 2])
    assert.deepEqual(
      await decide(E, projectId, decisionId, { decision: 'accept', expectedRevision: 1, turn: later }, key),
      committed,
      'a retried call returns the same receipt',
    )
    assert.equal(await withActor(pool, E, 'read', (c) => readConfirmationTarget(c, put.exchangeId)), null)
  })

  it('a speaker switch, a restarted provider session, an expired or replaced target, or a stale revision is refused', async () => {
    const { projectId, put, decisionId } = await voiceProposal()
    const later = { ...put, utterance: 4 }
    assert.equal(
      await codeOf(answer(projectId, decisionId, { ...later, connectionGeneration: 8 })),
      'confirmation_required',
    )
    assert.equal(await codeOf(answer(projectId, decisionId, later, E, 2)), 'stale_revision')
    await owner(
      `UPDATE sophia.mission_confirmation_targets SET expires_at=now()-interval '1 second' WHERE exchange_id=$1`,
      [put.exchangeId],
    )
    assert.equal(await codeOf(answer(projectId, decisionId, later)), 'confirmation_required', 'expired')
    await withActor(pool, E, 'write', (c) => presentMissionProposal(c, projectId, decisionId, put))
    const other = await propose(E, projectId, { kind: 'constraint', statement: 'Free for learners.', turn: put })
    assert.equal(
      await codeOf(answer(projectId, decisionId, later)),
      'confirmation_required',
      'replaced by another proposal',
    )
    const toF = await passFloor(projectId, E, F, put.exchangeId)
    assert.equal(
      await codeOf(answer(projectId, other.decisionId!, { ...toF, connectionGeneration: 7, utterance: 5 }, F)),
      'confirmation_required',
      'put to E, answered by F',
    )
    const backToE = await passFloor(projectId, F, E, put.exchangeId)
    assert.equal(
      await codeOf(answer(projectId, other.decisionId!, { ...backToE, connectionGeneration: 7, utterance: 6 })),
      'confirmation_required',
      'E again, but in a new input epoch: it must be put again',
    )
    await withActor(pool, E, 'write', (c) =>
      presentMissionProposal(c, projectId, other.decisionId!, { ...backToE, connectionGeneration: 7, utterance: 6 }),
    )
    const accepted = await answer(projectId, other.decisionId!, { ...backToE, connectionGeneration: 7, utterance: 7 })
    assert.equal(accepted.decision, 'accepted')
  })

  it('a call from an input epoch the floor has left is refused, even by the same speaker at the same target', async () => {
    const { projectId, put, decisionId } = await voiceProposal()
    await capture(projectId, true, 0)
    // The speaker's "yes" was said in epoch 1, but its call arrives after the floor moved: nothing it asks commits.
    await passFloor(projectId, E, F, put.exchangeId)
    const late = { ...put, utterance: 4 }
    assert.equal(await codeOf(answer(projectId, decisionId, late)), 'stale_revision', 'a decision')
    assert.equal(
      await codeOf(note(E, projectId, { ...observation('Said before the handoff.'), turn: late })),
      'stale_revision',
      'a note',
    )
    assert.equal(
      await codeOf(propose(E, projectId, { kind: 'constraint', statement: 'Said before the handoff.', turn: late })),
      'stale_revision',
      'a proposal',
    )
    assert.equal(
      await codeOf(withActor(pool, E, 'write', (c) => presentMissionProposal(c, projectId, decisionId, late))),
      'stale_revision',
      'putting a proposal',
    )
    const rows = await owner<{ state: string }>(`SELECT state FROM sophia.decisions WHERE project_id=$1`, [projectId])
    assert.deepEqual(
      rows.map((r) => r.state),
      ['proposed'],
    )
    const entries = await owner<{ n: string }>(`SELECT count(*) AS n FROM sophia.mission_entries WHERE project_id=$1`, [
      projectId,
    ])
    assert.equal(entries[0]!.n, '0')
  })

  it('a viewer holding the floor cannot decide, and a Studio decision needs no turn', async () => {
    const { projectId, put, decisionId } = await voiceProposal()
    const toV = await passFloor(projectId, E, V, put.exchangeId)
    assert.equal(
      await codeOf(answer(projectId, decisionId, { ...toV, connectionGeneration: 7, utterance: 9 }, V)),
      'forbidden',
    )
    const manual = await decide(A, projectId, decisionId, { decision: 'reject', expectedRevision: 1 })
    assert.equal(manual.decision, 'rejected')
    const rows = await owner<{ decided_via: string; decided_by: string; accepted_by: string | null }>(
      `SELECT decided_via, decided_by, accepted_by FROM sophia.decisions WHERE id=$1`,
      [decisionId],
    )
    assert.deepEqual(rows[0], { decided_via: 'studio', decided_by: A, accepted_by: null })
  })
})

describe('mission ledger: withdrawal forgets, and eligibility narrows (T12)', () => {
  it('the text is erased, the source is ineligible, the eligibility revision moves, and no read returns it', async () => {
    const { projectId } = await project()
    const n = await note(E, projectId, observation('A private remark that should not stay.'))
    const earlier = await context(E, projectId)
    const receipt = await forget(E, projectId, n.entryId!)
    assert.equal(receipt.eligibilityRevision, earlier.eligibilityRevision + 1)
    const texts = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.source_texts WHERE project_id=$1 AND source_id=$2`,
      [projectId, n.sourceId],
    )
    assert.equal(texts[0]!.n, '0', 'the text is gone from the database')
    const source = await owner<{ eligible: boolean; state: string }>(
      `SELECT eligible, state FROM sophia.source_objects WHERE id=$1`,
      [n.sourceId],
    )
    assert.deepEqual(source[0], { eligible: false, state: 'deleted' })
    const ctx = await context(E, projectId)
    assert.equal(ctx.entries.length, 0)
    assert.deepEqual(
      ctx.history.map((e) => [e.id, e.state, e.text, e.sha256]),
      [[n.entryId, 'withdrawn', null, null]],
    )
    const read = await withActor(pool, E, 'read', (c) => readMissionSource(c, projectId, 'entry', n.entryId!))
    assert.deepEqual([read?.state, read?.text], ['withdrawn', null])
    assert.ok(!JSON.stringify(ctx).includes('private remark'))
    assert.equal(await codeOf(withdraw(E, projectId, n.entryId!, [n.entryId!])), 'stale_revision')
  })

  it('what was derived from the note goes with it: its versions, the proposals citing it, an accepted mission', async () => {
    const { projectId } = await project()
    const first = await note(E, projectId, observation('Kids learn best in groups of five.'))
    const fixed = await note(E, projectId, {
      ...observation('Kids learn best in groups of four.'),
      correctsEntryId: first.entryId!,
    })
    // The mission repeats the corrected note's words and cites it; a pending constraint cites the original.
    const mission = await propose(E, projectId, {
      kind: 'mission',
      statement: 'Kids learn best in groups of four.',
      supportingEntryIds: [fixed.entryId!],
    })
    await decide(A, projectId, mission.decisionId!, { decision: 'accept', expectedRevision: 1 })
    const cited = await propose(E, projectId, {
      kind: 'constraint',
      statement: 'Groups of five, never more.',
      supportingEntryIds: [first.entryId!],
    })
    const unrelated = await propose(E, projectId, { kind: 'lesson', statement: 'Book the hall early.' })

    const receipt = await forget(E, projectId, first.entryId!)
    assert.deepEqual(receipt.affected, [first.entryId, fixed.entryId, mission.decisionId, cited.decisionId])

    const sources = [first.sourceId, fixed.sourceId, mission.sourceId, cited.sourceId]
    const texts = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.source_texts WHERE project_id=$1 AND source_id=ANY($2::uuid[])`,
      [projectId, sources],
    )
    assert.equal(texts[0]!.n, '0', 'every derived text is erased')
    const states = await owner<{ id: string; state: string; proposal: unknown }>(
      `SELECT id, state, proposal FROM sophia.decisions WHERE project_id=$1 ORDER BY created_at`,
      [projectId],
    )
    assert.deepEqual(
      states.map((d) => [d.id, d.state, d.proposal === null]),
      [
        [mission.decisionId, 'withdrawn', true],
        [cited.decisionId, 'withdrawn', true],
        [unrelated.decisionId, 'proposed', false],
      ],
    )
    const everything = JSON.stringify(
      await owner(
        `SELECT (SELECT jsonb_agg(frame) FROM sophia.project_revisions WHERE project_id=$1) AS frames,
                (SELECT jsonb_agg(d) FROM sophia.decisions d WHERE project_id=$1) AS decisions,
                (SELECT jsonb_agg(t.body) FROM sophia.source_texts t WHERE project_id=$1) AS texts,
                (SELECT jsonb_agg(r) FROM sophia.mission_requests r WHERE project_id=$1) AS requests`,
        [projectId],
      ),
    )
    assert.ok(!/groups of|five|four/i.test(everything), 'no copy of the words is left in the database')

    const ctx = await context(E, projectId, 'voice')
    assert.equal(ctx.mission, null, 'the accepted mission it produced is forgotten too')
    assert.equal(ctx.excluded.legacyFrame, false)
    assert.deepEqual(
      ctx.pending.map((d) => d.id),
      [unrelated.decisionId],
    )
    assert.deepEqual(
      ctx.history.map((e) => [e.state, e.text]),
      [
        ['withdrawn', null],
        ['withdrawn', null],
      ],
    )
    assert.ok(!/groups of|five|four/i.test(JSON.stringify(ctx)))
    const read = await withActor(pool, E, 'read', (c) =>
      readMissionSource(c, projectId, 'decision', mission.decisionId!),
    )
    assert.deepEqual([read?.state, read?.text, read?.sha256], ['withdrawn', null, null])
  })

  it('no digest of the forgotten text is left to guess it by; a replay under its key is stale, whatever its text', async () => {
    const { projectId } = await project()
    const words = 'Yes.'
    const digest = createHash('sha256').update(words).digest('hex')
    const key = randomUUID()
    const n = await note(E, projectId, observation(words), key)
    await forget(E, projectId, n.entryId!)
    const rows = JSON.stringify(
      await owner(
        `SELECT (SELECT jsonb_agg(s) FROM sophia.source_objects s WHERE project_id=$1) AS sources,
                (SELECT jsonb_agg(r) FROM sophia.mission_requests r WHERE project_id=$1) AS requests,
                (SELECT jsonb_agg(e) FROM sophia.project_events e WHERE project_id=$1) AS events,
                (SELECT jsonb_agg(f.frame) FROM sophia.project_revisions f WHERE project_id=$1) AS frames`,
        [projectId],
      ),
    )
    assert.ok(!rows.includes(digest), 'the text’s SHA-256 is gone')
    const size = await owner<{ byte_length: string }>(`SELECT byte_length FROM sophia.source_objects WHERE id=$1`, [
      n.sourceId,
    ])
    assert.equal(size[0]!.byte_length, '0')
    // What the key wrote is forgotten: a retry is told so, never that its text was saved (CX-0005 F1).
    assert.equal(await codeOf(note(E, projectId, observation(words), key)), 'stale_revision', 'the same text')
    assert.equal(
      await codeOf(note(E, projectId, observation('Something new.'), key)),
      'stale_revision',
      'changed text under the same key',
    )
    const entries = await owner<{ n: string }>(`SELECT count(*) AS n FROM sophia.mission_entries WHERE project_id=$1`, [
      projectId,
    ])
    assert.equal(entries[0]!.n, '1')
  })

  it('a member forgets back to their own earliest wording, past another member’s correction in between', async () => {
    const { projectId } = await project()
    // E1 -> F2 -> E3: E forgetting E3 reaches E1, and F2 is derived from E1, so it goes too.
    const e1 = await note(E, projectId, observation('The hall seats forty.'))
    const f2 = await note(F, projectId, { ...observation('The hall seats forty-five.'), correctsEntryId: e1.entryId! })
    const e3 = await note(E, projectId, { ...observation('The hall seats fifty.'), correctsEntryId: f2.entryId! })
    const receipt = await forget(E, projectId, e3.entryId!)
    assert.deepEqual(receipt.affected, [e1.entryId, f2.entryId, e3.entryId])
    // F1 -> E2: E forgetting E2 leaves F's original wording, which is F's.
    const f1 = await note(F, projectId, observation('Parking is free on Sundays.'))
    const e2 = await note(E, projectId, {
      ...observation('Parking is free on weekends.'),
      correctsEntryId: f1.entryId!,
    })
    const second = await forget(E, projectId, e2.entryId!)
    assert.deepEqual(second.affected, [e2.entryId])
    const ctx = await context(E, projectId)
    assert.deepEqual(
      ctx.history.filter((e) => e.text !== null).map((e) => [e.id, e.state, e.text]),
      [[f1.entryId, 'superseded', 'Parking is free on Sundays.']],
    )
  })

  it('a proposal that repeats a note’s words cites it, without being told to, and goes with it', async () => {
    const { projectId } = await project()
    const long = await note(E, projectId, observation('Kids learn best in small groups of five children.'))
    const short = await note(E, projectId, observation('Book the hall early.'))
    const tiny = await note(E, projectId, observation('Yes please.'))
    const partial = await note(E, projectId, observation('The venue list comes from the city council office.'))
    const repeatsLong = await propose(F, projectId, {
      kind: 'mission',
      statement: 'We think kids learn best in small groups of five.',
    })
    const repeatsShort = await propose(F, projectId, {
      kind: 'lesson',
      statement: 'Always book the hall early in the term.',
    })
    const sharesTwoWords = await propose(F, projectId, { kind: 'constraint', statement: 'Yes please, keep it free.' })
    const sharesFiveWords = await propose(F, projectId, {
      kind: 'constraint',
      statement: 'The venue list comes from somewhere else.',
    })
    const cited = new Map((await context(F, projectId)).pending.map((d) => [d.id, d.supportingEntryIds]))
    assert.deepEqual(
      [repeatsLong, repeatsShort, sharesTwoWords, sharesFiveWords].map((p) => cited.get(p.decisionId!)),
      [[long.entryId], [short.entryId], [], []],
      'six words in a row, or the whole of a short note, is a citation; less is not',
    )
    assert.ok(tiny.entryId && partial.entryId)
    // Accented words match as they were written, in Italian or Spanish as in English.
    const italian = await note(E, projectId, observation('La sala è prenotata per venerdì sera alle otto.'))
    const repeatsItalian = await propose(F, projectId, {
      kind: 'constraint',
      statement: 'Ricordiamo: la sala è prenotata per venerdì sera.',
    })
    assert.deepEqual(
      (await context(F, projectId)).pending.find((d) => d.id === repeatsItalian.decisionId)?.supportingEntryIds,
      [italian.entryId],
    )
    const receipt = await forget(E, projectId, long.entryId!)
    assert.deepEqual(receipt.affected, [long.entryId, repeatsLong.decisionId])
    const pending = (await context(F, projectId)).pending.map((d) => d.id)
    assert.deepEqual(pending, [
      repeatsShort.decisionId,
      sharesTwoWords.decisionId,
      sharesFiveWords.decisionId,
      repeatsItalian.decisionId,
    ])
  })

  it('the preview names exactly what the withdrawal then erases, and only who may forget can ask', async () => {
    const { projectId } = await project()
    const first = await note(E, projectId, observation('Workshops should stay under two hours long.'))
    const fixed = await note(E, projectId, {
      ...observation('Workshops should stay under ninety minutes long.'),
      correctsEntryId: first.entryId!,
    })
    const mission = await propose(F, projectId, {
      kind: 'mission',
      statement: 'Short workshops.',
      purpose: 'Beginners stay to the end.',
      destination: 'A workshop every month.',
      origin: 'Half the room left the long ones.',
      supportingEntryIds: [fixed.entryId!],
    })
    await decide(A, projectId, mission.decisionId!, { decision: 'accept', expectedRevision: 1 })
    const shown = await preview(E, projectId, fixed.entryId!)
    assert.deepEqual(
      shown.entries.map((e) => [e.id, e.state, e.text]),
      [
        [first.entryId, 'superseded', 'Workshops should stay under two hours long.'],
        [fixed.entryId, 'current', 'Workshops should stay under ninety minutes long.'],
      ],
    )
    // Every field of a decision's words is shown, since every field is erased (CX-0007 F2).
    assert.deepEqual(
      shown.decisions.map((d) => [d.id, d.kind, d.state, d.revision, d.statement, d.purpose, d.destination, d.origin]),
      [
        [
          mission.decisionId,
          'mission',
          'accepted',
          2,
          'Short workshops.',
          'Beginners stay to the end.',
          'A workshop every month.',
          'Half the room left the long ones.',
        ],
      ],
    )
    assert.equal(await codeOf(preview(F, projectId, fixed.entryId!)), 'forbidden', 'another editor may not forget it')
    // A proposal that repeats the note arrives after the preview: the withdrawal bound to it erases nothing.
    const late = await propose(F, projectId, {
      kind: 'constraint',
      statement: 'Workshops should stay under ninety minutes long, always.',
    })
    assert.equal(
      await codeOf(
        withActor(pool, E, 'write', (c) =>
          withdrawMissionEntry(c, projectId, fixed.entryId!, randomUUID(), shownReach(shown)),
        ),
      ),
      'stale_revision',
      'what it would erase changed since it was shown',
    )
    const again = shownReach(await preview(E, projectId, fixed.entryId!))
    assert.deepEqual(again.expectedAffected, {
      entryIds: [first.entryId, fixed.entryId],
      decisions: [
        { id: mission.decisionId, revision: 2 },
        { id: late.decisionId, revision: 1 },
      ],
    })
    const receipt = await withActor(pool, E, 'write', (c) =>
      withdrawMissionEntry(c, projectId, fixed.entryId!, randomUUID(), again),
    )
    assert.deepEqual(receipt.affected, [first.entryId, fixed.entryId, mission.decisionId, late.decisionId])
  })

  it('a proposal decided after the preview is not erased under its unchanged id (CX-0007 F1)', async () => {
    const { projectId } = await project()
    const words = 'Families come on Saturday mornings, not in the evening.'
    const n = await note(E, projectId, observation(words))
    const mission = await propose(F, projectId, { kind: 'mission', statement: words })
    const shown = await preview(E, projectId, n.entryId!)
    assert.deepEqual(
      shown.decisions.map((d) => [d.id, d.state, d.revision]),
      [[mission.decisionId, 'proposed', 1]],
    )
    // The member is shown a pending proposal; before they confirm, it becomes the accepted mission. The ids are the same.
    await decide(A, projectId, mission.decisionId!, { decision: 'accept', expectedRevision: 1 })
    assert.equal(
      await codeOf(
        withActor(pool, E, 'write', (c) =>
          withdrawMissionEntry(c, projectId, n.entryId!, randomUUID(), shownReach(shown)),
        ),
      ),
      'stale_revision',
    )
    const kept = await context(E, projectId)
    assert.deepEqual([kept.mission?.statement, kept.entries.length], [words, 1], 'nothing was erased')
    const now = await preview(E, projectId, n.entryId!)
    assert.deepEqual(
      now.decisions.map((d) => [d.id, d.state, d.revision]),
      [[mission.decisionId, 'accepted', 2]],
    )
    const receipt = await withActor(pool, E, 'write', (c) =>
      withdrawMissionEntry(c, projectId, n.entryId!, randomUUID(), shownReach(now)),
    )
    assert.deepEqual(receipt.affected, [n.entryId, mission.decisionId])
    assert.equal((await context(E, projectId)).mission, null)
  })

  it('a withdrawal must name what the member was shown; without it nothing is erased (CX-0007 F4)', async () => {
    const { projectId } = await project()
    const n = await note(E, projectId, observation('The room is free on Tuesdays.'))
    // Nothing, an empty list, and the earlier flat list of ids are all refused before anything is read or erased.
    const unnamed = [undefined, {}, [n.entryId], { entryIds: [n.entryId] }]
    const codes = await Promise.all(
      unnamed.map((expected) =>
        codeOf(
          withActor(pool, E, 'write', (c) =>
            withdrawMissionEntry(c, projectId, n.entryId!, randomUUID(), {
              expectedAffected: expected as never,
              previewToken: madeUp,
            }),
          ),
        ),
      ),
    )
    assert.deepEqual(codes, ['invalid_request', 'invalid_request', 'invalid_request', 'invalid_request'])
    assert.equal((await context(E, projectId)).entries.length, 1)
  })

  it('a withdrawal needs the server’s proof that this member was shown this list for this note (CX-0008 F1)', async () => {
    const { projectId } = await project()
    const n = await note(E, projectId, observation('The workshop room has twelve chairs.'))
    const other = await note(E, projectId, observation('Bring the spare soldering irons.'))
    const mine = (await preview(E, projectId, n.entryId!)).previewToken
    // A list the member built by hand, without a proof or with a made-up one, erases nothing.
    assert.equal(await codeOf(withdraw(E, projectId, n.entryId!, [n.entryId!], '')), 'invalid_request', 'no proof')
    assert.equal(await codeOf(withdraw(E, projectId, n.entryId!, [n.entryId!])), 'invalid_request', 'a made-up proof')
    // Another note's proof, an admin's proof of this note, and this proof with its expiry pushed back are not it.
    const theirs = (await preview(A, projectId, n.entryId!)).previewToken
    const elsewhere = (await preview(E, projectId, other.entryId!)).previewToken
    const [version, expiry, tag] = mine.split('.')
    const later = `${String(version)}.${String(Number(expiry) + 3600)}.${String(tag)}`
    const codes = await Promise.all(
      [elsewhere, theirs, later].map((proof) => codeOf(withdraw(E, projectId, n.entryId!, [n.entryId!], proof))),
    )
    assert.deepEqual(codes, ['invalid_request', 'invalid_request', 'invalid_request'])
    // The server's own proof for this member, note and list, once expired, is stale.
    const expired = await owner<{ proof: string }>(
      `SELECT 'v1.'||x.e||'.'||sophia.mission_preview_tag($1::uuid,$2::uuid,$3::uuid,x.e,ARRAY[$2::uuid::text],'{}') AS proof
         FROM (SELECT floor(extract(epoch FROM now()))::bigint-1 AS e) x`,
      [projectId, n.entryId, E],
    )
    assert.equal(await codeOf(withdraw(E, projectId, n.entryId!, [n.entryId!], expired[0]!.proof)), 'stale_revision')
    assert.equal((await context(E, projectId)).entries.length, 2, 'nothing was erased')
    // The proof is HMAC-SHA256 under a key only the database holds, which sophia_api cannot read.
    const key = await owner<{ secret: Buffer }>(`SELECT secret FROM sophia_secrets.mission_preview_keys`)
    const message = ['sophia.mission-withdrawal-preview.v1', projectId, n.entryId, E, expiry, n.entryId, ''].join('|')
    assert.equal(tag, createHmac('sha256', key[0]!.secret).update(message).digest('hex'))
    assert.match(
      await codeOf(
        withActor(pool, E, 'read', (c) => c.query('SELECT secret FROM sophia_secrets.mission_preview_keys')),
      ),
      /forbidden|permission denied/,
    )
    // The member's own proof erases exactly the list it was issued for.
    const receipt = await withdraw(E, projectId, n.entryId!, [n.entryId!], mine)
    assert.deepEqual(receipt.affected, [n.entryId])
  })

  it('repeated words match in any Unicode form, within one field of the proposal, never across two', async () => {
    const { projectId } = await project()
    // The note is written with composed accents (NFC); the proposal repeats it with decomposed ones (NFD).
    const composed = 'La città è più bella di sera in estate.'
    const n = await note(E, projectId, observation(composed))
    const decomposed = await propose(F, projectId, { kind: 'constraint', statement: composed.normalize('NFD') })
    assert.notEqual(composed, composed.normalize('NFD'))
    // Three words end the statement and the next three begin the purpose: no single field repeats six in a row.
    const split = await propose(F, projectId, {
      kind: 'mission',
      statement: 'Our town: la città è',
      purpose: 'più bella di sera, we say.',
    })
    const cited = new Map((await context(F, projectId)).pending.map((d) => [d.id, d.supportingEntryIds]))
    assert.deepEqual(cited.get(decomposed.decisionId!), [n.entryId], 'the same words in another Unicode form')
    assert.deepEqual(cited.get(split.decisionId!), [], 'a run split across two fields is not a repeat')
  })

  it('compatibility forms stay other characters: ① is not 1, a full-width word is not the word (CX-0007 F3)', async () => {
    const { projectId } = await project()
    const n = await note(E, projectId, observation('Plan 1 now'))
    const circled = await propose(F, projectId, { kind: 'constraint', statement: 'Plan ① now' })
    const wide = await propose(F, projectId, { kind: 'constraint', statement: 'Ｐｌａｎ １ ｎｏｗ' })
    const same = await propose(F, projectId, { kind: 'constraint', statement: 'So: PLAN 1, now!' })
    const cited = new Map((await context(F, projectId)).pending.map((d) => [d.id, d.supportingEntryIds]))
    assert.deepEqual(
      [circled, wide, same].map((p) => cited.get(p.decisionId!)),
      [[], [], [n.entryId]],
      'literal words, canonical accents only; case and punctuation aside',
    )
  })
})

describe('mission ledger: revisions reach the media bridge', () => {
  it('the ledger revision moves with every write; assignments carry mission, ledger and eligibility revisions', async () => {
    const { projectId } = await project()
    const turn = await exchange(E, projectId)
    const first = await note(E, projectId, observation('One'))
    const second = await note(E, projectId, observation('Two'))
    assert.equal(second.ledgerRevision, first.ledgerRevision + 1)
    assert.equal(second.missionRevision, first.missionRevision, 'a note is not a mission pivot')
    const assignment = (await withService(pool, (c) => mediaAssignments(c))).find(
      (a) => a.exchangeId === turn.exchangeId,
    )
    assert.deepEqual(
      [assignment?.missionRevision, assignment?.ledgerRevision, assignment?.eligibilityRevision],
      [second.missionRevision, second.ledgerRevision, second.eligibilityRevision],
    )
  })

  it('a change to note capture or to a member’s consent moves the ledger revision, so a live guide re-reads it', async () => {
    const { projectId } = await project()
    const turn = await exchange(E, projectId)
    const ledger = async () =>
      (await withService(pool, (c) => mediaAssignments(c))).find((a) => a.exchangeId === turn.exchangeId)
        ?.ledgerRevision ?? 0
    const start = await ledger()
    await capture(projectId, true, 0)
    assert.equal(await ledger(), start + 1, 'capture turned on')
    await consent(E, projectId, 'accepted')
    assert.equal(await ledger(), start + 2, 'consent given')
    await consent(E, projectId, 'accepted')
    assert.equal(await ledger(), start + 2, 'the same choice again changes nothing')
    await consent(E, projectId, 'declined')
    await capture(projectId, false, 1)
    assert.equal(await ledger(), start + 4, 'consent withdrawn, then capture turned off')
  })
})

describe('owner amendment: team capture defaults and opt-outs', () => {
  it('a project with no policy enables structured capture but does not invent member consent', async () => {
    const { projectId } = await project()
    const initial = await context(E, projectId, 'voice')
    assert.equal(initial.notePolicy.capture, 'automatic')
    assert.equal(initial.notePolicy.revision, 0)
    assert.equal(initial.notePolicy.consent, 'unset')
    assert.equal(initial.capabilities.recordNote.available, false)
    await consent(E, projectId, 'declined')
    await capture(projectId, false, 0)
    const off = await context(E, projectId, 'voice')
    assert.equal(off.notePolicy.capture, 'off')
    assert.equal(off.notePolicy.consent, 'declined')
    assert.equal((await context(F, projectId)).notePolicy.consent, 'unset')
  })
})
