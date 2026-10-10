// CON-01 G1 crossing (level: sql-run): saved project conversations through the real API (Fastify, Ajv, the
// synthetic Supabase tokens the other crossings use) and real PostgreSQL. No model, runtime or LiveKit is involved:
// asking Sophia records a reply request that says it is blocked.
import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseConversationErasure,
  parseConversationList,
  parseConversationMessagePage,
  parseConversationMessageSent,
  parseConversationStarted,
  parseConversationWithdrawal,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const O = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let off: FastifyInstance
let base: string
let offBase: string
let projectId: string

const token = (sub: string, email = `${sub.slice(0, 6)}@example.test`) =>
  new SignJWT({ role: 'authenticated', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any

async function call(
  path: string,
  init: { as?: string; email?: string; body?: unknown; key?: string; post?: boolean; at?: string } = {},
) {
  const res = await fetch(`${init.at ?? base}${path}`, {
    method: init.body === undefined && !init.post ? 'GET' : 'POST',
    headers: {
      ...(init.as ? { authorization: `Bearer ${await token(init.as, init.email)}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': init.key } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

/** A write whose reply never reaches the client: the connection is dropped as soon as the server answers. */
async function lostReply(path: string, as: string, key: string, body: unknown): Promise<number> {
  const bearer = await token(as)
  const url = new URL(`${base}${path}`)
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', 'idempotency-key': key },
      },
      (res) => {
        const status = res.statusCode ?? 0
        res.destroy()
        resolve(status)
      },
    )
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
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

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, conversations: true })
  off = buildApp({ pool, verifyActor })
  await app.listen({ port: 0, host: '127.0.0.1' })
  await off.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  offBase = `http://127.0.0.1:${String((off.server.address() as AddressInfo).port)}`
  ;({ projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] }))
  await owner(`SELECT sophia.set_conversation_settings($1, 'enabled', 'CON-01 API test')`, [projectId])
})
after(async () => {
  await app.close()
  await off.close()
  await pool.end()
  await db.drop()
})

const start = (body: unknown, key = randomUUID(), as = E) =>
  call(`/api/v1/projects/${projectId}/conversations`, { as, key, body })
const send = (conversationId: string, body: unknown, key = randomUUID(), as = E) =>
  call(`/api/v1/conversations/${conversationId}/messages`, { as, key, body })

describe('A16 over HTTP', () => {
  it('switched off, no route exists; switched on, every answer matches the contract', async () => {
    assert.equal((await call(`/api/v1/projects/${projectId}/conversations`, { as: E, at: offBase })).status, 404)
    const s = await start({ title: 'Onboarding direction', text: 'Map first?', askSophia: false })
    assert.equal(s.status, 202)
    const started = parseConversationStarted(s.json)
    assert.equal(started.message.actorId, E)
    assert.equal(started.message.name, `${E.slice(0, 6)}@example.test`, "the token's name, not the client's")
    assert.equal(started.sophia, 'not_asked')
    assert.equal(started.reply, null)
    const l = await call(`/api/v1/projects/${projectId}/conversations`, { as: V })
    assert.equal(l.status, 200)
    const listed = parseConversationList(l.json)
    assert.equal(listed.capability.write, false, 'a viewer writes nothing')
    assert.equal(listed.policy?.id, 'conversation-text-v1')
    assert.ok(listed.conversations.some((c) => c.id === started.conversation.id))
    const asked = await send(started.conversation.id, { text: 'Sophia, thoughts?', askSophia: true })
    const sent = parseConversationMessageSent(asked.json)
    assert.equal(sent.sophia, 'asked')
    assert.equal(sent.reply?.state, 'blocked')
    assert.equal(sent.message.ask?.id, sent.reply?.id)
    const p = await call(`/api/v1/conversations/${started.conversation.id}/messages`, { as: V })
    const page = parseConversationMessagePage(p.json)
    assert.deepEqual(
      page.messages.map((m) => m.seq),
      [1, 2],
    )
  })

  it('a body naming an actor, a name, an author, a project or a reply target is refused (CON01-A06)', async () => {
    const good = { title: 'T', text: 'x', askSophia: false }
    for (const extra of [
      { actorId: A },
      { name: 'Davide' },
      { author: 'sophia' },
      { projectId },
      { replyTo: randomUUID() },
    ]) {
      const r = await start({ ...good, ...extra })
      assert.equal(r.status, 422, JSON.stringify(extra))
      assert.equal(r.json.code, 'invalid_request')
    }
    const s = parseConversationStarted((await start(good)).json)
    const r = await send(s.conversation.id, { text: 'Hi', askSophia: false, author: 'sophia' })
    assert.equal(r.status, 422)
    const [n] = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.conversation_messages WHERE author = 'sophia'`,
    )
    assert.equal(n!.n, '0')
  })

  it('a reply lost after the write committed: the retry under its key returns the same records (CON01-A02, A03)', async () => {
    const key = randomUUID()
    const body = { title: 'Presentation narrative', text: 'Lead with the story', askSophia: true }
    assert.equal(await lostReply(`/api/v1/projects/${projectId}/conversations`, E, key, body), 202)
    const retry = parseConversationStarted((await start(body, key)).json)
    const [n] = await owner<{ c: string; r: string }>(
      `SELECT (SELECT count(*) FROM sophia.conversations WHERE project_id=$1 AND title='Presentation narrative') AS c,
              (SELECT count(*) FROM sophia.conversation_replies r JOIN sophia.conversations c ON c.id=r.conversation_id
                WHERE c.title='Presentation narrative') AS r`,
      [projectId],
    )
    assert.deepEqual(n, { c: '1', r: '1' })
    const sendKey = randomUUID()
    const msg = { text: 'And the numbers after', askSophia: true }
    assert.equal(await lostReply(`/api/v1/conversations/${retry.conversation.id}/messages`, E, sendKey, msg), 202)
    const again = parseConversationMessageSent((await send(retry.conversation.id, msg, sendKey)).json)
    const p = parseConversationMessagePage(
      (await call(`/api/v1/conversations/${retry.conversation.id}/messages`, { as: E })).json,
    )
    assert.deepEqual(
      p.messages.map((m) => m.id),
      [retry.message.id, again.message.id],
    )
    const changed = await send(retry.conversation.id, { ...msg, askSophia: false }, sendKey)
    assert.equal(changed.status, 409)
    assert.equal(changed.json.code, 'idempotency_conflict')
  })

  it('a start receipt names the feed position it is current at, read under its own lock (PR #199 r4237924424)', async () => {
    const key = randomUUID()
    const body = { title: 'Where it is current', text: 'First words', askSophia: false }
    const receipt = parseConversationStarted((await start(body, key)).json)
    const position = async () =>
      (
        await owner<{ seq: string }>(`SELECT event_sequence::text AS seq FROM sophia.projects WHERE id=$1`, [projectId])
      )[0]?.seq
    const [own] = await owner<{ sequence: string; entity_id: string }>(
      `SELECT sequence::text, entity_id::text FROM sophia.project_events WHERE project_id=$1 ORDER BY sequence DESC LIMIT 1`,
      [projectId],
    )
    // Its own start is the last event: the receipt is current exactly there.
    assert.deepEqual(own, { sequence: receipt.cursor, entity_id: receipt.conversation.id })
    assert.equal(await position(), receipt.cursor)
    // An event past it: the replay under the same key reads again, and says where it is current now.
    const other = parseConversationStarted((await start({ title: 'Elsewhere', text: 'Moves', askSophia: false })).json)
    const replay = parseConversationStarted((await start(body, key)).json)
    assert.equal(replay.conversation.id, receipt.conversation.id)
    assert.equal(replay.message.id, receipt.message.id)
    assert.equal(replay.cursor, other.cursor)
    assert.ok(BigInt(replay.cursor) > BigInt(receipt.cursor))
    // Its first message withdrawn after the start: no replay of the start holds its words.
    const w = await call(`/api/v1/conversations/${receipt.conversation.id}/messages/${receipt.message.id}/withdrawal`, {
      as: E,
      key: randomUUID(),
      post: true,
    })
    assert.equal(w.status, 202)
    const erased = await start(body, key)
    assert.equal(erased.status, 409)
    assert.equal(erased.json.code, 'request_erased')
  })

  it('who may: viewer writes refused, outsiders read nothing, and the codes say so (CON01-A05)', async () => {
    const s = parseConversationStarted((await start({ title: 'Members only', text: 'Hello', askSophia: false })).json)
    assert.equal((await start({ title: 'V', text: 'v', askSophia: false }, randomUUID(), V)).status, 403)
    assert.equal((await send(s.conversation.id, { text: 'v', askSophia: false }, randomUUID(), V)).status, 403)
    assert.equal((await call(`/api/v1/projects/${projectId}/conversations`, { as: O })).status, 403)
    const page = await call(`/api/v1/conversations/${s.conversation.id}/messages`, { as: O })
    assert.equal(page.status, 422)
    assert.equal(page.json.code, 'not_found')
    assert.equal((await call(`/api/v1/conversations/${s.conversation.id}/messages`)).status, 401)
  })

  it('withdrawal and erasure over HTTP, and the replay of a withdrawn text refused (CON-01-T04)', async () => {
    const s = parseConversationStarted((await start({ title: 'To forget', text: 'Keep', askSophia: false })).json)
    const key = randomUUID()
    const m = parseConversationMessageSent(
      (await send(s.conversation.id, { text: 'Forget me', askSophia: false }, key)).json,
    )
    const w = await call(`/api/v1/conversations/${s.conversation.id}/messages/${m.message.id}/withdrawal`, {
      as: E,
      key: randomUUID(),
      post: true,
    })
    assert.equal(w.status, 202)
    const withdrawn = parseConversationWithdrawal(w.json)
    assert.equal(withdrawn.message.text, null)
    assert.ok(withdrawn.message.withdrawn)
    const replay = await send(s.conversation.id, { text: 'Forget me', askSophia: false }, key)
    assert.equal(replay.status, 409)
    assert.equal(replay.json.code, 'request_erased')
    const notMine = await call(`/api/v1/conversations/${s.conversation.id}/erasure`, {
      as: E,
      key: randomUUID(),
      post: true,
    })
    assert.equal(notMine.status, 403)
    const e = await call(`/api/v1/conversations/${s.conversation.id}/erasure`, { as: A, key: randomUUID(), post: true })
    assert.equal(e.status, 202)
    assert.deepEqual(parseConversationErasure(e.json), { conversationId: s.conversation.id, erased: true })
    const l = parseConversationList((await call(`/api/v1/projects/${projectId}/conversations`, { as: V })).json)
    assert.ok(!l.conversations.some((c) => c.id === s.conversation.id))
  })

  it("another conversation's cursor is refused before anything is read (CON01-A07)", async () => {
    const a = parseConversationStarted((await start({ title: 'A', text: 'a', askSophia: false })).json)
    const b = parseConversationStarted((await start({ title: 'B', text: 'b', askSophia: false })).json)
    for (let i = 0; i < 52; i++) await send(a.conversation.id, { text: `a${i}`, askSophia: false })
    const pa = parseConversationMessagePage(
      (await call(`/api/v1/conversations/${a.conversation.id}/messages`, { as: V })).json,
    )
    assert.ok(pa.before)
    const cross = await call(
      `/api/v1/conversations/${b.conversation.id}/messages?before=${encodeURIComponent(pa.before)}`,
      { as: V },
    )
    assert.equal(cross.status, 422)
    assert.equal(cross.json.code, 'invalid_request')
  })

  it("a member removed while their withdrawal waits for the project's row is refused, and the text stays (CON-01-CX-0006)", async () => {
    const member = randomUUID()
    await owner(`INSERT INTO sophia.project_members(project_id, actor_id, role) VALUES ($1, $2, 'editor')`, [
      projectId,
      member,
    ])
    const s = parseConversationStarted(
      (await start({ title: 'Race', text: 'Synthetic body to preserve', askSophia: false }, randomUUID(), member)).json,
    )
    const revoker = new pg.Client({ connectionString: db.ownerUrl })
    const observer = new pg.Client({ connectionString: db.ownerUrl })
    await revoker.connect()
    await observer.connect()
    try {
      await revoker.query('BEGIN')
      await revoker.query('SELECT 1 FROM sophia.projects WHERE id = $1 FOR UPDATE', [projectId])
      await revoker.query('UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2', [
        projectId,
        member,
      ])
      const withdrawal = call(`/api/v1/conversations/${s.conversation.id}/messages/${s.message.id}/withdrawal`, {
        as: member,
        key: randomUUID(),
        post: true,
      })
      // The ordering is seen by the server itself (the call waits on the project's row), within a bound; never slept for.
      const until = Date.now() + 3000
      let waiting = false
      while (!waiting && Date.now() < until) {
        const { rows } = await observer.query(
          `SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%withdraw_conversation_message%'`,
        )
        waiting = rows.length > 0
        if (!waiting) await delay(20)
      }
      assert.ok(waiting, 'the withdrawal waited on the project row')
      await revoker.query('COMMIT')
      const r = await Promise.race([withdrawal, delay(3000).then(() => Promise.reject(new Error('no answer in 3 s')))])
      assert.equal(r.status, 422)
      assert.equal(r.json.code, 'not_found')
    } finally {
      await revoker.end()
      await observer.end()
    }
    const [row] = await owner<{ body: string | null }>('SELECT body FROM sophia.conversation_messages WHERE id = $1', [
      s.message.id,
    ])
    assert.equal(row?.body, 'Synthetic body to preserve')
  })

  it("/ready needs 0048's functions only while conversations are served", async () => {
    assert.equal((await call('/ready')).status, 200)
    assert.equal((await call('/ready', { at: offBase })).status, 200)
    await owner(`ALTER FUNCTION sophia.conversation_access(uuid) RENAME TO conversation_access_hidden`)
    try {
      const r = await call('/ready')
      assert.equal(r.status, 503)
      assert.equal(r.json.reason, 'schema')
      assert.equal(
        (await call('/ready', { at: offBase })).status,
        200,
        'the API without conversations needs nothing of 0048',
      )
    } finally {
      await owner(`ALTER FUNCTION sophia.conversation_access_hidden(uuid) RENAME TO conversation_access`)
    }
  })
})
