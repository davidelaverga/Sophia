// PS-01 personal space (migration 0021, amendment A10), level: sql-run. Every call runs on the non-owner sophia_api
// login with a transaction-local actor, as the API does; the migration owner only seeds and inspects. The point of
// these tests is who reads what: a person's space is theirs alone, and a carried note is the only thing a project sees.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { PersonalReceipt } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  beginPersonalGreeting,
  carryPersonalNote,
  claimPersonalReply,
  createPool,
  decidePersonalSuggestion,
  erasePersonalSpace,
  failPersonalReply,
  forgetPersonalNote,
  keepPersonalNote,
  listProjects,
  readCompanionContext,
  readPersonalExport,
  readPersonalSpace,
  readPersonalTurnsAfter,
  readSnapshot,
  readWelcomeContext,
  recordPersonalGreeting,
  recordPersonalReply,
  releasePersonalGreeting,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
  withActor,
} from './index.ts'

const ANA = randomUUID() // the person whose space this is; an editor of the shared project
const ADMIN = randomUUID() // admin of the shared project
const OTHER = randomUUID() // another person with a space of their own, in no project
const FULL = randomUUID() // a space holding all the notes it can keep
const CARRIER = randomUUID() // someone who carried all the notes one person can carry
const MINE = randomUUID() // a member reading a project where others carried many notes
const PEER = randomUUID() // the member who carried them
const QUIET = randomUUID() // someone coming back after a quiet spell, asked for a welcome by two requests at once
const FENCED = randomUUID() // someone whose reply a stalled process tries to write after another took it over
const AGAIN = randomUUID() // someone whose welcome is asked for again under the same key while it is written
const LATE = randomUUID() // someone whose welcome fails once, then is written by a later attempt of the same key

let db: TestDatabase
let pool: pg.Pool
let projectId: string
let elsewhere: string // a project Ana is not a member of

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  projectId = (await seedProject(db.ownerUrl, { title: 'Launch plan', admin: ADMIN, editors: [ANA] })).projectId
  elsewhere = (await seedProject(db.ownerUrl, { title: 'Not hers', admin: ADMIN })).projectId
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

const write = <T>(actor: string, fn: (c: pg.PoolClient) => Promise<T>) => withActor(pool, actor, 'write', fn)
const read = <T>(actor: string, fn: (c: pg.PoolClient) => Promise<T>) => withActor(pool, actor, 'read', fn)
const key = () => randomUUID()

/** Until some statement in the database waits on a lock another transaction holds. */
async function untilSomeoneWaits(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    const rows = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    )
    if (rows[0]?.n !== '0') return
    await new Promise((r) => setTimeout(r, 30))
  }
  throw new Error('nothing waited on the held space')
}

/** What the API does for a pending turn: claim it, then write the reply under that claim. */
async function answerTurn(actor: string, turn: string, text: string, suggestion: string | null) {
  const claim = await write(actor, (c) => claimPersonalReply(c, turn))
  assert.ok(claim, 'the turn could be claimed')
  await write(actor, (c) => recordPersonalReply(c, turn, claim, text, suggestion))
}

type Begun = Awaited<ReturnType<typeof beginPersonalGreeting>>

/** The claim a welcome request got; the test fails when it got anything else. */
function claimOf(begun: Begun): string {
  assert.ok(typeof begun === 'object' && 'claim' in begun, JSON.stringify(begun))
  return begun.claim
}

/** The receipt a welcome request got; the test fails when it got anything else. */
function receiptOf(got: Begun): PersonalReceipt {
  assert.ok(typeof got === 'object' && !('claim' in got), JSON.stringify(got))
  return got
}

/** Ana says something and Sophia answers, suggesting a note. Returns the two turns' ids and the suggestion's. */
async function exchange(text: string, reply: string, suggestion: string | null) {
  const sent = await write(ANA, (c) => sendPersonalTurn(c, key(), text))
  assert.ok(sent.turnId)
  await answerTurn(ANA, sent.turnId ?? '', reply, suggestion)
  const space = await read(ANA, (c) => readPersonalSpace(c))
  const answer = space.turns.find((t) => t.replyTo === sent.turnId)
  assert.ok(answer)
  return { asked: sent.turnId ?? '', answer, suggestionId: answer.suggestion?.id ?? null }
}

describe('personal space: one conversation, owner-only', () => {
  it('keeps a turn, waits for the reply, then shows both in order', async () => {
    const k = key()
    const sent = await write(ANA, (c) => sendPersonalTurn(c, k, 'I have a pitch on Friday'))
    assert.equal(sent.operation, 'send_turn')
    assert.equal(sent.seq, 1)
    // The same key returns the same receipt; the same key with other words is refused.
    assert.deepEqual(await write(ANA, (c) => sendPersonalTurn(c, k, 'I have a pitch on Friday')), sent)
    assert.equal(await codeOf(write(ANA, (c) => sendPersonalTurn(c, k, 'Something else'))), 'idempotency_conflict')

    const waiting = await read(ANA, (c) => readPersonalTurnsAfter(c, 0))
    assert.equal(waiting.pending, true)
    assert.equal(waiting.turns[0]?.reply, 'pending')

    await answerTurn(ANA, sent.turnId ?? '', 'Which part feels least ready?', 'Pitch on Friday')
    // A second reply to an answered turn changes nothing.
    await write(ANA, (c) => recordPersonalReply(c, sent.turnId ?? '', randomUUID(), 'A different reply', null))
    const page = await read(ANA, (c) => readPersonalTurnsAfter(c, 0))
    assert.equal(page.pending, false)
    assert.deepEqual(
      page.turns.map((t) => [t.seq, t.author, t.text]),
      [
        [1, 'person', 'I have a pitch on Friday'],
        [2, 'sophia', 'Which part feels least ready?'],
      ],
    )
    assert.equal(page.turns[0]?.reply, 'answered')
    assert.equal(page.turns[1]?.suggestion?.text, 'Pitch on Friday')
    assert.equal(page.turns[1]?.suggestion?.state, 'open')
  })

  it('shows nothing of it to anyone else: another person, a project admin, a project member', async () => {
    for (const actor of [OTHER, ADMIN]) {
      const space = await read(actor, (c) => readPersonalSpace(c))
      assert.deepEqual([space.turns.length, space.notes.length, space.releases.length], [0, 0, 0], actor)
      const rows = await read(actor, async (c) => {
        const counts = await c.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM sophia.personal_turns) + (SELECT count(*) FROM sophia.personal_suggestions)
                + (SELECT count(*) FROM sophia.personal_notes) + (SELECT count(*) FROM sophia.personal_spaces) AS n`,
        )
        return Number(counts.rows[0]?.n)
      })
      assert.equal(rows, 0, `${actor} reads no personal row`)
    }
    // Ana's rows exist: the owner sees them.
    assert.ok((await owner<{ n: string }>('SELECT count(*) AS n FROM sophia.personal_turns'))[0]?.n !== '0')
  })

  it("never lets the API role write a personal table, and never lets one person answer another's turn", async () => {
    for (const sql of [
      `INSERT INTO sophia.personal_notes(owner_id, body, kept_by) VALUES ('${ANA}', 'x', 'person')`,
      `UPDATE sophia.personal_turns SET body = 'x'`,
      `DELETE FROM sophia.personal_turns`,
    ]) {
      assert.match(await codeOf(write(ANA, (c) => c.query(sql))), /forbidden|raw:.*permission denied/)
    }
    const sent = await write(ANA, (c) => sendPersonalTurn(c, key(), 'Still there?'))
    assert.equal(
      await codeOf(write(OTHER, (c) => recordPersonalReply(c, sent.turnId ?? '', randomUUID(), 'Not yours', null))),
      'not_found',
    )
    assert.equal(await read(OTHER, (c) => readCompanionContext(c, sent.turnId ?? '')), null)
    const context = await read(ANA, (c) => readCompanionContext(c, sent.turnId ?? ''))
    assert.equal(context?.asked.text, 'Still there?')
    assert.equal(context?.history.at(-1)?.text, 'Still there?')
    const claim = await write(ANA, (c) => claimPersonalReply(c, sent.turnId ?? ''))
    assert.ok(claim)
    await write(ANA, (c) => failPersonalReply(c, sent.turnId ?? '', claim))
    const failed = await read(ANA, (c) => readPersonalTurnsAfter(c, 0))
    assert.equal(failed.turns.find((t) => t.id === sent.turnId)?.reply, 'failed')
    assert.equal(failed.pending, false)
    await write(ANA, (c) => retryPersonalTurn(c, key(), sent.turnId ?? ''))
    assert.equal((await read(ANA, (c) => readPersonalTurnsAfter(c, 0))).pending, true)
    await answerTurn(ANA, sent.turnId ?? '', 'Here.', null)
  })

  it('lets one process answer a turn at a time: a claim lapses after two minutes, asking again clears it', async () => {
    const sent = await write(OTHER, (c) => sendPersonalTurn(c, key(), 'Answer me once'))
    const turn = sent.turnId ?? ''
    const first = await write(OTHER, (c) => claimPersonalReply(c, turn))
    assert.ok(first)
    assert.equal(await write(OTHER, (c) => claimPersonalReply(c, turn)), null, 'another process leaves it')
    assert.equal(await write(ANA, (c) => claimPersonalReply(c, turn)), null, 'and nobody claims another’s turn')
    await owner(`UPDATE sophia.personal_turns SET answering_since = now() - interval '3 minutes' WHERE id = $1`, [turn])
    const taken = await write(OTHER, (c) => claimPersonalReply(c, turn))
    assert.ok(taken && taken !== first, 'a lapsed claim is taken over, under a claim of its own')
    await write(OTHER, (c) => failPersonalReply(c, turn, taken))
    assert.equal(await write(OTHER, (c) => claimPersonalReply(c, turn)), null, 'not once failed')
    await write(OTHER, (c) => retryPersonalTurn(c, key(), turn))
    await answerTurn(OTHER, turn, 'Once.', null) // asking again clears the claim
  })

  it('fences a reply and a failure to the claim that asked: a lapsed attempt writes neither', async () => {
    const sent = await write(FENCED, (c) => sendPersonalTurn(c, key(), 'Who answers me?'))
    const turn = sent.turnId ?? ''
    const stalled = await write(FENCED, (c) => claimPersonalReply(c, turn))
    assert.ok(stalled)
    // That process stalled past its claim and the wait; the person asked again, and another process claimed it.
    await owner(
      `UPDATE sophia.personal_turns SET asked_at = now() - interval '3 minutes',
        answering_since = now() - interval '3 minutes' WHERE id = $1`,
      [turn],
    )
    await write(FENCED, (c) => retryPersonalTurn(c, key(), turn))
    // Asking again cleared the old claim: before another process claims the turn, the stalled one writes nothing.
    await write(FENCED, (c) => recordPersonalReply(c, turn, stalled, 'Too late.', null))
    const replacing = await write(FENCED, (c) => claimPersonalReply(c, turn))
    assert.ok(replacing && replacing !== stalled)
    await write(FENCED, (c) => failPersonalReply(c, turn, stalled))
    await write(FENCED, (c) => recordPersonalReply(c, turn, stalled, 'Too late.', null))
    const waiting = await read(FENCED, (c) => readPersonalTurnsAfter(c, 0))
    assert.deepEqual([waiting.turns.find((t) => t.id === turn)?.reply, waiting.pending], ['pending', true])
    await write(FENCED, (c) => recordPersonalReply(c, turn, replacing, 'Here.', null))
    const replies = (await read(FENCED, (c) => readPersonalSpace(c))).turns.filter((t) => t.replyTo === turn)
    assert.deepEqual(
      replies.map((t) => t.text),
      ['Here.'],
    )
  })

  it('takes a retry that races its first attempt in turn: the same receipt, and one turn', async () => {
    const k = key()
    const held = Promise.withResolvers<void>()
    const written = Promise.withResolvers<void>()
    // The first attempt writes and keeps its transaction open (its reply was lost on the way back).
    const first = write(ANA, async (c) => {
      const receipt = await sendPersonalTurn(c, k, 'Racing myself')
      written.resolve()
      await held.promise
      return receipt
    })
    await written.promise
    const second = write(ANA, (c) => sendPersonalTurn(c, k, 'Racing myself'))
    await untilSomeoneWaits()
    held.resolve()
    const [a, b] = await Promise.all([first, second])
    assert.deepEqual(b, a)
    const turns = (await read(ANA, (c) => readPersonalSpace(c))).turns.filter((t) => t.text === 'Racing myself')
    assert.equal(turns.length, 1)
    await answerTurn(ANA, a.turnId ?? '', 'Only once.', null)
  })

  it('reads a wait that outlasted any answer as failed, and lets her ask again from then', async () => {
    const sent = await write(ANA, (c) => sendPersonalTurn(c, key(), 'Are you there?'))
    const id = sent.turnId ?? ''
    assert.equal(await codeOf(write(ANA, (c) => retryPersonalTurn(c, key(), id))), 'stale_revision', 'still waiting')
    // The process answering it went away (a deploy, a crash) and nothing marked it failed.
    await owner(`UPDATE sophia.personal_turns SET asked_at = now() - interval '121 seconds' WHERE id = $1`, [id])
    const lost = await read(ANA, (c) => readPersonalTurnsAfter(c, 0))
    assert.deepEqual([lost.turns.find((t) => t.id === id)?.reply, lost.pending], ['failed', false])
    assert.equal(await read(ANA, (c) => readCompanionContext(c, id)), null, 'nobody answers a lost wait')
    await write(ANA, (c) => retryPersonalTurn(c, key(), id))
    const again = await read(ANA, (c) => readPersonalTurnsAfter(c, 0))
    assert.deepEqual([again.turns.find((t) => t.id === id)?.reply, again.pending], ['pending', true])
    assert.equal(await codeOf(write(ANA, (c) => retryPersonalTurn(c, key(), id))), 'stale_revision', 'asked from now')
    await answerTurn(ANA, id, 'Here now.', null)
  })
})

describe('personal space: notes', () => {
  it('keeps a suggestion only when the person says so, in her words', async () => {
    const { suggestionId } = await exchange('I cannot sleep', 'What usually helps you land?', 'Sleep has been short')
    assert.ok(suggestionId)
    assert.equal((await read(ANA, (c) => readPersonalSpace(c))).notes.length, 0)
    const kept = await write(ANA, (c) => decidePersonalSuggestion(c, key(), suggestionId, 'keep'))
    assert.ok(kept.noteId)
    assert.equal(
      await codeOf(write(ANA, (c) => decidePersonalSuggestion(c, key(), suggestionId, 'dismiss'))),
      'stale_revision',
    )
    const notes = (await read(ANA, (c) => readPersonalSpace(c))).notes
    assert.deepEqual(
      notes.map((n) => [n.text, n.keptBy]),
      [['Sleep has been short', 'sophia']],
    )
    // The same words are not suggested again.
    const again = await exchange('Still not sleeping', 'That sounds tiring.', 'Sleep has been short')
    assert.equal(again.suggestionId, null)
  })

  it('deletes a suggestion she lets go: nothing of it is kept, and it reads as gone', async () => {
    const { asked, suggestionId } = await exchange('Too many meetings', 'Which one could go?', 'Fewer meetings')
    assert.ok(suggestionId)
    await write(ANA, (c) => decidePersonalSuggestion(c, key(), suggestionId, 'dismiss'))
    const space = await read(ANA, (c) => readPersonalSpace(c))
    assert.equal(
      space.turns.some((t) => t.suggestion?.id === suggestionId),
      false,
    )
    assert.equal((await owner('SELECT 1 FROM sophia.personal_suggestions WHERE id = $1', [suggestionId])).length, 0)
    const again = write(ANA, (c) => decidePersonalSuggestion(c, key(), suggestionId, 'keep'))
    assert.equal(await codeOf(again), 'stale_revision')
    // A note kept from that turn, prefilled with it before it went, is hers.
    const kept = await write(ANA, (c) =>
      keepPersonalNote(c, key(), { text: 'Fewer meetings', fromTurnId: asked, suggestionId }),
    )
    const note = (await read(ANA, (c) => readPersonalSpace(c))).notes.find((n) => n.id === kept.noteId)
    assert.equal(note?.keptBy, 'person')
  })

  it('keeps a note in her own words, and forgetting it reopens the suggestion it kept', async () => {
    const { asked, suggestionId } = await exchange(
      'The story feels weak',
      'Which sentence matters?',
      'Work on the story',
    )
    assert.ok(suggestionId)
    const own = await write(ANA, (c) =>
      keepPersonalNote(c, key(), { text: 'Open with the customer', fromTurnId: asked }),
    )
    const theirs = await write(ANA, (c) =>
      keepPersonalNote(c, key(), { text: 'Work on the story', fromTurnId: asked, suggestionId }),
    )
    const space = await read(ANA, (c) => readPersonalSpace(c))
    assert.equal(space.notes.find((n) => n.id === own.noteId)?.keptBy, 'person')
    assert.equal(space.notes.find((n) => n.id === theirs.noteId)?.keptBy, 'sophia')
    assert.equal(space.turns.find((t) => t.suggestion?.id === suggestionId)?.suggestion?.state, 'kept')
    await write(ANA, (c) => forgetPersonalNote(c, key(), theirs.noteId ?? ''))
    const later = await read(ANA, (c) => readPersonalSpace(c))
    assert.equal(
      later.notes.some((n) => n.id === theirs.noteId),
      false,
    )
    assert.equal(later.turns.find((t) => t.suggestion?.id === suggestionId)?.suggestion?.state, 'open')
    // A suggestion of another turn, with its words, is not this turn's: the note is hers, and that suggestion stays open.
    const other = await exchange('The deck is long', 'Which slide can go?', 'Cut slide nine')
    const otherSuggestion = other.suggestionId ?? ''
    assert.ok(otherSuggestion)
    const mixed = await write(ANA, (c) =>
      keepPersonalNote(c, key(), { text: 'Cut slide nine', fromTurnId: asked, suggestionId: otherSuggestion }),
    )
    const kept = await read(ANA, (c) => readPersonalSpace(c))
    assert.equal(kept.notes.find((n) => n.id === mixed.noteId)?.keptBy, 'person')
    assert.equal(kept.turns.find((t) => t.suggestion?.id === otherSuggestion)?.suggestion?.state, 'open')
    // A note is a short line.
    assert.equal(
      await codeOf(write(ANA, (c) => keepPersonalNote(c, key(), { text: 'x'.repeat(91) }))),
      'invalid_request',
    )
  })
})

describe('personal space: the only crossing', () => {
  it('carries one note, exactly as written, to one project she belongs to; its members read it', async () => {
    const note = await write(ANA, (c) => keepPersonalNote(c, key(), { text: 'Ask Luis to rehearse Q&A' }))
    const noteId = note.noteId ?? ''
    assert.equal(
      await codeOf(write(ANA, (c) => carryPersonalNote(c, key(), noteId, elsewhere, 'Ana'))),
      'forbidden',
      'not to a project she is not in',
    )
    const carried = await write(ANA, (c) => carryPersonalNote(c, key(), noteId, projectId, 'Ana'))
    assert.equal(carried.projectId, projectId)
    // It left her notes and sits in her releases.
    const space = await read(ANA, (c) => readPersonalSpace(c))
    assert.equal(
      space.notes.some((n) => n.id === noteId),
      false,
    )
    assert.deepEqual(
      space.releases.map((r) => [r.text, r.projectTitle]),
      [['Ask Luis to rehearse Q&A', 'Launch plan']],
    )
    // The project's admin reads the copy, attributed to her, and nothing else of hers.
    const listed = await read(ADMIN, (c) => listProjects(c))
    const launch = listed.find((p) => p.projectId === projectId)
    assert.deepEqual(
      launch?.releases.map((r) => [r.text, r.ownerName, r.mine]),
      [['Ask Luis to rehearse Q&A', 'Ana', false]],
    )
    assert.equal((await read(ADMIN, (c) => readPersonalSpace(c))).notes.length, 0)
    // The project records that it happened; the event carries no words.
    const snapshot = await read(ADMIN, (c) => readSnapshot(c, projectId))
    assert.ok(snapshot)
    const events = await owner<{ type: string; summary_code: string }>(
      `SELECT type, summary_code FROM sophia.project_events WHERE project_id = $1 AND type LIKE 'personal.%'`,
      [projectId],
    )
    assert.deepEqual(events, [{ type: 'personal.note_carried', summary_code: 'personal.note_carried' }])
    // Someone outside the project reads nothing of it.
    assert.equal((await read(OTHER, (c) => listProjects(c))).length, 0)
    const outside = await read(OTHER, (c) => c.query('SELECT 1 FROM sophia.personal_releases'))
    assert.equal(outside.rowCount, 0)
  })

  it('takes it back: the project keeps no copy and the note returns to her notes', async () => {
    const release = (await read(ANA, (c) => readPersonalSpace(c))).releases[0]
    assert.ok(release)
    assert.equal(await codeOf(write(ADMIN, (c) => takeBackPersonalRelease(c, key(), release.id))), 'not_found')
    await write(ANA, (c) => takeBackPersonalRelease(c, key(), release.id))
    assert.deepEqual((await read(ADMIN, (c) => listProjects(c))).find((p) => p.projectId === projectId)?.releases, [])
    const space = await read(ANA, (c) => readPersonalSpace(c))
    assert.equal(space.releases.length, 0)
    assert.ok(space.notes.some((n) => n.id === release.noteId && n.text === 'Ask Luis to rehearse Q&A'))
    const rows = await owner('SELECT 1 FROM sophia.personal_releases WHERE id = $1', [release.id])
    assert.equal(rows.length, 0)
  })
})

describe('personal space: welcome back', () => {
  it('is due after an hour of quiet, never twice in a row, and never for someone else', async () => {
    const sent = await write(ANA, (c) => sendPersonalTurn(c, key(), 'Before the quiet'))
    await answerTurn(ANA, sent.turnId ?? '', 'Noted.', null)
    assert.equal(await read(ANA, (c) => readWelcomeContext(c)), null, 'not after a turn a minute ago')
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '2 hours' WHERE owner_id = $1`, [ANA])
    const context = await read(ANA, (c) => readWelcomeContext(c))
    assert.equal(context?.history.at(-1)?.text, 'Noted.')
    const k = key()
    const claim = claimOf(await write(ANA, (c) => beginPersonalGreeting(c, k)))
    const welcome = receiptOf(await write(ANA, (c) => recordPersonalGreeting(c, k, claim, 'Welcome back, Ana.')))
    assert.ok(welcome.turnId)
    // Its key answers every retry the same way, also after another quiet hour: never a second welcome under it.
    assert.deepEqual(await write(ANA, (c) => beginPersonalGreeting(c, k)), welcome)
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '2 hours' WHERE owner_id = $1`, [ANA])
    assert.deepEqual(await write(ANA, (c) => beginPersonalGreeting(c, k)), welcome)
    assert.deepEqual(await write(ANA, (c) => recordPersonalGreeting(c, k, claim, 'Welcome back again')), welcome)
    // Never twice in a row: a new request finds the welcome is the last turn, and keeps that answer under its key.
    const k2 = key()
    const again = receiptOf(await write(ANA, (c) => beginPersonalGreeting(c, k2)))
    assert.equal(again.turnId, null)
    assert.deepEqual(await write(ANA, (c) => beginPersonalGreeting(c, k2)), again)
    // Still due for no one else: another person has no conversation to be welcomed back to.
    assert.equal(await read(OTHER, (c) => readWelcomeContext(c)), null)
    const last = (await read(ANA, (c) => readPersonalSpace(c))).turns.at(-1)
    assert.deepEqual([last?.author, last?.text, last?.replyTo], ['sophia', 'Welcome back, Ana.', null])
  })

  it('is got by one request at a time; a claim lapses after two minutes', async () => {
    const sent = await write(QUIET, (c) => sendPersonalTurn(c, key(), 'Back after a while'))
    await answerTurn(QUIET, sent.turnId ?? '', 'Good to see you.', null)
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '2 hours' WHERE owner_id = $1`, [QUIET])
    const first = key()
    const second = key()
    const held = claimOf(await write(QUIET, (c) => beginPersonalGreeting(c, first)))
    const other = receiptOf(await write(QUIET, (c) => beginPersonalGreeting(c, second)))
    assert.equal(other.turnId, null, 'another request gets nothing to write')
    // The first one's companion never answered (a crash): after two minutes another request may claim it.
    await owner(
      `UPDATE sophia.personal_greeting_claims SET claimed_at = now() - interval '3 minutes' WHERE owner_id = $1`,
      [QUIET],
    )
    claimOf(await write(QUIET, (c) => beginPersonalGreeting(c, key())))
    // The first request's late answer writes nothing: its claim was taken over.
    const late = receiptOf(await write(QUIET, (c) => recordPersonalGreeting(c, first, held, 'Welcome back, late')))
    assert.equal(late.turnId, null)
  })

  it('keeps a key’s welcome for the attempt writing it: the same request meanwhile is told it is being written', async () => {
    const sent = await write(AGAIN, (c) => sendPersonalTurn(c, key(), 'Back again'))
    await answerTurn(AGAIN, sent.turnId ?? '', 'Noted.', null)
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '2 hours' WHERE owner_id = $1`, [AGAIN])
    const k = key()
    const held = claimOf(await write(AGAIN, (c) => beginPersonalGreeting(c, k)))
    // The same request again (its answer was lost on the way) while the first attempt still asks the companion.
    assert.equal(await write(AGAIN, (c) => beginPersonalGreeting(c, k)), 'writing')
    const welcome = receiptOf(await write(AGAIN, (c) => recordPersonalGreeting(c, k, held, 'Welcome back.')))
    assert.ok(welcome.turnId, 'the first attempt still writes it')
    assert.deepEqual(await write(AGAIN, (c) => beginPersonalGreeting(c, k)), welcome)
  })

  it('lets the same key ask again once an attempt failed, and never lets a lapsed attempt settle it', async () => {
    const sent = await write(LATE, (c) => sendPersonalTurn(c, key(), 'Back once more'))
    await answerTurn(LATE, sent.turnId ?? '', 'Noted.', null)
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '2 hours' WHERE owner_id = $1`, [LATE])
    const k = key()
    const failed = claimOf(await write(LATE, (c) => beginPersonalGreeting(c, k)))
    // The companion failed: the attempt lets its claim go, and the same request may ask again at once.
    await write(LATE, (c) => releasePersonalGreeting(c, failed))
    const second = claimOf(await write(LATE, (c) => beginPersonalGreeting(c, k)))
    assert.notEqual(second, failed)
    await write(LATE, (c) => releasePersonalGreeting(c, failed))
    assert.equal(await write(LATE, (c) => beginPersonalGreeting(c, k)), 'writing', 'an old claim lets nothing go')
    // The second attempt stalled past its claim and a third took it over under the same key: the second's late answer
    // neither writes nor settles the key; the third's does.
    await owner(
      `UPDATE sophia.personal_greeting_claims SET claimed_at = now() - interval '3 minutes' WHERE owner_id = $1`,
      [LATE],
    )
    const third = claimOf(await write(LATE, (c) => beginPersonalGreeting(c, k)))
    assert.equal(await write(LATE, (c) => recordPersonalGreeting(c, k, second, 'Welcome back, late')), 'writing')
    const welcome = receiptOf(await write(LATE, (c) => recordPersonalGreeting(c, k, third, 'Welcome back.')))
    assert.ok(welcome.turnId)
    assert.equal((await read(LATE, (c) => readPersonalSpace(c))).turns.at(-1)?.text, 'Welcome back.')
  })
})

describe('personal space: erasure', () => {
  it('deletes the conversation and notes for good, keeps carried notes hers, and a late retry writes nothing', async () => {
    const k = key()
    await write(ANA, (c) => sendPersonalTurn(c, k, 'One more thing'))
    const noteKey = key()
    const note = await write(ANA, (c) => keepPersonalNote(c, noteKey, { text: 'Take a real day off' }))
    const lastSeq = (await read(ANA, (c) => readPersonalSpace(c))).turns.at(-1)?.seq ?? 0
    await write(ANA, (c) => carryPersonalNote(c, key(), note.noteId ?? '', projectId, 'Ana'))
    assert.equal(await codeOf(write(ANA, (c) => erasePersonalSpace(c, key(), 'yes'))), 'invalid_request')
    // Her earlier writes, from this test file's first minutes, are older than ten minutes by now.
    await owner(
      `UPDATE sophia.personal_requests SET created_at = now() - interval '11 minutes'
        WHERE owner_id = $1 AND idempotency_key <> $2`,
      [ANA, k],
    )
    const requestsBefore = await owner<{ n: string }>(
      'SELECT count(*) AS n FROM sophia.personal_requests WHERE owner_id = $1',
      [ANA],
    )
    const erased = await write(ANA, (c) => erasePersonalSpace(c, key(), 'delete'))
    assert.ok((erased.erased?.turns ?? 0) > 0)
    const space = await read(ANA, (c) => readPersonalSpace(c))
    assert.deepEqual([space.turns.length, space.notes.length], [0, 0])
    assert.equal(space.releases.length, 1, 'what she carried stays where she carried it')
    // No text of hers is left in any personal table but the carried copy, and no request keeps a digest.
    const left = await owner<{ n: string }>(
      `SELECT (SELECT count(*) FROM sophia.personal_turns WHERE owner_id = $1)
            + (SELECT count(*) FROM sophia.personal_notes WHERE owner_id = $1)
            + (SELECT count(*) FROM sophia.personal_suggestions WHERE owner_id = $1)
            + (SELECT count(*) FROM sophia.personal_requests WHERE owner_id = $1 AND NOT semantic_request ? 'redacted'
               AND operation <> 'erase') AS n`,
      [ANA],
    )
    assert.equal(left[0]?.n, '0')
    // No record of when or how she wrote outlives the erasure: every request keeps only its key, dated at the
    // erasure, and the erasure keeps its own receipt; the space keeps no date either.
    const requests = await owner<{ operation: string; redacted: boolean; at_erasure: boolean }>(
      `SELECT r.operation, r.semantic_request ? 'redacted' AS redacted,
              r.created_at = (SELECT created_at FROM sophia.personal_requests
                               WHERE owner_id = $1 AND operation = 'erase') AS at_erasure
         FROM sophia.personal_requests r WHERE r.owner_id = $1 AND r.operation <> 'erase'`,
      [ANA],
    )
    assert.equal(requests.length, Number(requestsBefore[0]?.n), 'every request before it keeps its key')
    assert.ok(requests.every((r) => r.operation === 'redacted' && r.redacted && r.at_erasure))
    const dated = await owner(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sophia' AND table_name = 'personal_spaces' AND data_type LIKE 'timestamp%'`,
    )
    assert.equal(dated.length, 0, 'the space keeps no date')
    // A late retry writes nothing, from the last minutes or from long before.
    assert.equal(await codeOf(write(ANA, (c) => sendPersonalTurn(c, k, 'One more thing'))), 'request_erased')
    assert.equal(
      await codeOf(write(ANA, (c) => keepPersonalNote(c, noteKey, { text: 'Take a real day off' }))),
      'request_erased',
    )
    // Taking the carried note back after erasing brings it back as a note.
    await write(ANA, (c) => takeBackPersonalRelease(c, key(), space.releases[0]?.id ?? ''))
    const back = await read(ANA, (c) => readPersonalExport(c))
    assert.deepEqual(
      back.notes.map((n) => n.text),
      ['Take a real day off'],
    )
    assert.equal(back.turns.length, 0)
    // The order of her turns goes on: a turn after the erasure comes after every turn before it, so a reader's
    // cursor from before stays valid.
    const next = await write(ANA, (c) => sendPersonalTurn(c, key(), 'Starting again'))
    assert.ok((next.seq ?? 0) > lastSeq, `${String(next.seq)} after ${String(lastSeq)}`)
  })
})

/** As the owner: a space for `who`, with `notes` notes and `carried` notes carried to `project` before an erasure. */
async function filled(who: string, notes: number, carried: { project: string; count: number } | null = null) {
  await owner('INSERT INTO sophia.personal_spaces(owner_id) VALUES ($1) ON CONFLICT DO NOTHING', [who])
  await owner(
    `INSERT INTO sophia.personal_notes(owner_id, body, kept_by)
     SELECT $1, 'Note ' || g, 'person' FROM generate_series(1, $2::int) g`,
    [who, notes],
  )
  if (!carried) return
  await owner(
    `INSERT INTO sophia.personal_releases(id, owner_id, owner_name, project_id, note_id, body)
     SELECT gen_random_uuid(), $1, 'Carrier', $2, NULL, 'Carried ' || g FROM generate_series(1, $3::int) g`,
    [who, carried.project, carried.count],
  )
}

describe('personal space: who may write it, and how much it keeps', () => {
  it('lets only the API role call a personal writer: no function of the schema is executable by everyone', async () => {
    const open = await owner<{ name: string }>(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'sophia' AND has_function_privilege('public', p.oid, 'EXECUTE') ORDER BY 1`,
    )
    assert.deepEqual(
      open.map((r) => r.name),
      [],
    )
    const worker = await owner<{ name: string }>(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'sophia' AND p.proname LIKE '%personal%'
          AND has_function_privilege('sophia_worker', p.oid, 'EXECUTE') ORDER BY 1`,
    )
    assert.deepEqual(
      worker.map((r) => r.name),
      [],
    )
  })

  it('keeps at most 2000 notes: past them every way of making one is refused, but a retry is answered', async () => {
    await filled(FULL, 1999)
    const last = key()
    const kept = await write(FULL, (c) => keepPersonalNote(c, last, { text: 'The two thousandth' }))
    assert.ok(kept.noteId)
    assert.deepEqual(await write(FULL, (c) => keepPersonalNote(c, last, { text: 'The two thousandth' })), kept)
    assert.equal(await codeOf(write(FULL, (c) => keepPersonalNote(c, key(), { text: 'One more' }))), 'notes_full')
    // Sophia's suggestion, kept.
    const sent = await write(FULL, (c) => sendPersonalTurn(c, key(), 'So many notes'))
    await answerTurn(FULL, sent.turnId ?? '', 'Keep only what helps.', 'Keep what helps')
    const suggestion = (await read(FULL, (c) => readPersonalSpace(c))).turns.find((t) => t.suggestion)?.suggestion
    assert.ok(suggestion)
    assert.equal(
      await codeOf(write(FULL, (c) => decidePersonalSuggestion(c, key(), suggestion.id, 'keep'))),
      'notes_full',
    )
    // A carried note whose note was erased comes back as a new note: refused too, and it stays in its project.
    await owner(
      `INSERT INTO sophia.personal_releases(id, owner_id, owner_name, project_id, note_id, body)
       VALUES (gen_random_uuid(), $1, 'Full', $2, NULL, 'Carried before an erasure')`,
      [FULL, projectId],
    )
    const release = (await read(FULL, (c) => readPersonalSpace(c))).releases[0]
    assert.ok(release)
    assert.equal(await codeOf(write(FULL, (c) => takeBackPersonalRelease(c, key(), release.id))), 'notes_full')
    assert.equal((await read(FULL, (c) => readPersonalSpace(c))).releases.length, 1)
  })

  it('lets one person carry at most 2000 notes, counting those whose note was erased', async () => {
    const team = (await seedProject(db.ownerUrl, { title: 'Carried', admin: ADMIN, editors: [CARRIER] })).projectId
    await filled(CARRIER, 0, { project: team, count: 2000 })
    const note = await write(CARRIER, (c) => keepPersonalNote(c, key(), { text: 'One more to carry' }))
    assert.equal(
      await codeOf(write(CARRIER, (c) => carryPersonalNote(c, key(), note.noteId ?? '', team, 'Carrier'))),
      'carried_full',
    )
  })

  it("lists a project's newest carried notes within its bound, the reader's own first", async () => {
    const team = (await seedProject(db.ownerUrl, { title: 'Busy', admin: ADMIN, editors: [MINE, PEER] })).projectId
    await owner(
      `INSERT INTO sophia.personal_releases(id, owner_id, owner_name, project_id, note_id, body, created_at)
       VALUES (gen_random_uuid(), $1, 'Mine', $3, NULL, 'Mine, oldest', now() - interval '9 hours'),
              (gen_random_uuid(), $1, 'Mine', $3, NULL, 'Mine, older', now() - interval '8 hours'),
              (gen_random_uuid(), $2, 'Peer', $3, NULL, 'Peer, 3', now() - interval '3 hours'),
              (gen_random_uuid(), $2, 'Peer', $3, NULL, 'Peer, 2', now() - interval '2 hours'),
              (gen_random_uuid(), $2, 'Peer', $3, NULL, 'Peer, 1', now() - interval '1 hour')`,
      [MINE, PEER, team],
    )
    const listed = await read(MINE, (c) => listProjects(c, { projects: 500, releases: 3 }))
    assert.deepEqual(
      listed.find((p) => p.projectId === team)?.releases.map((r) => r.text),
      ['Mine, oldest', 'Mine, older', 'Peer, 1'],
    )
  })

  it('refuses text that is only whitespace, or that the database cannot keep', async () => {
    assert.equal(await codeOf(write(OTHER, (c) => sendPersonalTurn(c, key(), '\n\n'))), 'invalid_request')
    assert.equal(await codeOf(write(OTHER, (c) => keepPersonalNote(c, key(), { text: '\t' }))), 'invalid_request')
    assert.equal(await codeOf(write(OTHER, (c) => sendPersonalTurn(c, key(), 'a\u0000b'))), 'invalid_request')
    const sent = await write(OTHER, (c) => sendPersonalTurn(c, key(), '\n hi \n'))
    const page = await read(OTHER, (c) => readPersonalTurnsAfter(c, 0))
    assert.equal(page.turns.find((t) => t.id === sent.turnId)?.text, 'hi')
  })

  it('keeps no digest of a note she forgot; its keep, retried, is told it changed', async () => {
    const k = key()
    const note = await write(OTHER, (c) => keepPersonalNote(c, k, { text: 'A line to forget' }))
    await write(OTHER, (c) => forgetPersonalNote(c, key(), note.noteId ?? ''))
    const rows = await owner<{ semantic: Record<string, unknown> }>(
      `SELECT semantic_request AS semantic FROM sophia.personal_requests
        WHERE owner_id = $1 AND idempotency_key = $2`,
      [OTHER, k],
    )
    assert.equal(rows.length, 1)
    assert.equal('text' in (rows[0]?.semantic ?? {}), false)
    assert.equal(
      await codeOf(write(OTHER, (c) => keepPersonalNote(c, k, { text: 'A line to forget' }))),
      'stale_revision',
    )
  })
})
