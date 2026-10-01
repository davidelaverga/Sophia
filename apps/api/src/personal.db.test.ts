// PS-01 crossing (level: sql-run): the personal routes over real HTTP, the real API and PostgreSQL, with the keyless
// rehearsal companion. Members call with synthetic Supabase tokens. No model, LiveKit or Google is involved.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parsePersonalExport,
  parsePersonalReceipt,
  parsePersonalSpace,
  parsePersonalTurnPage,
  parseProjectList,
} from '@sophia/contracts/validate'
import { createPool, sendPersonalTurn, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { rehearsalCompanion } from './companion-rehearsal.ts'
import { ANSWER_LIMIT_MS } from './companion.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const ANA = randomUUID() // editor of the project, with her own space
const LEAD = randomUUID() // admin of the project
const OUT = randomUUID() // another person, in no project
const GUEST = randomUUID() // an anonymous guest

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let quiet: FastifyInstance // the same API with no companion configured
let base: string
let quietBase: string
let projectId: string

const token = (sub: string, claims: Record<string, unknown>) =>
  new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

const claimsOf = (sub: string) =>
  sub === GUEST
    ? { is_anonymous: true }
    : { email: `${sub === ANA ? 'ana' : sub === LEAD ? 'lead' : 'out'}@sophia.test` }

async function call(path: string, init: { as: string; body?: unknown; key?: string; at?: string }) {
  const res = await fetch(`${init.at ?? base}${path}`, {
    method: init.body === undefined && !init.key ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${await token(init.as, claimsOf(init.as))}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': init.key } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: unknown = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

const write = async (path: string, as: string, body?: unknown) => {
  const r = await call(path, { as, body, key: randomUUID() })
  assert.equal(r.status, 202, JSON.stringify(r.json))
  return parsePersonalReceipt(r.json)
}

const space = async (as: string) => parsePersonalSpace((await call('/api/v1/personal', { as })).json)

/** As the migration owner: what the API role may not do (age a turn, take a function away). */
async function owner(sql: string, params: unknown[] = []): Promise<void> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    await c.query(sql, params)
  } finally {
    await c.end()
  }
}

/** Poll as a client does until no reply is pending. */
async function settled(as: string) {
  for (let i = 0; i < 50; i++) {
    const page = parsePersonalTurnPage((await call('/api/v1/personal/turns?after=0', { as })).json)
    if (!page.pending) return page
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('the companion never answered')
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  projectId = (await seedProject(db.ownerUrl, { title: 'Launch plan', admin: LEAD, editors: [ANA] })).projectId
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, companion: rehearsalCompanion(0) })
  quiet = buildApp({ pool, verifyActor })
  await app.listen({ port: 0, host: '127.0.0.1' })
  await quiet.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  quietBase = `http://127.0.0.1:${String((quiet.server.address() as AddressInfo).port)}`
})
after(async () => {
  await app.close()
  await quiet.close()
  await pool.end()
  await db.drop()
})

describe('personal routes', () => {
  it('refuse a guest, and a message where no companion runs keeps nothing', async () => {
    assert.equal((await call('/api/v1/personal', { as: GUEST })).status, 403)
    const refused = await call('/api/v1/personal/turns', {
      as: ANA,
      body: { text: 'Hello' },
      key: randomUUID(),
      at: quietBase,
    })
    assert.equal(refused.status, 503)
    const empty = parsePersonalSpace((await call('/api/v1/personal', { as: ANA, at: quietBase })).json)
    assert.deepEqual([empty.companion, empty.turns.length], ['unavailable', 0])
  })

  it('answer a message with the companion, and suggest a note without keeping it', async () => {
    const sent = await write('/api/v1/personal/turns', ANA, { text: 'I have a pitch on Friday and I cannot sleep' })
    assert.equal(sent.operation, 'send_turn')
    const page = await settled(ANA)
    assert.deepEqual(
      page.turns.map((t) => t.author),
      ['person', 'sophia'],
    )
    assert.equal(page.turns[1]?.suggestion?.text, 'Preparing a pitch for Friday')
    const mine = await space(ANA)
    assert.equal(mine.companion, 'rehearsal')
    assert.equal(mine.notes.length, 0)
    // Nobody else reads it.
    for (const other of [LEAD, OUT]) assert.deepEqual((await space(other)).turns, [])
  })

  it('carry a kept note to her project, where its members read it as hers, and take it back', async () => {
    const suggestion = (await space(ANA)).turns.find((t) => t.suggestion)?.suggestion
    assert.ok(suggestion)
    const kept = await write(`/api/v1/personal/suggestions/${suggestion.id}/decision`, ANA, { decision: 'keep' })
    assert.ok(kept.noteId)
    const carried = await write(`/api/v1/personal/notes/${kept.noteId}/carry`, ANA, { projectId })
    const lead = parseProjectList((await call('/api/v1/projects', { as: LEAD })).json)
    assert.deepEqual(
      lead.projects[0]?.releases.map((r) => [r.text, r.ownerName, r.mine]),
      [['Preparing a pitch for Friday', 'ana@sophia.test', false]],
    )
    assert.deepEqual(parseProjectList((await call('/api/v1/projects', { as: OUT })).json).projects, [])
    const hers = parseProjectList((await call('/api/v1/projects', { as: ANA })).json).projects[0]
    assert.deepEqual([hers?.title, hers?.role, hers?.members, hers?.room], ['Launch plan', 'editor', 2, null])
    assert.equal(hers?.releases[0]?.mine, true)
    await write(`/api/v1/personal/releases/${carried.releaseId}/take-back`, ANA)
    const back = parseProjectList((await call('/api/v1/projects', { as: LEAD })).json)
    assert.deepEqual(back.projects[0]?.releases, [])
    assert.equal((await space(ANA)).notes[0]?.text, 'Preparing a pitch for Friday')
  })

  it('welcome her back after a quiet spell, once', async () => {
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [ANA])
    const welcomed = await write('/api/v1/personal/resume', ANA, { name: 'Ana' })
    assert.equal(welcomed.operation, 'resume')
    assert.ok(welcomed.turnId)
    assert.equal((await write('/api/v1/personal/resume', ANA, { name: 'Ana' })).turnId, null)
    const last = (await space(ANA)).turns.at(-1)
    assert.match(last?.text ?? '', /^Welcome back, Ana\./)
  })

  it('export everything, then erase it for good', async () => {
    const everything = parsePersonalExport((await call('/api/v1/personal/export', { as: ANA })).json)
    assert.equal(everything.turns.length, 3)
    assert.equal(everything.notes.length, 1)
    const refused = await call('/api/v1/personal/erasure', { as: ANA, body: { confirm: 'yes' }, key: randomUUID() })
    assert.equal(refused.status, 422)
    const erased = await write('/api/v1/personal/erasure', ANA, { confirm: 'delete' })
    assert.deepEqual(erased.erased, { turns: 3, notes: 1, suggestions: 1 })
    const erasedSpace = await space(ANA)
    assert.deepEqual([erasedSpace.turns.length, erasedSpace.notes.length], [0, 0])
  })

  it('let her ask again for a reply lost with the process answering it', async () => {
    // The turn committed and the API went away before answering (a deploy, a crash): nothing marks it failed.
    const lost = await withActor(pool, ANA, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Did that go through?'))
    const retry = `/api/v1/personal/turns/${lost.turnId ?? ''}/retry`
    assert.equal((await call(retry, { as: ANA, key: randomUUID() })).status, 409, 'not while it may still come')
    await owner(`UPDATE sophia.personal_turns SET asked_at = now() - interval '121 seconds' WHERE id = $1`, [
      lost.turnId,
    ])
    assert.equal((await space(ANA)).turns.find((t) => t.id === lost.turnId)?.reply, 'failed')
    await write(retry, ANA)
    const page = await settled(ANA)
    assert.equal(page.turns.find((t) => t.id === lost.turnId)?.reply, 'answered')
    assert.equal(page.turns.at(-1)?.replyTo, lost.turnId)
    // The database reads a wait as lost after two minutes (0021): longer than any answer may take.
    assert.ok(ANSWER_LIMIT_MS < 120_000)
  })
})

// Last: it takes part of the personal space out of the database.
describe('readiness', () => {
  it('fails while the personal space is missing from the database', async () => {
    assert.equal((await fetch(`${base}/ready`)).status, 200)
    await owner('DROP FUNCTION sophia.send_personal_turn(text,text)')
    const res = await fetch(`${base}/ready`)
    assert.deepEqual([res.status, await res.json()], [503, { ready: false, reason: 'schema' }])
  })
})
