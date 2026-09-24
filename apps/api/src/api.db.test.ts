// S1-02 acceptance through real HTTP (level: sql-run). Synthetic HS256 tokens stand in for Supabase
// Auth; the live Supabase crossing is a separate check.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Receipt, Snapshot } from '@sophia/contracts'
import { parseSse, type Frame, type SseParse } from '@sophia/contracts/sse'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID()
const B = randomUUID()
const V = randomUUID()
const C = randomUUID()

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let base: string
let seed: SeededProject

async function token(sub: string, over: { iss?: string; role?: string; exp?: string } = {}): Promise<string> {
  return new SignJWT({ role: over.role ?? 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(over.iss ?? ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(over.exp ?? '5m')
    .sign(new TextEncoder().encode(SECRET))
}

// Response shapes vary per endpoint and assertions read their fields directly.
// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any

async function call(
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(actor ? { authorization: `Bearer ${await token(actor)}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

const command = (over: Record<string, unknown> = {}) => ({
  kind: 'request_review',
  goalId: seed.goalId,
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
  bodySourceId: null,
  ...over,
})

/** A count read as the migration owner: RLS bypassed on purpose, to see what really exists. */
async function ownerCount(sql: string, params: unknown[]): Promise<number> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    const { rows } = await c.query<{ n: number }>(sql, params)
    return rows[0]?.n ?? 0
  } finally {
    await c.end()
  }
}

const countCommands = (key: string) =>
  ownerCount(`SELECT count(*)::int AS n FROM sophia.commands WHERE idempotency_key = $1`, [key])

interface FollowedStream {
  status: number
  frames: Frame[]
  /** SSE `id` of each frame: must equal its decimal sequence. */
  ids: Array<string | null>
  /** True when the server closed the stream (not the test's abort). */
  ended: boolean
  done: Promise<void>
}

/** Read SSE chunks through the shared parser until `onChunk` says stop, the server ends, or timeout. */
async function readSse(
  res: Response,
  ctrl: AbortController,
  timeoutMs: number,
  onChunk: (parsed: SseParse) => boolean,
): Promise<boolean> {
  if (res.status !== 200 || !res.body) return false
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let rest = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return true
      const parsed = parseSse(rest + value)
      rest = parsed.rest
      if (onChunk(parsed)) {
        ctrl.abort()
        return false
      }
    }
  } catch {
    return false // aborted by the test or its timeout
  } finally {
    clearTimeout(timer)
  }
}

/** Follow a project's events as `actor` until `until(frames)` holds or `timeoutMs` passes. */
async function follow(
  actor: string,
  projectId: string,
  cursor: string,
  until: (frames: Frame[]) => boolean,
  timeoutMs = 5000,
): Promise<FollowedStream> {
  const ctrl = new AbortController()
  const res = await fetch(`${base}/api/v1/projects/${projectId}/events?after=${cursor}`, {
    headers: { authorization: `Bearer ${await token(actor)}` },
    signal: ctrl.signal,
  })
  const stream: FollowedStream = { status: res.status, frames: [], ids: [], ended: false, done: Promise.resolve() }
  stream.done = readSse(res, ctrl, timeoutMs, (parsed) => {
    stream.frames.push(...parsed.frames)
    stream.ids.push(...parsed.ids)
    return until(stream.frames)
  }).then((ended) => {
    stream.ended = ended
  })
  return stream
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, 8)
  seed = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
  app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
    eventPollMs: 500,
  })
  // Test-only: drop the connection after the handler committed, before the client reads the reply.
  app.addHook('onSend', (req, _reply, payload, done) => {
    if (req.headers['x-test-drop-reply']) req.raw.socket.destroy()
    done(null, payload)
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
})

after(async () => {
  await app?.close()
  await pool?.end()
  await db?.drop()
})

describe('authentication', () => {
  it('requires a valid authenticated-user token', async () => {
    const path = `/api/v1/projects/${seed.projectId}/snapshot`
    assert.equal((await call(null, 'GET', path)).status, 401)
    for (const bad of [
      await token(A, { iss: 'https://evil.test' }),
      await token(A, { role: 'anon' }),
      await token(A, { exp: '-1m' }),
    ]) {
      const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${bad}` } })
      assert.equal(res.status, 401)
      assert.equal(((await res.json()) as { code: string }).code, 'actor_context_required')
    }
  })

  it('is ready only as the sophia_api login', async () => {
    assert.deepEqual((await call(null, 'GET', '/ready')).json, { ready: true })
  })
})

describe('two members see the same project; a third account cannot', () => {
  it('serves one consistent snapshot to both members and 403 to an outsider', async () => {
    const a = await call(A, 'GET', `/api/v1/projects/${seed.projectId}/snapshot`)
    const b = await call(B, 'GET', `/api/v1/projects/${seed.projectId}/snapshot`)
    const c = await call(C, 'GET', `/api/v1/projects/${seed.projectId}/snapshot`)
    const unknown = await call(A, 'GET', `/api/v1/projects/${randomUUID()}/snapshot`)
    assert.equal(a.status, 200)
    assert.deepEqual(b.json, a.json)
    assert.equal((a.json as Snapshot).goals[0]?.id, seed.goalId)
    assert.equal(c.status, 403)
    assert.equal(unknown.status, 403)
  })
})

describe('command admission', () => {
  it('returns 202 and the same receipt for the same key; conflicts on a different payload', async () => {
    const key = randomUUID()
    const path = `/api/v1/projects/${seed.projectId}/commands`
    const first = await call(A, 'POST', path, command(), { 'idempotency-key': key })
    const again = await call(A, 'POST', path, command(), { 'idempotency-key': key })
    const other = await call(A, 'POST', path, command({ kind: 'steer', bodySourceId: seed.sourceId }), {
      'idempotency-key': key,
    })
    assert.equal(first.status, 202)
    assert.equal((first.json as Receipt).stage, 'admitted')
    assert.deepEqual(again, first)
    assert.equal(other.status, 409)
    assert.equal(other.json.code, 'idempotency_conflict')
    assert.equal(await countCommands(key), 1)
  })

  it('recovers the existing command after a disconnect between commit and acknowledgement', async () => {
    const key = randomUUID()
    const path = `/api/v1/projects/${seed.projectId}/commands`
    await assert.rejects(
      call(A, 'POST', path, command(), { 'idempotency-key': key, 'x-test-drop-reply': '1' }),
      /fetch\ failed/,
    )
    assert.equal(await countCommands(key), 1) // it committed; the client just never heard
    const retry = await call(A, 'POST', path, command(), { 'idempotency-key': key })
    assert.equal(retry.status, 202)
    assert.equal(await countCommands(key), 1) // no second effect
  })

  it('rejects stale revisions, viewers, outsiders and invalid shapes', async () => {
    const path = `/api/v1/projects/${seed.projectId}/commands`
    const stale = await call(A, 'POST', path, command({ expectedGoalRevision: 9 }), {
      'idempotency-key': randomUUID(),
    })
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
    assert.equal((await call(V, 'POST', path, command(), { 'idempotency-key': randomUUID() })).status, 403)
    assert.equal((await call(C, 'POST', path, command(), { 'idempotency-key': randomUUID() })).status, 403)
    assert.equal((await call(A, 'POST', path, command())).status, 422) // no Idempotency-Key
    assert.equal(
      (await call(A, 'POST', path, { ...command(), actorId: B }, { 'idempotency-key': randomUUID() })).status,
      422,
    ) // no actor spoofing field
    const res = await call(
      A,
      'POST',
      path,
      { ...command(), kind: 'delete_everything' },
      { 'idempotency-key': randomUUID() },
    )
    assert.deepEqual([res.status, res.json.retry], [422, 'never'])
  })
})

describe('createProject', () => {
  const projectsForKey = (key: string) =>
    ownerCount(`SELECT count(project_id)::int AS n FROM sophia.project_creations WHERE idempotency_key = $1`, [key])

  it('returns 201 with a project only its creator can open', async () => {
    const created = await call(
      A,
      'POST',
      '/api/v1/projects',
      { title: 'Founder project' },
      { 'idempotency-key': randomUUID() },
    )
    assert.equal(created.status, 201)
    assert.equal(created.json.cursor, '0')
    const mine = await call(A, 'GET', `/api/v1/projects/${created.json.projectId}/snapshot`)
    assert.deepEqual([mine.status, mine.json.title, mine.json.goals], [200, 'Founder project', []])
    assert.equal((await call(B, 'GET', `/api/v1/projects/${created.json.projectId}/snapshot`)).status, 403)
  })

  it('recovers the same project after a disconnect between commit and acknowledgement', async () => {
    const key = randomUUID()
    await assert.rejects(
      call(
        A,
        'POST',
        '/api/v1/projects',
        { title: 'Lost reply' },
        { 'idempotency-key': key, 'x-test-drop-reply': '1' },
      ),
      /fetch\ failed/,
    )
    assert.equal(await projectsForKey(key), 1) // committed; the client never heard
    const retry = await call(A, 'POST', '/api/v1/projects', { title: 'Lost reply' }, { 'idempotency-key': key })
    const again = await call(A, 'POST', '/api/v1/projects', { title: 'Lost reply' }, { 'idempotency-key': key })
    assert.equal(retry.status, 201)
    assert.deepEqual(again.json, retry.json)
    assert.equal(await projectsForKey(key), 1) // still exactly one project
  })

  it('conflicts on a reused key with another title and validates the request', async () => {
    const key = randomUUID()
    await call(A, 'POST', '/api/v1/projects', { title: 'One' }, { 'idempotency-key': key })
    const conflict = await call(A, 'POST', '/api/v1/projects', { title: 'Two' }, { 'idempotency-key': key })
    assert.deepEqual([conflict.status, conflict.json.code, conflict.json.retry], [409, 'idempotency_conflict', 'never'])
    assert.equal((await call(A, 'POST', '/api/v1/projects', { title: 'No key' })).status, 422)
    assert.equal(
      (await call(A, 'POST', '/api/v1/projects', { title: '' }, { 'idempotency-key': randomUUID() })).status,
      422,
    )
    assert.equal(
      (await call(A, 'POST', '/api/v1/projects', { title: 'x'.repeat(181) }, { 'idempotency-key': randomUUID() }))
        .status,
      422,
    )
    assert.equal(
      (await call(A, 'POST', '/api/v1/projects', { title: 'Spoof', createdBy: B }, { 'idempotency-key': randomUUID() }))
        .status,
      422,
    )
    assert.equal(
      (await call(null, 'POST', '/api/v1/projects', { title: 'Anon' }, { 'idempotency-key': randomUUID() })).status,
      401,
    )
  })
})

describe('snapshot + SSE replay', () => {
  it("delivers another member's admitted command live, then replays without duplicates", async () => {
    const snap = (await call(A, 'GET', `/api/v1/projects/${seed.projectId}/snapshot`)).json as Snapshot
    const live = await follow(A, seed.projectId, snap.cursor, (f) => f.some((x) => x.type === 'command.admitted'))
    assert.equal(live.status, 200)
    const receipt = (
      await call(B, 'POST', `/api/v1/projects/${seed.projectId}/commands`, command(), {
        'idempotency-key': randomUUID(),
      })
    ).json as Receipt
    await live.done
    const got = live.frames.find((f) => f.type === 'command.admitted')
    assert.equal(got?.sequence, receipt.cursor)
    assert.equal(live.ids.at(-1), receipt.cursor)

    // Reconnect from the last applied cursor: nothing is repeated.
    const resumed = await follow(A, seed.projectId, receipt.cursor, () => false, 800)
    await resumed.done
    assert.deepEqual(resumed.frames, [])

    // Replay from zero: contiguous, every sequence once, ends at the receipt cursor.
    const replay = await follow(A, seed.projectId, '0', (f) => f.at(-1)?.sequence === receipt.cursor)
    await replay.done
    const seqs = replay.frames.map((f) => BigInt(f.sequence))
    assert.deepEqual(
      seqs,
      seqs.map((_, i) => BigInt(i + 1)),
    )
  })

  it('refuses an outsider before streaming and ends the stream when membership is revoked', async () => {
    const outsider = await follow(C, seed.projectId, '0', () => true, 500)
    assert.equal(outsider.status, 403)

    const fresh = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    const snap = (await call(B, 'GET', `/api/v1/projects/${fresh.projectId}/snapshot`)).json as Snapshot
    const stream = await follow(B, fresh.projectId, snap.cursor, () => false, 4000)
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    await owner.query(`UPDATE sophia.project_members SET active = false WHERE project_id = $1 AND actor_id = $2`, [
      fresh.projectId,
      B,
    ])
    await owner.end()
    await call(
      A,
      'POST',
      `/api/v1/projects/${fresh.projectId}/commands`,
      { ...command(), goalId: fresh.goalId },
      { 'idempotency-key': randomUUID() },
    )
    await stream.done
    assert.equal(stream.ended, true) // closed by the server, not by the test timeout
    assert.deepEqual(stream.frames, []) // the revoked member never saw the new event
  })

  it('rejects a malformed cursor', async () => {
    assert.equal((await call(A, 'GET', `/api/v1/projects/${seed.projectId}/events?after=01`)).status, 422)
    assert.equal((await call(A, 'GET', `/api/v1/projects/${seed.projectId}/events`)).status, 422)
  })
})
