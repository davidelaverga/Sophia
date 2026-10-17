// S1-02 acceptance through real HTTP (level: sql-run). Synthetic HS256 tokens stand in for Supabase
// Auth; the live Supabase crossing is a separate check.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { asErrorBody, parseProjectCreated, parseReceipt, parseSnapshot } from '@sophia/contracts/validate'
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
  pool = createPool(db.apiUrl, { max: 8 })
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

describe('authentication is enforced by the API itself', () => {
  it('cannot be skipped by percent-encoding the path (review of #4)', async () => {
    const encoded = `/%61pi/v1/projects/${seed.projectId}/snapshot`
    const anonymous = await call(null, 'GET', encoded)
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.json.code, 'actor_context_required')
    assert.equal((await call(A, 'GET', encoded)).status, 200) // the same route, authenticated
  })

  it('keeps health and readiness public, and refuses unknown paths without a token', async () => {
    assert.equal((await call(null, 'GET', '/health')).status, 200)
    assert.equal((await call(null, 'GET', '/ready')).status, 200)
    assert.equal((await call(null, 'GET', '/api/v1/nowhere')).status, 401)
  })

  it('accepts only lowercase canonical project ids', async () => {
    const upper = await call(A, 'GET', `/api/v1/projects/${seed.projectId.toUpperCase()}/snapshot`)
    const urn = await call(A, 'GET', `/api/v1/projects/urn:uuid:${seed.projectId}/snapshot`)
    assert.deepEqual([upper.status, urn.status], [422, 422])
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
    assert.equal(parseSnapshot(a.json).goals[0]?.id, seed.goalId) // the reply meets the contract
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
    assert.equal(parseReceipt(first.json).stage, 'admitted')
    assert.deepEqual(again, first)
    assert.equal(other.status, 409)
    assert.equal(asErrorBody(other.json)?.code, 'idempotency_conflict') // a contract Error body
    assert.equal(await countCommands(key), 1)
  })

  it('retires a completed goal’s sessions for an admin only, with its own receipt (0075, A41)', async () => {
    const fresh = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const path = `/api/v1/projects/${fresh.projectId}/commands`
    const retire = (over: Record<string, unknown> = {}) =>
      command({ kind: 'retire_sessions', goalId: fresh.goalId, ...over })
    // Not completed yet: the command is refused, and Stop and Hold remain the goal's.
    const early = await call(A, 'POST', path, retire(), { 'idempotency-key': randomUUID() })
    assert.deepEqual([early.status, asErrorBody(early.json)?.code], [409, 'invalid_state'])
    // FIXTURE: the goal completed, as the review flow completes it (this file has no runtime).
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      await owner.query(`UPDATE sophia.goals SET status='completed' WHERE project_id=$1 AND id=$2`, [
        fresh.projectId,
        fresh.goalId,
      ])
    } finally {
      await owner.end()
    }
    // A retirement carries no body: the contract refuses one before the database is reached (R-C75-04).
    const withBody = await call(A, 'POST', path, retire({ bodySourceId: seed.sourceId }), {
      'idempotency-key': randomUUID(),
    })
    assert.equal(withBody.status, 422) // and nothing moved: the admission below still expects epoch 1
    const editor = await call(B, 'POST', path, retire(), { 'idempotency-key': randomUUID() })
    assert.equal(editor.status, 403, 'an editor may Stop, never retire')
    const key = randomUUID()
    const first = await call(A, 'POST', path, retire(), { 'idempotency-key': key })
    assert.equal(first.status, 202)
    const receipt = parseReceipt(first.json) // the A41 receipt meets the contract
    assert.deepEqual(
      [receipt.stage, receipt.goalRevision, receipt.authorityEpoch, receipt.targets],
      ['admitted', 1, 2, []],
    )
    assert.deepEqual(await call(A, 'POST', path, retire(), { 'idempotency-key': key }), first)
    const other = await call(A, 'POST', path, retire({ expectedAuthorityEpoch: 2 }), { 'idempotency-key': key })
    assert.equal(asErrorBody(other.json)?.code, 'idempotency_conflict')
    const goal = parseSnapshot((await call(A, 'GET', `/api/v1/projects/${fresh.projectId}/snapshot`)).json).goals.find(
      (g) => g.id === fresh.goalId,
    )
    assert.deepEqual([goal?.status, goal?.revision, goal?.authorityEpoch], ['completed', 1, 2])
  })

  it('recovers the existing command after a disconnect between commit and acknowledgement', async () => {
    const key = randomUUID()
    const path = `/api/v1/projects/${seed.projectId}/commands`
    await assert.rejects(
      call(A, 'POST', path, command(), { 'idempotency-key': key, 'x-test-drop-reply': '1' }),
      /fetch failed/,
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
    assert.deepEqual([stale.status, asErrorBody(stale.json)?.code], [409, 'stale_revision'])
    const viewer = await call(V, 'POST', path, command(), { 'idempotency-key': randomUUID() })
    const outsider = await call(C, 'POST', path, command(), { 'idempotency-key': randomUUID() })
    const keyless = await call(A, 'POST', path, command())
    // Every refusal carries a contract Error body, not only a status.
    assert.deepEqual(
      [viewer, outsider, keyless].map((r) => [r.status, asErrorBody(r.json)?.retry]),
      [
        [403, 'never'],
        [403, 'never'],
        [422, 'never'],
      ],
    )
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
    assert.deepEqual([res.status, asErrorBody(res.json)?.retry], [422, 'never'])
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
    // Its first event is its creation (project-activity.md): the receipt's cursor is that event's.
    assert.equal(parseProjectCreated(created.json).cursor, '1')
    const mine = await call(A, 'GET', `/api/v1/projects/${created.json.projectId}/snapshot`)
    assert.equal(mine.status, 200)
    assert.deepEqual([parseSnapshot(mine.json).title, parseSnapshot(mine.json).goals], ['Founder project', []])
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
      /fetch failed/,
    )
    assert.equal(await projectsForKey(key), 1) // committed; the client never heard
    const retry = await call(A, 'POST', '/api/v1/projects', { title: 'Lost reply' }, { 'idempotency-key': key })
    const again = await call(A, 'POST', '/api/v1/projects', { title: 'Lost reply' }, { 'idempotency-key': key })
    assert.equal(retry.status, 201)
    assert.deepEqual(again.json, retry.json)
    assert.equal(await projectsForKey(key), 1) // still exactly one project
  })

  it('replays a blank title admitted before blanks were refused: the stored receipt, not a refusal (Codex P1 on #327)', async () => {
    // The state an earlier build could leave: a project titled with spaces, its creation recorded under its key.
    const key = randomUUID()
    const legacy = randomUUID()
    const receipt = { projectId: legacy, cursor: '0' }
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      await owner.query(`INSERT INTO sophia.projects(id, title, created_by) VALUES ($1, '   ', $2)`, [legacy, A])
      await owner.query(
        `INSERT INTO sophia.project_creations(actor_id, idempotency_key, semantic_request, project_id, receipt)
         VALUES ($1, $2, '{"title":"   "}', $3, $4)`,
        [A, key, legacy, receipt],
      )
    } finally {
      await owner.end()
    }
    const replay = await call(A, 'POST', '/api/v1/projects', { title: '   ' }, { 'idempotency-key': key })
    assert.deepEqual([replay.status, replay.json], [201, receipt])
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
    // A title of spaces alone is no title (e2e-real S2): refused as the empty one is, never stored as "   ".
    const blank = await call(A, 'POST', '/api/v1/projects', { title: '   ' }, { 'idempotency-key': randomUUID() })
    assert.deepEqual([blank.status, blank.json.code, blank.json.retry], [422, 'invalid_request', 'never'])
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

describe('renaming a project (A21)', () => {
  const rename = (actor: string, projectId: string, title: unknown, key = randomUUID()) =>
    call(actor, 'POST', `/api/v1/projects/${projectId}/title`, { title }, { 'idempotency-key': key })

  it('an admin renames it: every member reads the new title, and the room hears of it', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const renamed = await rename(A, projectId, 'Launch plan, v2')
    assert.equal(renamed.status, 200)
    assert.deepEqual([renamed.json.projectId, renamed.json.title], [projectId, 'Launch plan, v2'])
    assert.equal(typeof renamed.json.cursor, 'string')
    const theirs = parseSnapshot((await call(B, 'GET', `/api/v1/projects/${projectId}/snapshot`)).json)
    assert.equal(theirs.title, 'Launch plan, v2')
    const listed = (await call(V, 'GET', '/api/v1/projects')).json.projects as { projectId: string; title: string }[]
    assert.equal(listed.find((p) => p.projectId === projectId)?.title, 'Launch plan, v2')
    const heard = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id = $1 AND type = 'project.renamed'`,
      [projectId],
    )
    assert.equal(heard, 1)
  })

  it('only an admin may; a title of spaces is no title; a key answers once, and only for its own title', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.deepEqual([(await rename(B, projectId, 'Editor title')).status], [403])
    assert.deepEqual([(await rename(C, projectId, 'Outsider title')).status], [403])
    const blank = await rename(A, projectId, '   ')
    assert.deepEqual([blank.status, blank.json.code], [422, 'invalid_request'])
    assert.equal((await rename(A, projectId, 'x'.repeat(181))).status, 422)
    assert.equal((await rename(A, projectId, '')).status, 422)
    const key = randomUUID()
    const first = await rename(A, projectId, 'Once', key)
    const again = await rename(A, projectId, 'Once', key)
    assert.deepEqual([again.status, again.json], [200, first.json])
    const other = await rename(A, projectId, 'Twice', key)
    assert.deepEqual([other.status, other.json.code], [409, 'idempotency_conflict'])
    assert.equal((await call(A, 'POST', `/api/v1/projects/${projectId}/title`, { title: 'No key' })).status, 422)
  })
})

describe('archiving a project (A30)', () => {
  const archive = (actor: string, projectId: string, archived: unknown, key = randomUUID()) =>
    call(actor, 'POST', `/api/v1/projects/${projectId}/archive`, { archived }, { 'idempotency-key': key })
  const ids = async (actor: string, path: string) =>
    ((await call(actor, 'GET', path)).json.projects as { projectId: string }[]).map((p) => p.projectId)
  const events = (projectId: string, type: string) =>
    ownerCount(`SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id = $1 AND type = $2`, [
      projectId,
      type,
    ])

  it('an admin archives it: it leaves every member’s list for their archived list, and comes back unarchived', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const done = await archive(A, projectId, true)
    assert.equal(done.status, 200)
    assert.deepEqual([done.json.projectId, done.json.archived, typeof done.json.cursor], [projectId, true, 'string'])
    for (const who of [A, B, V]) {
      assert.ok(!(await ids(who, '/api/v1/projects')).includes(projectId), 'out of the list')
      assert.ok((await ids(who, '/api/v1/projects/archived')).includes(projectId), 'in the archived list')
    }
    // Still readable: an archived project opens.
    assert.equal((await call(B, 'GET', `/api/v1/projects/${projectId}/snapshot`)).status, 200)
    // Asked again, nothing changes and nothing is said.
    assert.equal((await archive(A, projectId, true)).status, 200)
    assert.equal(await events(projectId, 'project.archived'), 1)
    assert.equal((await archive(A, projectId, false)).status, 200)
    assert.ok((await ids(V, '/api/v1/projects')).includes(projectId))
    assert.ok(!(await ids(V, '/api/v1/projects/archived')).includes(projectId))
    assert.equal(await events(projectId, 'project.unarchived'), 1)
  })

  it('only an admin may; a key answers once, and only for its own choice', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    for (const who of [B, V, C]) assert.equal((await archive(who, projectId, true)).status, 403)
    assert.equal((await archive(A, projectId, 'yes')).status, 422)
    const key = randomUUID()
    const first = await archive(A, projectId, true, key)
    const again = await archive(A, projectId, true, key)
    assert.deepEqual([again.status, again.json], [200, first.json])
    const other = await archive(A, projectId, false, key)
    assert.deepEqual([other.status, other.json.code], [409, 'idempotency_conflict'])
    assert.equal((await call(A, 'POST', `/api/v1/projects/${projectId}/archive`, { archived: true })).status, 422)
  })
})

describe('leaving a project (A22)', () => {
  const leave = (actor: string, projectId: string, key = randomUUID()) =>
    call(actor, 'POST', `/api/v1/projects/${projectId}/leave`, {}, { 'idempotency-key': key })
  const listed = async (actor: string) =>
    (await call(actor, 'GET', '/api/v1/projects')).json.projects as { projectId: string; members: number }[]

  it('an editor leaves: it leaves their list and their reads, the others count one fewer, and the room hears of it', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.equal((await listed(V)).find((p) => p.projectId === projectId)?.members, 3)
    const key = randomUUID()
    const left = await leave(B, projectId, key)
    assert.equal(left.status, 200)
    assert.equal(left.json.projectId, projectId)
    assert.equal(typeof left.json.cursor, 'string')
    assert.equal((await call(B, 'GET', `/api/v1/projects/${projectId}/snapshot`)).status, 403)
    assert.equal(
      (await listed(B)).some((p) => p.projectId === projectId),
      false,
    )
    assert.equal((await listed(V)).find((p) => p.projectId === projectId)?.members, 2)
    const heard = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id = $1 AND type = 'project.member_left'`,
      [projectId],
    )
    assert.equal(heard, 1)
    // Said as a departure, never as «Member joined» (Codex P2 on #349).
    const said = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.project_events
        WHERE project_id = $1 AND type = 'project.member_left' AND summary_code = 'project.member_left'`,
      [projectId],
    )
    assert.equal(said, 1)
    // Out of the call too: a removal the worker keeps until any token they hold has expired (Codex P1 on #349).
    const removal = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.room_removals
        WHERE project_id = $1 AND identity = $2 AND reason = 'left' AND lobby_entry_id IS NULL
          AND state <> 'cancelled' AND guard_until > now() + interval '9 minutes'`,
      [projectId, B],
    )
    assert.equal(removal, 1)
    // A retry after a lost reply answers the same receipt, though the person is no longer a member.
    const again = await leave(B, projectId, key)
    assert.deepEqual([again.status, again.json], [200, left.json])
  })

  it('an outsider is refused; the only admin stays until a second admin exists; a key is needed', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.equal((await leave(C, projectId)).status, 403)
    const alone = await leave(A, projectId)
    assert.deepEqual([alone.status, alone.json.code], [409, 'invalid_state'])
    assert.equal(
      (await listed(A)).some((p) => p.projectId === projectId),
      true,
    )
    const promoted = await ownerCount(
      `WITH u AS (UPDATE sophia.project_members SET role = 'admin' WHERE project_id = $1 AND actor_id = $2 RETURNING 1)
       SELECT count(*)::int AS n FROM u`,
      [projectId, V],
    )
    assert.equal(promoted, 1)
    assert.equal((await leave(A, projectId)).status, 200)
    assert.equal((await call(A, 'POST', `/api/v1/projects/${projectId}/leave`, {})).status, 422)
  })
})

/** A page's texts, oldest first (A23). */
const pageTexts = (res: { json: { entries: { text: string }[] } }) => res.json.entries.map((e) => e.text)
/** «Message from» to «Message to», as seeded. */
const numbered = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `Message ${from + i}`)

describe('reading the room’s earlier discussion (A23)', () => {
  const page = (actor: string, projectId: string, anchor?: string) =>
    call(actor, 'GET', `/api/v1/projects/${projectId}/discussion${anchor ? `?before=${anchor}` : ''}`)

  it('pages back 50 at a time, oldest first, to the first message; the newest page is the snapshot’s', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    for (let i = 1; i <= 120; i++) {
      const said = await call(
        B,
        'POST',
        `/api/v1/projects/${projectId}/contributions`,
        { source: null, threadId: null, artifactVersionId: null, intent: 'discuss', text: `Message ${i}` },
        { 'idempotency-key': randomUUID() },
      )
      assert.equal(said.status, 202)
    }
    const newest = await page(V, projectId)
    assert.equal(newest.status, 200)
    assert.deepEqual(pageTexts(newest), numbered(71, 120))
    assert.equal(newest.json.before, newest.json.entries[0].id)
    const snap = parseSnapshot((await call(V, 'GET', `/api/v1/projects/${projectId}/snapshot`)).json)
    assert.deepEqual(
      snap.discussion.map((e) => e.id),
      (newest.json.entries as { id: string }[]).map((e) => e.id),
    )
    const middle = await page(V, projectId, newest.json.before)
    assert.deepEqual(pageTexts(middle), numbered(21, 70))
    const first = await page(V, projectId, middle.json.before)
    assert.deepEqual([pageTexts(first), first.json.before], [numbered(1, 20), null])
  })

  it('members only, as the snapshot; an anchor the discussion doesn’t hold is refused', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.equal((await page(C, projectId)).status, 403)
    assert.equal((await page(V, projectId, randomUUID())).status, 422)
    const empty = await page(V, projectId)
    assert.deepEqual([empty.status, empty.json], [200, { entries: [], before: null }])
  })
})

describe('host controls (A24)', () => {
  // This suite has no LiveKit server: every check before the room server's is proven here, and the room server's own
  // part in host-controls.livekit.test.ts.
  const act = (actor: string, projectId: string, identity: string, what: 'mute' | 'remove') =>
    call(actor, 'POST', `/api/v1/projects/${projectId}/room/people/${identity}/${what}`, {})

  it('an admin only; never at themselves or at Sophia; past those, the room server answers', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    for (const what of ['mute', 'remove'] as const) {
      assert.equal((await act(B, projectId, V, what)).status, 403, `an editor may not ${what}`)
      assert.equal((await act(C, projectId, V, what)).status, 403, `an outsider may not ${what}`)
      const self = await act(A, projectId, A, what)
      assert.deepEqual([self.status, self.json.code], [422, 'invalid_request'])
      assert.equal((await act(A, projectId, 'sophia', what)).status, 422)
      const reached = await act(A, projectId, B, what)
      assert.deepEqual([reached.status, reached.json.code], [503, 'unavailable'])
    }
  })
})

describe('goal targets (A25)', () => {
  const put = (actor: string, projectId: string, goalId: string, body: Record<string, unknown>) =>
    call(actor, 'PUT', `/api/v1/projects/${projectId}/goals/${goalId}/target`, body)
  const read = async (actor: string, projectId: string) =>
    (await call(actor, 'GET', `/api/v1/projects/${projectId}/goal-targets`)).json as {
      targets: { goalId: string; ownerId: string | null; targetDate: string | null; revision: number }[]
    }

  it('an editor sets owner and date, every member reads them, the room hears it; clearing is a target too', async () => {
    const { projectId, goalId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.deepEqual(await read(V, projectId), { targets: [] })
    const set = await put(B, projectId, goalId, { ownerId: V, targetDate: '2026-10-30', expectedRevision: 0 })
    assert.equal(set.status, 200)
    assert.deepEqual(
      { ...set.json, cursor: typeof set.json.cursor },
      { goalId, ownerId: V, targetDate: '2026-10-30', revision: 1, cursor: 'string' },
    )
    assert.deepEqual(await read(V, projectId), {
      targets: [{ goalId, ownerId: V, targetDate: '2026-10-30', revision: 1 }],
    })
    const heard = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id = $1 AND type = 'goal.target_set'`,
      [projectId],
    )
    assert.equal(heard, 1)
    const cleared = await put(A, projectId, goalId, { ownerId: null, targetDate: null, expectedRevision: 1 })
    assert.deepEqual(
      [cleared.status, cleared.json.ownerId, cleared.json.targetDate, cleared.json.revision],
      [200, null, null, 2],
    )
  })

  it('editors and admins only; the owner a member; a date in range; a stale write and an unknown goal refused', async () => {
    const { projectId, goalId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const body = { ownerId: B, targetDate: '2026-11-15', expectedRevision: 0 }
    assert.equal((await put(V, projectId, goalId, body)).status, 403)
    assert.equal((await put(C, projectId, goalId, body)).status, 403)
    assert.equal((await call(C, 'GET', `/api/v1/projects/${projectId}/goal-targets`)).status, 403)
    const stranger = await put(B, projectId, goalId, { ...body, ownerId: C })
    assert.deepEqual([stranger.status, stranger.json.code], [422, 'invalid_request'])
    assert.equal((await put(B, projectId, goalId, { ...body, targetDate: '1999-12-31' })).status, 422)
    assert.equal((await put(B, projectId, goalId, { ...body, targetDate: '30/10/2026' })).status, 422)
    assert.equal((await put(B, projectId, randomUUID(), body)).status, 422)
    assert.equal((await put(B, projectId, goalId, body)).status, 200)
    const stale = await put(A, projectId, goalId, body)
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
  })
})

describe('member roles (A27)', () => {
  const role = (actor: string, projectId: string, target: string, next: unknown) =>
    call(actor, 'PUT', `/api/v1/projects/${projectId}/members/${target}/role`, { role: next })
  const roles = async (actor: string, projectId: string) =>
    Object.fromEntries(
      (
        (await call(actor, 'GET', `/api/v1/projects/${projectId}/members`)).json.members as {
          actorId: string
          role: string
        }[]
      ).map((m) => [m.actorId, m.role]),
    )

  it('an admin hands the admin role over: the other becomes admin, then the first steps down and can leave', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const made = await role(A, projectId, B, 'admin')
    assert.equal(made.status, 200)
    assert.deepEqual(
      { ...made.json, cursor: typeof made.json.cursor },
      { actorId: B, role: 'admin', revision: 2, cursor: 'string' },
    )
    assert.deepEqual(await roles(V, projectId), { [A]: 'admin', [B]: 'admin', [V]: 'viewer' })
    const again = await role(A, projectId, B, 'admin')
    assert.deepEqual([again.status, again.json.revision], [200, 2])
    assert.equal((await role(A, projectId, A, 'editor')).status, 200)
    assert.deepEqual(await roles(V, projectId), { [A]: 'editor', [B]: 'admin', [V]: 'viewer' })
    const heard = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.project_events
        WHERE project_id = $1 AND type = 'project.member_role_changed' AND summary_code = 'project.member_role'`,
      [projectId],
    )
    assert.equal(heard, 2)
    const left = await call(A, 'POST', `/api/v1/projects/${projectId}/leave`, {}, { 'idempotency-key': randomUUID() })
    assert.equal(left.status, 200)
  })

  it('admins only; a project keeps an admin; the target a member; a role the contract knows', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.equal((await role(B, projectId, V, 'editor')).status, 403)
    assert.equal((await role(C, projectId, V, 'editor')).status, 403)
    const last = await role(A, projectId, A, 'editor')
    assert.deepEqual([last.status, last.json.code], [409, 'invalid_state'])
    assert.equal((await role(A, projectId, C, 'editor')).status, 422)
    assert.equal((await role(A, projectId, V, 'owner')).status, 422)
    assert.deepEqual(await roles(V, projectId), { [A]: 'admin', [B]: 'editor', [V]: 'viewer' })
  })
})

describe('project activity (A28)', () => {
  type Entry = {
    sequence: string
    type: string
    actor: { id: string | null; name: string | null }
    target: { id: string; name: string | null } | null
  }
  const activity = (actor: string, projectId: string, anchor?: string) =>
    call(actor, 'GET', `/api/v1/projects/${projectId}/activity${anchor ? `?before=${anchor}` : ''}`)

  it('lists people’s acts newest first, with who did them and on whom; never a chat message', async () => {
    const created = await call(A, 'POST', '/api/v1/projects', { title: 'Audited' }, { 'idempotency-key': randomUUID() })
    const projectId = created.json.projectId as string
    // B joins as an editor, as an invitation would leave them (owner write: this suite has no invitation link).
    await ownerCount(
      `WITH m AS (INSERT INTO sophia.project_members(project_id, actor_id, role) VALUES ($1, $2, 'editor') RETURNING 1)
       SELECT count(*)::int AS n FROM m`,
      [projectId, B],
    )
    await call(
      A,
      'POST',
      `/api/v1/projects/${projectId}/title`,
      { title: 'Audited, v2' },
      { 'idempotency-key': randomUUID() },
    )
    await call(A, 'PUT', `/api/v1/projects/${projectId}/members/${B}/role`, { role: 'admin' })
    const said = await call(
      B,
      'POST',
      `/api/v1/projects/${projectId}/contributions`,
      { source: null, threadId: null, artifactVersionId: null, intent: 'discuss', text: 'Not for the log' },
      { 'idempotency-key': randomUUID() },
    )
    assert.equal(said.status, 202)
    const read = await activity(A, projectId)
    assert.equal(read.status, 200)
    const entries = read.json.entries as Entry[]
    assert.deepEqual(
      entries.map((e) => [e.type, e.actor.id, e.target?.id ?? null]),
      [
        ['project.member_role_changed', A, B],
        ['project.renamed', A, null],
        ['project.created', A, null],
      ],
    )
    assert.equal(read.json.before, null)
    assert.equal((await activity(B, projectId)).status, 200, 'B is an admin now')
  })

  it('admins only; pages go back with before', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.equal((await activity(B, projectId)).status, 403)
    assert.equal((await activity(C, projectId)).status, 403)
    for (let i = 0; i < 55; i++)
      await call(
        A,
        'POST',
        `/api/v1/projects/${projectId}/title`,
        { title: `Title ${i}` },
        { 'idempotency-key': randomUUID() },
      )
    const first = await activity(A, projectId)
    assert.equal((first.json.entries as Entry[]).length, 50)
    assert.equal(first.json.before, (first.json.entries as Entry[]).at(-1)?.sequence)
    const second = await activity(A, projectId, first.json.before)
    assert.deepEqual([(second.json.entries as Entry[]).length, second.json.before], [5, null])
  })

  it('a member who leaves is not their own target; a page past a bigint is refused (activity-followups.md)', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [] })
    assert.equal(
      (await call(B, 'POST', `/api/v1/projects/${projectId}/leave`, {}, { 'idempotency-key': randomUUID() })).status,
      200,
    )
    const left = ((await activity(A, projectId)).json.entries as Entry[]).find((e) => e.type === 'project.member_left')
    assert.deepEqual([left?.actor.id, left?.target], [B, null])
    const past = await activity(A, projectId, '9999999999999999999')
    assert.deepEqual([past.status, past.json.code], [422, 'invalid_request'])
    assert.equal((await activity(A, projectId, '9223372036854775807')).status, 200, 'the largest bigint reads')
  })
})

describe('removing a member (A29)', () => {
  const remove = (actor: string, projectId: string, target: string, key = randomUUID()) =>
    call(actor, 'POST', `/api/v1/projects/${projectId}/members/${target}/removal`, {}, { 'idempotency-key': key })
  const count = async (actor: string, projectId: string) =>
    ((await call(actor, 'GET', `/api/v1/projects/${projectId}/members`)).json.members as unknown[]).length

  it('an admin removes an editor: they can no longer read it, it counts one fewer, and it is kept on record', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const key = randomUUID()
    const removed = await remove(A, projectId, B, key)
    assert.equal(removed.status, 200)
    assert.deepEqual({ ...removed.json, cursor: typeof removed.json.cursor }, { actorId: B, cursor: 'string' })
    assert.equal((await call(B, 'GET', `/api/v1/projects/${projectId}/snapshot`)).status, 403)
    assert.equal(await count(V, projectId), 2)
    const kept = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.project_events
        WHERE project_id = $1 AND type = 'project.member_removed' AND actor_id = $2 AND entity_id = $3`,
      [projectId, A, B],
    )
    assert.equal(kept, 1)
    const removal = await ownerCount(
      `SELECT count(*)::int AS n FROM sophia.room_removals
        WHERE project_id = $1 AND identity = $2 AND reason = 'removed' AND lobby_entry_id IS NULL AND state <> 'cancelled'`,
      [projectId, B],
    )
    assert.equal(removal, 1)
    const again = await remove(A, projectId, B, key)
    assert.deepEqual([again.status, again.json], [200, removed.json])
  })

  it('admins only; never oneself; the target a member', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    assert.equal((await remove(B, projectId, V)).status, 403)
    assert.equal((await remove(C, projectId, V)).status, 403)
    const self = await remove(A, projectId, A)
    assert.deepEqual([self.status, self.json.code], [422, 'invalid_request'])
    assert.equal((await remove(A, projectId, C)).status, 422)
    assert.equal(await count(V, projectId), 3)
  })
})

describe('snapshot + SSE replay', () => {
  it("delivers another member's admitted command live, then replays without duplicates", async () => {
    const snap = parseSnapshot((await call(A, 'GET', `/api/v1/projects/${seed.projectId}/snapshot`)).json)
    const live = await follow(A, seed.projectId, snap.cursor, (f) => f.some((x) => x.type === 'command.admitted'))
    assert.equal(live.status, 200)
    const receipt = parseReceipt(
      (
        await call(B, 'POST', `/api/v1/projects/${seed.projectId}/commands`, command(), {
          'idempotency-key': randomUUID(),
        })
      ).json,
    )
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
    const snap = parseSnapshot((await call(B, 'GET', `/api/v1/projects/${fresh.projectId}/snapshot`)).json)
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
