// PS-01 personal space (migration 0021, amendment A10), level: sql-run. Every call runs on the non-owner sophia_api
// login with a transaction-local actor, as the API does; the migration owner only seeds and inspects. The point of
// these tests is who reads what: a person's space is theirs alone, and a carried note is the only thing a project sees.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  carryPersonalNote,
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
  recordPersonalReply,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
  withActor,
} from './index.ts'

const ANA = randomUUID() // the person whose space this is; an editor of the shared project
const ADMIN = randomUUID() // admin of the shared project
const OTHER = randomUUID() // another person with a space of their own, in no project

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

/** Ana says something and Sophia answers, suggesting a note. Returns the two turns' ids and the suggestion's. */
async function exchange(text: string, reply: string, suggestion: string | null) {
  const sent = await write(ANA, (c) => sendPersonalTurn(c, key(), text))
  assert.ok(sent.turnId)
  await write(ANA, (c) => recordPersonalReply(c, sent.turnId ?? '', reply, suggestion))
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

    await write(ANA, (c) =>
      recordPersonalReply(c, sent.turnId ?? '', 'Which part feels least ready?', 'Pitch on Friday'),
    )
    // A second reply to an answered turn changes nothing.
    await write(ANA, (c) => recordPersonalReply(c, sent.turnId ?? '', 'A different reply', null))
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
      await codeOf(write(OTHER, (c) => recordPersonalReply(c, sent.turnId ?? '', 'Not yours', null))),
      'not_found',
    )
    assert.equal(await read(OTHER, (c) => readCompanionContext(c, sent.turnId ?? '')), null)
    const context = await read(ANA, (c) => readCompanionContext(c, sent.turnId ?? ''))
    assert.equal(context?.asked.text, 'Still there?')
    assert.equal(context?.history.at(-1)?.text, 'Still there?')
    await write(ANA, (c) => failPersonalReply(c, sent.turnId ?? ''))
    const failed = await read(ANA, (c) => readPersonalTurnsAfter(c, 0))
    assert.equal(failed.turns.find((t) => t.id === sent.turnId)?.reply, 'failed')
    assert.equal(failed.pending, false)
    await write(ANA, (c) => retryPersonalTurn(c, key(), sent.turnId ?? ''))
    assert.equal((await read(ANA, (c) => readPersonalTurnsAfter(c, 0))).pending, true)
    await write(ANA, (c) => recordPersonalReply(c, sent.turnId ?? '', 'Here.', null))
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

describe('personal space: erasure', () => {
  it('deletes the conversation and notes for good, keeps carried notes hers, and a late retry writes nothing', async () => {
    const k = key()
    await write(ANA, (c) => sendPersonalTurn(c, k, 'One more thing'))
    const note = await write(ANA, (c) => keepPersonalNote(c, key(), { text: 'Take a real day off' }))
    await write(ANA, (c) => carryPersonalNote(c, key(), note.noteId ?? '', projectId, 'Ana'))
    assert.equal(await codeOf(write(ANA, (c) => erasePersonalSpace(c, key(), 'yes'))), 'invalid_request')
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
    assert.equal(await codeOf(write(ANA, (c) => sendPersonalTurn(c, k, 'One more thing'))), 'stale_revision')
    // Taking the carried note back after erasing brings it back as a note.
    await write(ANA, (c) => takeBackPersonalRelease(c, key(), space.releases[0]?.id ?? ''))
    const back = await read(ANA, (c) => readPersonalExport(c))
    assert.deepEqual(
      back.notes.map((n) => n.text),
      ['Take a real day off'],
    )
    assert.equal(back.turns.length, 0)
  })
})
