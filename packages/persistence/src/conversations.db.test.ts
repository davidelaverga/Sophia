// CON-01 G1, saved project conversations (migration 0048, amendment A16), level: sql-run. Every call runs on the
// non-owner sophia_api login with a transaction-local actor, as the API does; the migration owner only seeds, switches
// a project's setting (the operator's function) and inspects.
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { parseConversationList } from '@sophia/contracts/validate'
import {
  createPool,
  eraseConversation,
  readConversationList,
  readConversationMessage,
  readConversationPage,
  readProjectConversationPage,
  sendConversationMessage,
  startConversation,
  withActor,
  withdrawConversationMessage,
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
  pool = createPool(db.apiUrl, { max: 12 })
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

const setting = (projectId: string, state: 'enabled' | 'read_only') =>
  owner(`SELECT sophia.set_conversation_settings($1, $2, 'CON-01 test')`, [projectId, state])
/** A project whose conversations are on, as the operator turns them on (no login may call the function). */
async function project(state: 'enabled' | 'read_only' | null = 'enabled'): Promise<string> {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E, F], viewers: [V] })
  if (state) await setting(projectId, state)
  return projectId
}

interface StartOptions {
  ask?: boolean
  key?: string
  title?: string
  text?: string
  name?: string
}
const start = (actor: string, projectId: string, o: StartOptions = {}) =>
  withActor(pool, actor, 'write', (c) =>
    startConversation(
      c,
      projectId,
      o.key ?? randomUUID(),
      {
        title: o.title ?? 'Onboarding direction',
        text: o.text ?? 'Map first, list second?',
        askSophia: o.ask ?? false,
      },
      o.name ?? `${actor.slice(0, 4)}@example.test`,
    ),
  )
const send = (actor: string, conversationId: string, text: string, o: { ask?: boolean; key?: string } = {}) =>
  withActor(pool, actor, 'write', (c) =>
    sendConversationMessage(
      c,
      conversationId,
      o.key ?? randomUUID(),
      { text, askSophia: o.ask ?? false },
      `${actor.slice(0, 4)}@example.test`,
    ),
  )
const withdraw = (actor: string, conversationId: string, messageId: string, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) => withdrawConversationMessage(c, conversationId, messageId, key))
const erase = (actor: string, conversationId: string, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) => eraseConversation(c, conversationId, key))
const list = (actor: string, projectId: string) =>
  withActor(pool, actor, 'read', (c) => readConversationList(c, projectId))
const page = (actor: string, conversationId: string, cursor: string | null = null) =>
  withActor(pool, actor, 'read', (c) => readConversationPage(c, conversationId, cursor))
const message = (actor: string, messageId: string) =>
  withActor(pool, actor, 'read', (c) => readConversationMessage(c, messageId))
const scoped = (actor: string, projectId: string, conversationId: string, cursor: string | null = null) =>
  withActor(pool, actor, 'read', (c) => readProjectConversationPage(c, projectId, conversationId, cursor))
/** What a read refused with: its code and its words. */
const refusalOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (err: unknown) => (err instanceof DomainError ? `${err.code}: ${err.message}` : `raw:${String(err)}`),
  )

/** Rows of everything that would mean work started, for one project. */
async function workRows(projectId: string): Promise<Record<string, number>> {
  const tables = ['goals', 'work_attempts', 'execution_bindings', 'commands', 'jobs', 'outbox', 'runtime_commands']
  const out: Record<string, number> = {}
  for (const t of [...tables, 'research_allowances']) {
    const [row] = await owner<{ n: string }>(`SELECT count(*) AS n FROM sophia.${t} WHERE project_id = $1`, [projectId])
    out[t] = Number(row!.n)
  }
  return out
}

describe('the project setting (the cohort and rollback switch)', () => {
  it('with no setting, the list is empty and says nothing may be written; a start is refused', async () => {
    const p = await project(null)
    const l = await list(E, p)
    assert.deepEqual(l.conversations, [])
    assert.equal(l.capability.state, 'off')
    assert.equal(l.capability.write, false)
    assert.equal(l.policy, null)
    assert.equal(await codeOf(start(E, p)), 'conversations_closed')
  })

  it('read-only keeps reads, withdrawal and a replay; refuses new text', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(E, p, { key })
    const second = await send(E, first.conversationId, 'Second thought')
    await setting(p, 'read_only')
    assert.equal((await list(E, p)).capability.write, false)
    assert.equal((await list(E, p)).capability.state, 'read_only')
    assert.equal(await codeOf(send(E, first.conversationId, 'More')), 'conversations_closed')
    assert.equal(await codeOf(start(E, p)), 'conversations_closed')
    assert.deepEqual(await start(E, p, { key }), first, 'a written request still answers with its receipt')
    await withdraw(E, first.conversationId, second.messageId)
    assert.equal((await page(V, first.conversationId)).messages.length, 2)
  })
})

describe('starting and continuing', () => {
  it('a start is a conversation and its first message, with the writer and the name the token carried', async () => {
    const p = await project()
    const baseline = await workRows(p)
    const r = await start(E, p, { text: '  Map first, list second?  ', name: 'e@example.test' })
    assert.equal(r.sophia, 'not_asked')
    assert.equal(r.replyId, null)
    const l = await list(V, p)
    assert.equal(l.conversations.length, 1)
    const c = l.conversations[0]!
    assert.equal(c.id, r.conversationId)
    assert.equal(c.title, 'Onboarding direction')
    assert.deepEqual(c.contributors, [{ actorId: E, name: 'e@example.test' }])
    assert.equal(c.sophia, false)
    assert.equal(c.summary, null)
    assert.equal(c.summaryCoverage.state, 'not_assessed')
    assert.equal(c.openQuestions, 0)
    assert.equal(c.questionsCoverage.state, 'not_assessed')
    assert.equal(c.output, null)
    assert.equal(c.lastMessage?.text, 'Map first, list second?')
    assert.equal(c.lastMessage?.actorId, E)
    // Its order (CON-01-CC-0023): the highest place taken, and the opening's own.
    assert.equal(c.messageSeq, 1)
    assert.equal(c.lastMessage?.seq, 1)
    const first = await page(V, r.conversationId)
    assert.equal(first.before, null)
    assert.equal(first.messages.length, 1)
    const m = first.messages[0]!
    assert.deepEqual(
      { id: m.id, seq: m.seq, author: m.author, text: m.text },
      { id: r.messageId, seq: 1, author: 'member', text: 'Map first, list second?' },
    )
    // Human-only text starts nothing (CON01-A08): no goal, attempt, binding, command, job, outbox row or allowance.
    assert.deepEqual(await workRows(p), baseline)
    const events = await owner<{ type: string; summary_code: string }>(
      `SELECT type, summary_code FROM sophia.project_events WHERE project_id = $1 AND entity_id = $2`,
      [p, r.conversationId],
    )
    assert.deepEqual(events, [{ type: 'conversation.updated', summary_code: 'conversation.started' }])
  })

  it('a failure after the conversation row leaves no conversation, message, request or event (CON01-A01)', async () => {
    const p = await project()
    await owner(`CREATE FUNCTION sophia.test_refuse_message() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.body = 'refuse me' THEN RAISE EXCEPTION 'injected after the conversation insert'; END IF; RETURN NEW; END $$`)
    await owner(`CREATE TRIGGER test_refuse_message BEFORE INSERT ON sophia.conversation_messages
      FOR EACH ROW EXECUTE FUNCTION sophia.test_refuse_message()`)
    try {
      const refused = await codeOf(start(E, p, { ask: true, title: 'Will fail', text: 'refuse me' }))
      assert.notEqual(refused, 'resolved')
    } finally {
      await owner(`DROP TRIGGER test_refuse_message ON sophia.conversation_messages`)
      await owner(`DROP FUNCTION sophia.test_refuse_message()`)
    }
    const [n] = await owner<{ c: string; m: string; q: string; r: string; e: string }>(
      `SELECT (SELECT count(*) FROM sophia.conversations WHERE project_id=$1) AS c,
              (SELECT count(*) FROM sophia.conversation_messages WHERE project_id=$1) AS m,
              (SELECT count(*) FROM sophia.conversation_requests WHERE project_id=$1) AS q,
              (SELECT count(*) FROM sophia.conversation_replies WHERE project_id=$1) AS r,
              (SELECT count(*) FROM sophia.project_events WHERE project_id=$1 AND type='conversation.updated') AS e`,
      [p],
    )
    assert.deepEqual(n, { c: '0', m: '0', q: '0', r: '0', e: '0' })
  })

  it('asking Sophia records a reply request, blocked and saying why, and still starts no work (CON01-A10)', async () => {
    const p = await project()
    const baseline = await workRows(p)
    const r = await start(E, p, { ask: true })
    assert.equal(r.sophia, 'asked')
    assert.ok(r.replyId)
    const m = await message(V, r.messageId)
    assert.equal(m.ask?.id, r.replyId)
    assert.equal(m.ask?.state, 'blocked')
    assert.equal(m.ask?.reason, 'replies_not_enabled')
    assert.ok(m.ask?.settledAt)
    const s = await send(F, r.conversationId, 'And Luis thinks the list first', { ask: true })
    assert.equal(s.sophia, 'asked')
    assert.notEqual(s.replyId, r.replyId)
    assert.deepEqual(await workRows(p), baseline)
  })
})

describe('one intent, one write (CON01-A02, A03, A04)', () => {
  it('a retry under the key returns the same conversation and message, and writes nothing more', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(E, p, { ask: true, key })
    const again = await start(E, p, { ask: true, key, name: 'renamed@example.test' })
    assert.deepEqual(again, first, 'the same person, renamed, is the same request (CON-01-T05)')
    const sendKey = randomUUID()
    const s1 = await send(F, first.conversationId, 'Agreed', { ask: true, key: sendKey })
    assert.deepEqual(await send(F, first.conversationId, 'Agreed', { ask: true, key: sendKey }), s1)
    const [n] = await owner<{ m: string; r: string }>(
      `SELECT (SELECT count(*) FROM sophia.conversation_messages WHERE project_id=$1) AS m,
              (SELECT count(*) FROM sophia.conversation_replies WHERE project_id=$1) AS r`,
      [p],
    )
    assert.deepEqual(n, { m: '2', r: '2' })
  })

  it('anything changed under an old key is refused: title, text, ask, target, operation', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(E, p, { key })
    assert.equal(await codeOf(start(E, p, { key, title: 'Another title' })), 'idempotency_conflict')
    assert.equal(await codeOf(start(E, p, { key, text: 'Other text' })), 'idempotency_conflict')
    assert.equal(await codeOf(start(E, p, { key, ask: true })), 'idempotency_conflict')
    assert.equal(
      await codeOf(send(E, first.conversationId, 'Map first, list second?', { key })),
      'idempotency_conflict',
    )
    const other = await start(E, p)
    const sendKey = randomUUID()
    await send(E, first.conversationId, 'Here', { key: sendKey })
    assert.equal(await codeOf(send(E, other.conversationId, 'Here', { key: sendKey })), 'idempotency_conflict')
    const m1 = await send(E, first.conversationId, 'One')
    const m2 = await send(E, first.conversationId, 'Two')
    const withdrawKey = randomUUID()
    await withdraw(E, first.conversationId, m1.messageId, withdrawKey)
    // CON-01-CX-0002 correction 1: the same key naming another message is another request.
    assert.equal(await codeOf(withdraw(E, first.conversationId, m2.messageId, withdrawKey)), 'idempotency_conflict')
    assert.equal((await page(E, first.conversationId)).messages.find((m) => m.id === m2.messageId)?.text, 'Two')
  })

  it("a key is the actor's and the project's own: another actor or project under it writes its own", async () => {
    const p = await project()
    const q = await project()
    const key = randomUUID()
    const mine = await start(E, p, { key })
    const theirs = await start(F, p, { key })
    const elsewhere = await start(E, q, { key })
    assert.notEqual(theirs.conversationId, mine.conversationId)
    assert.notEqual(elsewhere.conversationId, mine.conversationId)
  })
})

describe('who reads and writes (CON01-A05)', () => {
  it('a viewer reads and cannot write; an outsider reads nothing, by project, id or cursor', async () => {
    const p = await project()
    const r = await start(E, p)
    for (let i = 0; i < 55; i++) await send(E, r.conversationId, `Message ${i}`)
    assert.equal(await codeOf(start(V, p)), 'forbidden')
    assert.equal(await codeOf(send(V, r.conversationId, 'Can I?')), 'forbidden')
    assert.equal((await list(V, p)).conversations.length, 1)
    const first = await page(V, r.conversationId)
    assert.ok(first.before)
    assert.equal(await codeOf(list(O, p)), 'forbidden')
    assert.equal(await codeOf(page(O, r.conversationId)), 'not_found')
    assert.equal(await codeOf(page(O, r.conversationId, first.before)), 'not_found')
    assert.equal(await codeOf(send(O, r.conversationId, 'Hello')), 'not_found')
    assert.equal(await codeOf(message(O, r.messageId)), 'not_found')
    assert.equal(await codeOf(withdraw(O, r.conversationId, r.messageId)), 'not_found')
  })

  it('a member removed since cannot read, write or replay what they wrote', async () => {
    const p = await project()
    const key = randomUUID()
    const r = await start(F, p, { key })
    await owner(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [p, F])
    assert.equal(await codeOf(start(F, p, { key })), 'forbidden', 'authority is checked before the key is read')
    assert.equal(await codeOf(list(F, p)), 'forbidden')
    assert.equal(await codeOf(page(F, r.conversationId)), 'not_found')
    assert.equal(await codeOf(send(F, r.conversationId, 'Still here?')), 'not_found')
  })
})

describe('a page read within its project (PR #199 CX-0073, CX-0074; CON-01-CC-0072)', () => {
  it('a member reads it as ever; erased, missing or another project’s are alike not found, nothing of them told', async () => {
    // V is a member of both projects.
    const p1 = await project()
    const p2 = await project()
    const here = await start(E, p1)
    const goneHere = await start(E, p1)
    await erase(A, goneHere.conversationId)
    const there = await start(E, p2)
    const goneThere = await start(E, p2)
    await erase(A, goneThere.conversationId)
    assert.deepEqual(await scoped(V, p1, here.conversationId), await page(V, here.conversationId))
    const absent = [goneHere.conversationId, there.conversationId, goneThere.conversationId, randomUUID()]
    const refusals = await Promise.all(absent.map((id) => refusalOf(scoped(V, p1, id))))
    assert.deepEqual(
      refusals,
      absent.map(() => 'not_found: Conversation not found'),
    )
    // In its own project, the other one reads as ever.
    assert.equal((await scoped(V, p2, there.conversationId)).conversationId, there.conversationId)
  })

  it('a non-member, or one removed since, is refused before anything of the conversation or its cursor is read', async () => {
    const p = await project()
    const r = await start(E, p)
    for (let i = 0; i < 55; i++) await send(E, r.conversationId, `Message ${i}`)
    const first = await scoped(V, p, r.conversationId)
    assert.ok(first.before)
    const other = await start(E, p)
    const erased = await start(E, p)
    await erase(A, erased.conversationId)
    for (const id of [r.conversationId, erased.conversationId, randomUUID()]) {
      assert.equal(await refusalOf(scoped(O, p, id)), 'forbidden: Not permitted')
      assert.equal(await refusalOf(scoped(O, p, id, first.before)), 'forbidden: Not permitted')
      assert.equal(await refusalOf(scoped(O, p, id, 'made-up')), 'forbidden: Not permitted')
    }
    assert.equal(await refusalOf(scoped(V, randomUUID(), r.conversationId)), 'forbidden: Not permitted')
    // A member: a cursor of another conversation, or a made-up one, is refused as a cursor, never as an absence.
    assert.equal(await codeOf(scoped(V, p, other.conversationId, first.before)), 'invalid_request')
    assert.equal(await codeOf(scoped(V, p, r.conversationId, 'made-up')), 'invalid_request')
    assert.equal((await scoped(V, p, r.conversationId, first.before)).messages.length, 6)
    // Removed since: refused here, where the global read answers not found.
    await owner(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [p, F])
    assert.equal(await codeOf(scoped(F, p, r.conversationId)), 'forbidden')
    assert.equal(await codeOf(page(F, r.conversationId)), 'not_found')
  })

  it('membership and the conversation are read in one snapshot; a read set out after a revocation committed is refused', async () => {
    const p = await project()
    const r = await start(E, p)
    // CX-0073's sequence: the list read answers (V a member then); V is removed; the read held until then is refused.
    assert.deepEqual(
      (await list(V, p)).conversations.map((x) => x.id),
      [r.conversationId],
    )
    const c = await pool.connect()
    const revoker = new pg.Client({ connectionString: db.ownerUrl })
    await revoker.connect()
    try {
      // As withActor reads: the snapshot is taken by the first statement.
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [V])
      await revoker.query(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [
        p,
        V,
      ])
      // In that snapshot V is still a member and the conversation still there: both answers agree.
      assert.equal((await readProjectConversationPage(c, p, r.conversationId, null)).conversationId, r.conversationId)
      await c.query('COMMIT')
    } finally {
      c.release()
      await revoker.end()
    }
    assert.equal(await codeOf(scoped(V, p, r.conversationId)), 'forbidden')
    assert.equal(await codeOf(list(V, p)), 'forbidden')
  })
})

describe('order and pages (CON01-A07)', () => {
  it('concurrent messages each take their own place; pages have no gap or repeat', async () => {
    const p = await project()
    const r = await start(E, p)
    await Promise.all(Array.from({ length: 24 }, (_, i) => send(i % 2 ? E : F, r.conversationId, `Concurrent ${i}`)))
    for (let i = 0; i < 100; i++) await send(E, r.conversationId, `Serial ${i}`)
    const seen: number[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const read: Awaited<ReturnType<typeof page>> = await page(A, r.conversationId, cursor)
      assert.ok(read.messages.length <= 50)
      const seqs = read.messages.map((m) => m.seq)
      assert.deepEqual(
        seqs,
        seqs.toSorted((a, b) => a - b),
        'oldest first within a page',
      )
      seen.unshift(...seqs)
      cursor = read.before
      pages++
    } while (cursor && pages < 10)
    assert.deepEqual(
      seen,
      Array.from({ length: 125 }, (_, i) => i + 1),
    )
  })

  it('a conversation with more writers than A16 names lists 200, the reader among them, in order (PR #199 review)', async () => {
    const p = await project()
    const r = await start(E, p)
    const more = Array.from({ length: 200 }, () => randomUUID())
    await owner(
      `INSERT INTO sophia.project_members(project_id, actor_id, role) SELECT $1, unnest($2::uuid[]), 'editor'`,
      [p, more],
    )
    for (const [i, actor] of more.entries()) await send(actor, r.conversationId, `Writer ${i}`)
    const namedFor = async (reader: string) => {
      const read = await list(reader, p)
      // The whole answer as the Studio checks it: the generated A16 contract.
      assert.doesNotThrow(() => parseConversationList(read))
      return read.conversations.find((c) => c.id === r.conversationId)?.contributors.map((x) => x.actorId)
    }
    // Someone who didn't write there: the first 200 to write.
    assert.deepEqual(await namedFor(A), [E, ...more.slice(0, 199)])
    // The 201st to write is still named to themselves (in the last place kept), so «Mine» holds for them.
    const last = more[199] ?? ''
    assert.deepEqual(await namedFor(last), [E, ...more.slice(0, 198), last])
    // One among the first 200: the first 200, unchanged.
    assert.deepEqual(await namedFor(E), [E, ...more.slice(0, 199)])
  })

  it("another conversation's cursor, or a made-up one, is refused", async () => {
    const p = await project()
    const a = await start(E, p)
    const b = await start(E, p)
    for (let i = 0; i < 55; i++) await send(E, a.conversationId, `A${i}`)
    const cursor = (await page(E, a.conversationId)).before
    assert.ok(cursor)
    assert.equal(await codeOf(page(E, b.conversationId, cursor)), 'invalid_request')
    assert.equal(await codeOf(page(E, a.conversationId, 'not-a-cursor')), 'invalid_request')
    const negative = Buffer.from(`c1.${a.conversationId}.-4`).toString('base64url')
    assert.equal(await codeOf(page(E, a.conversationId, negative)), 'invalid_request')
  })
})

describe('withdrawal and erasure (CON-01-T04)', () => {
  it("an author withdraws their own: its text and name go from every read, and its request can't replay", async () => {
    const p = await project()
    const r = await start(E, p)
    const key = randomUUID()
    const s = await send(F, r.conversationId, 'A detail I regret', { key })
    const listed = await list(V, p)
    assert.deepEqual(
      listed.conversations[0]!.contributors.map((c) => c.actorId),
      [E, F],
    )
    assert.equal(await codeOf(withdraw(E, r.conversationId, s.messageId)), 'forbidden', "not another writer's")
    await withdraw(F, r.conversationId, s.messageId)
    const m = (await page(V, r.conversationId)).messages.find((x) => x.id === s.messageId)!
    assert.equal(m.text, null)
    assert.equal(m.name, null)
    assert.ok(m.withdrawn)
    assert.equal(m.seq, 2)
    const relisted = await list(V, p)
    assert.deepEqual(
      relisted.conversations[0]!.contributors.map((c) => c.actorId),
      [E],
    )
    assert.equal(relisted.conversations[0]!.lastMessage?.text, 'Map first, list second?')
    // Two places taken, the second withdrawn: the highest stays 2 (withdrawal never lowers it); the opening is seq 1's.
    assert.equal(relisted.conversations[0]!.messageSeq, 2)
    assert.equal(relisted.conversations[0]!.lastMessage?.seq, 1)
    assert.equal(await codeOf(send(F, r.conversationId, 'A detail I regret', { key })), 'request_erased')
    const [stored] = await owner<{ body: string | null; author_name: string | null }>(
      `SELECT body, author_name FROM sophia.conversation_messages WHERE id = $1`,
      [s.messageId],
    )
    assert.deepEqual(stored, { body: null, author_name: null })
    const [request] = await owner<{ semantic_request: unknown }>(
      `SELECT semantic_request FROM sophia.conversation_requests WHERE idempotency_key = $1`,
      [key],
    )
    assert.deepEqual(request!.semantic_request, { redacted: true })
  })

  it('an author made a viewer since still withdraws their own; an admin withdraws any', async () => {
    const p = await project()
    const r = await start(E, p)
    const s = await send(F, r.conversationId, 'Mine')
    await owner(`UPDATE sophia.project_members SET role = 'viewer' WHERE project_id = $1 AND actor_id = $2`, [p, F])
    await withdraw(F, r.conversationId, s.messageId)
    await withdraw(A, r.conversationId, r.messageId)
    assert.deepEqual(
      (await page(V, r.conversationId)).messages.map((m) => m.text),
      [null, null],
    )
  })

  it('an open reply request whose history reaches the withdrawn text is cancelled', async () => {
    const p = await project()
    const r = await start(E, p)
    const s = await send(E, r.conversationId, 'Secret')
    const asked = await send(F, r.conversationId, 'Sophia, thoughts?', { ask: true })
    // A request still open (G2 opens them; set here by the owner to exercise the withdrawal's reach).
    await owner(`UPDATE sophia.conversation_replies SET state='pending', reason=NULL, settled_at=NULL WHERE id = $1`, [
      asked.replyId,
    ])
    await withdraw(E, r.conversationId, s.messageId)
    const m = await message(V, asked.messageId)
    assert.equal(m.ask?.state, 'cancelled')
    assert.equal(m.ask?.reason, 'source_withdrawn')
  })

  it('an admin erases a conversation: it leaves every read and its keys cannot replay', async () => {
    const p = await project()
    const key = randomUUID()
    const r = await start(E, p, { key })
    const keep = await start(E, p)
    assert.equal(await codeOf(erase(E, r.conversationId)), 'forbidden')
    await erase(A, r.conversationId)
    assert.deepEqual(
      (await list(V, p)).conversations.map((c) => c.id),
      [keep.conversationId],
    )
    assert.equal(await codeOf(page(V, r.conversationId)), 'not_found')
    assert.equal(await codeOf(start(E, p, { key })), 'request_erased')
    assert.equal(await codeOf(send(E, r.conversationId, 'Hello?')), 'not_found')
    const [row] = await owner<{ title: string | null; texts: string }>(
      `SELECT c.title, (SELECT count(*) FROM sophia.conversation_messages m WHERE m.conversation_id = c.id AND m.body IS NOT NULL) AS texts
         FROM sophia.conversations c WHERE c.id = $1`,
      [r.conversationId],
    )
    assert.deepEqual(row, { title: null, texts: '0' })
  })
})

/** A call that waits on a lock, seen by the server itself, within `ms`: the ordering is proved, never slept for. */
async function waitsOnLock(observer: pg.Client, call: string, ms = 3000): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const { rows } = await observer.query(
      `SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE $1`,
      [`%${call}%`],
    )
    if (rows.length > 0) return
    await delay(20)
  }
  throw new Error(`${call} never waited on the project's row`)
}

/** A promise that settles within `ms`, or fails the test. */
const within = <T>(p: Promise<T>, ms = 3000): Promise<T> =>
  Promise.race([p, delay(ms).then(() => Promise.reject(new Error(`still waiting after ${String(ms)} ms`)))])

describe("a member removed while their write waits for the project's row (CON-01-CX-0006)", () => {
  it('cannot withdraw: membership is read again once the row is held, and the text stays', async () => {
    const p = await project()
    const r = await start(F, p, { text: 'Synthetic body to preserve' })
    const revoker = new pg.Client({ connectionString: db.ownerUrl })
    const observer = new pg.Client({ connectionString: db.ownerUrl })
    await revoker.connect()
    await observer.connect()
    try {
      await revoker.query('BEGIN')
      await revoker.query('SELECT 1 FROM sophia.projects WHERE id = $1 FOR UPDATE', [p])
      await revoker.query('UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2', [
        p,
        F,
      ])
      const withdrawal = codeOf(withdraw(F, r.conversationId, r.messageId))
      await waitsOnLock(observer, 'withdraw_conversation_message')
      await revoker.query('COMMIT')
      assert.equal(await within(withdrawal), 'not_found')
    } finally {
      await revoker.end()
      await observer.end()
    }
    const [row] = await owner<{ body: string | null }>('SELECT body FROM sophia.conversation_messages WHERE id = $1', [
      r.messageId,
    ])
    assert.equal(row?.body, 'Synthetic body to preserve')
  })

  it('cannot send either, and a member made a viewer meanwhile still withdraws their own', async () => {
    const p = await project()
    const r = await start(F, p)
    const revoker = new pg.Client({ connectionString: db.ownerUrl })
    const observer = new pg.Client({ connectionString: db.ownerUrl })
    await revoker.connect()
    await observer.connect()
    try {
      await revoker.query('BEGIN')
      await revoker.query('SELECT 1 FROM sophia.projects WHERE id = $1 FOR UPDATE', [p])
      await revoker.query('UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2', [
        p,
        F,
      ])
      const sending = codeOf(send(F, r.conversationId, 'After my removal'))
      await waitsOnLock(observer, 'send_conversation_message')
      await revoker.query('COMMIT')
      assert.equal(await within(sending), 'not_found')
      await owner(
        `UPDATE sophia.project_members SET active = true, role = 'viewer' WHERE project_id = $1 AND actor_id = $2`,
        [p, F],
      )
      await revoker.query('BEGIN')
      await revoker.query('SELECT 1 FROM sophia.projects WHERE id = $1 FOR UPDATE', [p])
      const withdrawal = codeOf(withdraw(F, r.conversationId, r.messageId))
      await waitsOnLock(observer, 'withdraw_conversation_message')
      await revoker.query('COMMIT')
      assert.equal(await within(withdrawal), 'resolved')
    } finally {
      await revoker.end()
      await observer.end()
    }
    assert.equal((await page(V, r.conversationId)).messages.length, 1)
  })
})
