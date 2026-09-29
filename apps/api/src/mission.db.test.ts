// SMC-M01 crossing (level: sql-run): the mission routes and the guide's voice operations over real HTTP, the real
// API and PostgreSQL. Members call with synthetic Supabase tokens; voice calls go through /v1/media/tool-calls with the
// media-bridge capability, exactly as the bridge sends them. No model, LiveKit or Google is involved.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { MediaToolCall, NativeTaskRequest } from '@sophia/contracts'
import {
  parseMissionContext,
  parseMissionNotePolicy,
  parseMissionReceipt,
  parseMissionWithdrawalPreview,
} from '@sophia/contracts/validate'
import {
  admitNativeTask,
  createPool,
  readSnapshot,
  shownReach,
  startExchange,
  submitContribution,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { projectStatus } from './mission-tools.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-mission-tests-0123'
const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const O = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let base: string

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any

async function call(path: string, init: { method?: string; as?: string; body?: unknown; key?: string } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(init.as ? { authorization: `Bearer ${init.as === MEDIA_TOKEN ? MEDIA_TOKEN : await token(init.as)}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': init.key } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256 })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})
after(async () => {
  await app.close()
  await pool.end()
  await db.drop()
})

const project = () => seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
const missionOf = async (projectId: string, as = A) =>
  parseMissionContext((await call(`/api/v1/projects/${projectId}/mission`, { as })).json)

const typed = (projectId: string, as: string, body: unknown, key = randomUUID()) =>
  call(`/api/v1/projects/${projectId}/mission/entries`, { as, body, key })

describe('mission routes for members (A08)', () => {
  it('a member reads the mission context; an outsider is refused', async () => {
    const { projectId } = await project()
    const ctx = await missionOf(projectId, V)
    assert.deepEqual([ctx.readState, ctx.mission, ctx.capabilities.recordNote.available], ['present', null, false])
    assert.equal((await call(`/api/v1/projects/${projectId}/mission`, { as: O })).status, 403)
  })

  it('a typed note is recorded once per key; a changed request under the same key is a conflict; a viewer is refused', async () => {
    const { projectId } = await project()
    const body = { kind: 'observation', epistemic: 'observed', text: 'Five people tried it; three got lost.' }
    const key = randomUUID()
    const first = await typed(projectId, E, body, key)
    assert.equal(first.status, 202)
    const receipt = parseMissionReceipt(first.json)
    assert.deepEqual((await typed(projectId, E, body, key)).json, first.json)
    const reused = await typed(projectId, E, { ...body, text: 'Different' }, key)
    assert.deepEqual([reused.status, reused.json.code], [409, 'idempotency_conflict'])
    const viewer = await typed(projectId, V, body)
    assert.deepEqual([viewer.status, viewer.json.code], [403, 'forbidden'])
    const ctx = await missionOf(projectId)
    assert.deepEqual(
      ctx.entries.map((e) => [e.id, e.textKind, e.actorId]),
      [[receipt.entryId, 'member_text', E]],
    )
  })

  it('a correction supersedes; a withdrawal forgets every version of the note; neither repeats', async () => {
    const { projectId } = await project()
    const n = parseMissionReceipt(
      (await typed(projectId, E, { kind: 'blocker', epistemic: 'reported', text: 'Waiting on the venue list.' })).json,
    )
    const fixed = await call(`/api/v1/projects/${projectId}/mission/entries/${String(n.entryId)}/correction`, {
      as: E,
      key: randomUUID(),
      body: { kind: 'blocker', epistemic: 'reported', text: 'Waiting on the venue list from the city.' },
    })
    assert.equal(fixed.status, 202)
    const corrected = parseMissionReceipt(fixed.json)
    const path = `/api/v1/projects/${projectId}/mission/entries/${String(corrected.entryId)}/withdrawal`
    const shown = shownReach(parseMissionWithdrawalPreview((await call(path, { as: E })).json))
    const gone = await call(path, { as: E, key: randomUUID(), body: shown })
    assert.equal(gone.status, 202)
    assert.equal(parseMissionReceipt(gone.json).eligibilityRevision, corrected.eligibilityRevision + 1)
    const again = await call(path, { as: E, key: randomUUID(), body: shown })
    assert.deepEqual([again.status, again.json.code], [409, 'stale_revision'])
    const ctx = await missionOf(projectId)
    assert.equal(ctx.entries.length, 0)
    // The earlier wording was the same member's: forgetting the note forgets it too (CX-0004 F2).
    assert.deepEqual(
      ctx.history.map((e) => [e.state, e.text]),
      [
        ['withdrawn', null],
        ['withdrawn', null],
      ],
    )
  })

  it('before forgetting, a member sees exactly what goes with the note; only its author or an admin may ask', async () => {
    const { projectId } = await project()
    const n = parseMissionReceipt(
      (
        await typed(projectId, E, {
          kind: 'observation',
          epistemic: 'reported',
          text: 'Saturday mornings suit the families best.',
        })
      ).json,
    )
    // The proposal repeats six of the note's words in a row without naming it: it cites it all the same.
    const proposed = parseMissionReceipt(
      (
        await call(`/api/v1/projects/${projectId}/mission/proposals`, {
          as: A,
          key: randomUUID(),
          body: { kind: 'constraint', statement: 'Hold sessions when Saturday mornings suit the families best.' },
        })
      ).json,
    )
    const path = `/api/v1/projects/${projectId}/mission/entries/${String(n.entryId)}/withdrawal`
    const asked = await call(path, { as: E })
    assert.equal(asked.status, 200)
    const preview = parseMissionWithdrawalPreview(asked.json)
    assert.deepEqual(
      preview.entries.map((e) => [e.id, e.state, e.text]),
      [[n.entryId, 'current', 'Saturday mornings suit the families best.']],
    )
    assert.deepEqual(
      preview.decisions.map((d) => [d.id, d.kind, d.state, d.revision, d.statement, d.purpose]),
      [
        [
          proposed.decisionId,
          'constraint',
          'proposed',
          1,
          'Hold sessions when Saturday mornings suit the families best.',
          null,
        ],
      ],
    )
    const viewer = await call(path, { as: V })
    assert.deepEqual([viewer.status, viewer.json.code], [403, 'forbidden'])
    // A withdrawal must carry what was shown and the preview's proof (CX-0007 F4, CX-0008 F1): none, an empty list,
    // the earlier flat list, the list without its proof, or the list with a made-up proof is refused.
    const shown = shownReach(preview)
    const madeUp = `v1.9999999999.${'0'.repeat(64)}`
    const unnamed = await Promise.all(
      [
        {},
        { expectedAffected: {}, previewToken: shown.previewToken },
        { expectedAffected: [n.entryId, proposed.decisionId], previewToken: shown.previewToken },
        { expectedAffected: shown.expectedAffected },
        { ...shown, previewToken: madeUp },
      ].map(async (body) => {
        const res = await call(path, { as: E, key: randomUUID(), body })
        return `${String(res.status)} ${String(res.json.code)}`
      }),
    )
    assert.deepEqual(unnamed, [
      '422 invalid_request',
      '422 invalid_request',
      '422 invalid_request',
      '422 invalid_request',
      '422 invalid_request',
    ])
    // A list that no longer matches is refused, the one shown is erased.
    const wrong = await call(path, {
      as: E,
      key: randomUUID(),
      body: { ...shown, expectedAffected: { ...shown.expectedAffected, decisions: [] } },
    })
    assert.deepEqual([wrong.status, wrong.json.code], [409, 'stale_revision'])
    const gone = parseMissionReceipt((await call(path, { as: E, key: randomUUID(), body: shown })).json)
    assert.deepEqual(gone.affected, [n.entryId, proposed.decisionId])
    const again = await call(path, { as: E })
    assert.deepEqual([again.status, again.json.code], [409, 'stale_revision'], 'nothing left to forget')
  })

  it('a proposal waits; a member’s decision accepts it at its revision; a second decision is a conflict', async () => {
    const { projectId } = await project()
    const proposed = parseMissionReceipt(
      (
        await call(`/api/v1/projects/${projectId}/mission/proposals`, {
          as: E,
          key: randomUUID(),
          body: { kind: 'mission', statement: 'Workshops for beginners, nearby.', purpose: 'First steps feel safe.' },
        })
      ).json,
    )
    assert.equal(proposed.status, 'proposed')
    const decisionPath = `/api/v1/projects/${projectId}/mission/proposals/${String(proposed.decisionId)}/decision`
    const viewer = await call(decisionPath, {
      as: V,
      key: randomUUID(),
      body: { decision: 'accept', expectedRevision: 1 },
    })
    assert.equal(viewer.status, 403)
    const accepted = await call(decisionPath, {
      as: A,
      key: randomUUID(),
      body: { decision: 'accept', expectedRevision: 1 },
    })
    assert.equal(accepted.status, 202)
    assert.equal(parseMissionReceipt(accepted.json).missionRevision, 2)
    const twice = await call(decisionPath, {
      as: E,
      key: randomUUID(),
      body: { decision: 'reject', expectedRevision: 1 },
    })
    assert.deepEqual([twice.status, twice.json.code], [409, 'stale_revision'])
    const ctx = await missionOf(projectId, V)
    assert.deepEqual([ctx.mission?.statement, ctx.mission?.acceptedBy], ['Workshops for beginners, nearby.', A])
  })

  it('only an admin sets note capture; any member sets their own consent', async () => {
    const { projectId } = await project()
    const policyPath = `/api/v1/projects/${projectId}/mission/note-policy`
    const editor = await call(policyPath, { method: 'PUT', as: E, body: { capture: 'automatic', expectedRevision: 0 } })
    assert.equal(editor.status, 403)
    const on = await call(policyPath, { method: 'PUT', as: A, body: { capture: 'automatic', expectedRevision: 0 } })
    assert.equal(parseMissionNotePolicy(on.json).capture, 'automatic')
    const stale = await call(policyPath, { method: 'PUT', as: A, body: { capture: 'off', expectedRevision: 0 } })
    assert.equal(stale.status, 409)
    const mine = await call(`/api/v1/projects/${projectId}/mission/note-consent`, {
      method: 'PUT',
      as: V,
      body: { state: 'declined' },
    })
    assert.deepEqual(
      [parseMissionNotePolicy(mine.json).consent, parseMissionNotePolicy(mine.json).capture],
      ['declined', 'automatic'],
    )
  })
})

describe('the brief ritual is retired, and history stays (T14)', () => {
  it('new admission answers 410 before any write; an existing brief is still readable', async () => {
    const { projectId } = await project()
    await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const said = await withActor(pool, E, 'write', (c) =>
      submitContribution(c, projectId, randomUUID(), {
        source: null,
        text: 'Old point',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    // A brief admitted before M01, created through the database function that production already ran.
    const request: NativeTaskRequest = {
      kind: 'draft_brief',
      instruction: 'An old brief',
      contributionIds: [said.contributionId],
      expectedMissionRevision: 1,
    }
    const old = await withActor(pool, E, 'write', (c) => admitNativeTask(c, projectId, randomUUID(), request))
    const retired = await call(`/api/v1/projects/${projectId}/native-tasks`, {
      as: E,
      key: randomUUID(),
      body: request,
    })
    assert.deepEqual([retired.status, retired.json.code, retired.json.retry], [410, 'native_task_retired', 'never'])
    assert.match(retired.json.message, /talk the idea through with Sophia/)
    const jobs = await withActor(pool, E, 'read', (c) => readSnapshot(c, projectId))
    assert.deepEqual(
      jobs?.work.map((t) => t.id),
      [old.taskId],
      'nothing new was admitted',
    )
    const read = await call(`/api/v1/projects/${projectId}/native-tasks/${old.taskId}`, { as: V })
    assert.equal(read.status, 200)
    assert.equal(read.json.task.id, old.taskId)
  })
})

describe('the guide’s voice operations over /v1/media/tool-calls', () => {
  /** Open the room's exchange with `actor` holding the floor (the room presence check is the exchange suite's). */
  async function openedBy(actor: string, projectId: string) {
    const snap = await withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))
    assert.ok(snap)
    const receipt = await withActor(pool, actor, 'write', (c) =>
      startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
    )
    return receipt.exchangeId
  }
  let n = 0
  const voice = async (
    exchangeId: string,
    actorId: string,
    name: MediaToolCall['name'],
    args: object,
    utterance = 1,
  ) => {
    n += 1
    const body = {
      exchangeId,
      connectionGeneration: 3,
      callId: `c-${String(n)}`,
      name,
      args,
      inputEpoch: 1,
      actorId,
      utterance,
    }
    const res = await call('/v1/media/tool-calls', { as: MEDIA_TOKEN, body })
    assert.equal(res.status, 200, JSON.stringify(res.json))
    return res.json as { status: string; output: ResponseBody }
  }

  it('project_status tells an empty project from one with history, and reports an outage as unavailable (T02)', async () => {
    const created = await call('/api/v1/projects', { as: A, key: randomUUID(), body: { title: 'Blank' } })
    const projectId: string = created.json.projectId
    const exchangeId = await openedBy(A, projectId)
    const empty = await voice(exchangeId, A, 'project_status', {})
    assert.deepEqual([empty.status, empty.output.readState, empty.output.mission.state], ['ok', 'empty', 'absent'])
    await typed(projectId, A, { kind: 'continuity', epistemic: 'reported', text: 'We started with a question.' })
    const present = await voice(exchangeId, A, 'project_status', {})
    assert.equal(present.output.readState, 'present')
    assert.equal(present.output.notes[0].about, 'speaker')

    const broken = createPool('postgres://nobody:nothing@127.0.0.1:9/none', { max: 1, onIdleError: () => undefined })
    const call0: MediaToolCall = {
      exchangeId,
      connectionGeneration: 3,
      callId: 'x',
      name: 'project_status',
      args: {},
      inputEpoch: 1,
      actorId: A,
    }
    const outage = await projectStatus({ pool: broken, projectId, actorId: A, key: 'k', call: call0, args: {} })
    await broken.end()
    assert.deepEqual([outage.status, (outage.output as ResponseBody).readState], ['error', 'unavailable'])
  })

  it('a voice note follows the note policy and is kept as the speaker’s paraphrase (T03, T09)', async () => {
    const { projectId } = await project()
    const exchangeId = await openedBy(E, projectId)
    const args = { kind: 'expectation', epistemic: 'inferred', text: 'They expect the list to be sorted by distance.' }
    const off = await voice(exchangeId, E, 'record_mission_note', args)
    assert.deepEqual([off.status, off.output.reason], ['denied', 'Note capture is off for this project'])
    await call(`/api/v1/projects/${projectId}/mission/note-policy`, {
      method: 'PUT',
      as: A,
      body: { capture: 'automatic', expectedRevision: 0 },
    })
    await call(`/api/v1/projects/${projectId}/mission/note-consent`, {
      method: 'PUT',
      as: E,
      body: { state: 'accepted' },
    })
    const saved = await voice(exchangeId, E, 'record_mission_note', args)
    assert.equal(saved.status, 'committed')
    const status = await voice(exchangeId, E, 'project_status', {})
    const notes: Array<{ entryId: string; about: string; wording: string; kind: string }> = status.output.notes
    const note = notes.find((x) => x.entryId === saved.output.entryId)
    assert.ok(note)
    assert.deepEqual([note.about, note.wording, note.kind], ['speaker', 'sophia_paraphrase', 'expectation'])
    const read = await voice(exchangeId, E, 'read_selected_source', { entryId: saved.output.entryId })
    assert.deepEqual(
      [read.output.textKind, read.output.coverage, read.output.text],
      ['sophia_paraphrase', 'complete', args.text],
    )
  })

  it('a long source reads in pages marked partial, with a cursor to the rest (T13)', async () => {
    const { projectId } = await project()
    const exchangeId = await openedBy(E, projectId)
    const long = `${'Workshops near you. '.repeat(200)}The end.`
    const said = await withActor(pool, E, 'write', (c) =>
      submitContribution(c, projectId, randomUUID(), {
        source: null,
        text: long.slice(0, 4000),
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    const first = await voice(exchangeId, E, 'read_selected_source', { contributionId: said.contributionId })
    assert.deepEqual(
      [first.output.coverage, first.output.locator.start, first.output.locator.total],
      ['partial', 0, 4000],
    )
    assert.equal(typeof first.output.nextCursor, 'string')
    const rest = await voice(exchangeId, E, 'read_selected_source', {
      contributionId: said.contributionId,
      cursor: first.output.nextCursor,
    })
    assert.deepEqual([rest.output.coverage, rest.output.nextCursor, rest.output.locator.end], ['partial', null, 4000])
    assert.equal(first.output.text + rest.output.text, long.slice(0, 4000))
    const both = await voice(exchangeId, E, 'read_selected_source', {
      contributionId: said.contributionId,
      entryId: said.contributionId,
    })
    assert.equal(both.status, 'clarify', 'one source at a time')
  })

  it('a proposal read back to the speaker becomes the target; their answer in a later utterance decides it (T08)', async () => {
    const { projectId } = await project()
    const exchangeId = await openedBy(E, projectId)
    await call(`/api/v1/projects/${projectId}/mission/note-consent`, {
      method: 'PUT',
      as: E,
      body: { state: 'accepted' },
    })
    const typedProposal = parseMissionReceipt(
      (
        await call(`/api/v1/projects/${projectId}/mission/proposals`, {
          as: A,
          key: randomUUID(),
          body: { kind: 'mission', statement: 'A map of workshops.' },
        })
      ).json,
    )
    const read = await voice(exchangeId, E, 'read_selected_source', { decisionId: typedProposal.decisionId }, 4)
    assert.deepEqual([read.output.putToSpeaker, read.output.proposalRevision], [true, 1])
    const status = await voice(exchangeId, E, 'project_status', {}, 4)
    assert.deepEqual(
      [status.output.confirmationTarget.proposalId, status.output.confirmationTarget.putTo],
      [typedProposal.decisionId, 'speaker'],
    )
    const answer = { proposalId: typedProposal.decisionId, proposalRevision: 1, decision: 'accept' }
    const early = await voice(exchangeId, E, 'decide_mission_change', answer, 4)
    assert.equal(early.status, 'clarify', 'no answer was heard after it was put')
    const decided = await voice(exchangeId, E, 'decide_mission_change', answer, 5)
    assert.deepEqual(
      [decided.status, decided.output.decision, decided.output.missionRevision],
      ['committed', 'accepted', 2],
    )
    const later = await voice(exchangeId, E, 'project_status', {}, 5)
    assert.deepEqual(
      [later.output.mission.statement, later.output.mission.acceptedBy],
      ['A map of workshops.', 'speaker'],
    )
  })

  it('an operation the contract does not name is refused at the door (T22)', async () => {
    const { projectId } = await project()
    const exchangeId = await openedBy(E, projectId)
    for (const name of ['start_brief', 'start_research', 'assign_technical_lead']) {
      const body = { exchangeId, connectionGeneration: 1, callId: name, name, args: {}, inputEpoch: 1, actorId: E }
      assert.equal((await call('/v1/media/tool-calls', { as: MEDIA_TOKEN, body })).status, 422, name)
    }
  })
})
