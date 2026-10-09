// Voice qualification evidence through the API (A15, migration 0046; docs/plans/voice-qualification-g7.md), level:
// sql-run. The bridge's receipts, the principal's read, the grant on the assignment and the room token, and the guard
// on the presence and assignment paths. LiveKit is unreachable here: room tokens are signed locally.
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { MediaEvidenceWrite } from '@sophia/contracts'
import { createPool, readSnapshot, startExchange, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-tests-0123456789'
const LIVEKIT = { url: 'ws://127.0.0.1:9', apiKey: 'devkey', apiSecret: 'livekit-test-secret-at-least-32-bytes!!' }
const COMMIT = 'c0ffee'.repeat(6) + 'c0ff'
const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const E = randomUUID() // another editor
const RUN = 'ab'.repeat(32)
const SESSION = '00000000-0000-4000-8000-0000000000a1'

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
/** The same API with voice qualification off, its default: nothing of A15 is served or passed on. */
let off: FastifyInstance

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({
    pool,
    verifyActor,
    mediaBridgeTokenSha256,
    livekit: LIVEKIT,
    commit: COMMIT,
    voiceQualification: true,
  })
  off = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, livekit: LIVEKIT })
  await app.ready()
  await off.ready()
})
after(async () => {
  await app?.close()
  await off?.close()
  await pool?.end()
  await db?.drop()
})

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function call(
  method: 'GET' | 'POST',
  url: string,
  init: { actor?: string; media?: boolean; body?: unknown; api?: FastifyInstance } = {},
) {
  const res = await (init.api ?? app).inject({
    method,
    url,
    headers: {
      ...(init.actor ? { authorization: `Bearer ${await token(init.actor)}` } : {}),
      ...(init.media ? { authorization: `Bearer ${MEDIA_TOKEN}` } : {}),
      ...(method === 'POST' && !init.media ? { 'idempotency-key': randomUUID() } : {}),
    },
    ...(init.body === undefined ? {} : { payload: init.body as Record<string, unknown> }),
  })
  const json = res.body ? JSON.parse(res.body) : null
  return { status: res.statusCode, json }
}

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

async function project() {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P, E] })
  const snap = await withActor(pool, A, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  return { projectId: seeded.projectId, roomId: snap.room.id, roomRevision: snap.room.revision }
}

async function grant(projectId: string, limits: { budget?: number; outputPerTurn?: number } = {}): Promise<string> {
  const { rows } = await owner((c) =>
    c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,$4,$5,3600)).id AS id`,
      [projectId, P, RUN, limits.outputPerTurn ?? 1000, limits.budget ?? 200_000],
    ),
  )
  const id = rows[0]?.id
  assert.ok(id)
  return id
}

async function open(projectId: string): Promise<string> {
  const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const receipt = await withActor(pool, P, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return receipt.exchangeId
}

const inputWindow = (grantId: string, over: Record<string, unknown> = {}) => ({
  kind: 'input_window',
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId,
  runBindingSha256: RUN,
  atMs: 1_800_000_000_000,
  windowSeq: 1,
  inputEpoch: 1,
  providerSession: SESSION,
  connection: 1,
  startedAtMs: 1_800_000_000_000,
  endedAtMs: 1_800_000_002_000,
  endReason: 'turn_complete',
  chunkCount: 100,
  sampleCount: 32_000,
  nonzeroSampleCount: 31_000,
  audibleChunkCount: 90,
  rms: 0.1,
  peak: 0.5,
  droppedSamples: 0,
  sampleRate: 16000,
  pcmDigestAlgorithm: 'sha-256-chain-v1',
  pcmSha256Chain: 'cd'.repeat(32),
  rawAudioExcluded: true,
  ...over,
})

const provider = (grantId: string, usageTokens: number | null, lastPromptTokens: number | null) => ({
  kind: 'provider',
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId,
  runBindingSha256: RUN,
  atMs: 1_800_000_003_000,
  phase: 'usage',
  providerSession: SESSION,
  connection: 1,
  resumed: false,
  model: 'gemini-live-2.5-flash',
  instructionSha256: 'ef'.repeat(32),
  bridgeCommit: null,
  connectionsOpened: 1,
  turns: 1,
  usageTokens,
  lastPromptTokens,
})

const write = (exchangeId: string, grantId: string, seq: number, receipt: Record<string, unknown>) =>
  call('POST', '/v1/media/evidence', {
    media: true,
    body: { exchangeId, grantId, seq, receipt } satisfies Record<keyof MediaEvidenceWrite, unknown>,
  })

describe('voice qualification through the API (A15, 0046)', () => {
  it('names the grant to its principal only: on the room token, and on the assignment of an exchange opened under it', async () => {
    const { projectId, roomId, roomRevision } = await project()
    const earlier = await open(projectId)
    const roomToken = (actor: string) =>
      call('POST', `/api/v1/projects/${projectId}/room-token`, {
        actor,
        body: { roomId, expectedAudienceRevision: roomRevision },
      })
    const none = await roomToken(P)
    assert.equal(none.status, 200, JSON.stringify(none.json))
    assert.equal(none.json.qualification, undefined, 'no grant: the token names none')
    await owner((c) => c.query(`UPDATE sophia.room_exchanges SET state='ended', ended_at=now() WHERE id=$1`, [earlier]))
    const grantId = await grant(projectId)
    const principal = await roomToken(P)
    assert.deepEqual(principal.json.qualification, { grantId, runBindingSha256: RUN })
    assert.equal((await roomToken(E)).json.qualification, undefined, 'another member: none')
    const exchangeId = await open(projectId)
    const batch = await call('GET', '/v1/media/assignments?waitMs=0', { media: true })
    assert.equal(batch.status, 200, JSON.stringify(batch.json))
    const assigned = (batch.json.assignments as Array<{ exchangeId: string; qualification?: unknown }>).find(
      (a) => a.exchangeId === exchangeId,
    )
    assert.ok(assigned)
    assert.deepEqual(
      Object.keys(assigned.qualification as object).toSorted(),
      [
        'deadline',
        'grantId',
        'maxOutputTokensPerTurn',
        'maxProviderConnections',
        'maxTurns',
        'maxUsageTokens',
        'principalActorId',
        'runBindingSha256',
      ],
      'the assignment carries the grant through its declared schema',
    )
  })

  it('keeps a bridge receipt once per sequence number, refuses free text, another run or another grant', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId)
    const exchangeId = await open(projectId)
    const first = await write(exchangeId, grantId, 1, inputWindow(grantId))
    assert.equal(first.status, 200, JSON.stringify(first.json))
    assert.deepEqual(first.json, { ended: false, reason: null })
    assert.equal((await write(exchangeId, grantId, 1, inputWindow(grantId))).status, 200, 'the same again: a no-op')
    const reused = await write(exchangeId, grantId, 1, inputWindow(grantId, { chunkCount: 101 }))
    assert.deepEqual([reused.status, reused.json.code], [409, 'idempotency_conflict'])
    const text = await write(exchangeId, grantId, 2, inputWindow(grantId, { transcript: 'hello' }))
    assert.equal(text.status, 422, 'no free text: the schema refuses any field it does not declare')
    const words = await write(exchangeId, grantId, 2, inputWindow(grantId, { endReason: 'the user said hello' }))
    assert.equal(words.status, 422, 'an enumerated word only')
    const otherRun = await write(exchangeId, grantId, 2, inputWindow(grantId, { runBindingSha256: 'ee'.repeat(32) }))
    assert.deepEqual([otherRun.status, otherRun.json.code], [422, 'invalid_request'])
    const otherGrant = randomUUID()
    const foreign = await write(exchangeId, otherGrant, 2, inputWindow(otherGrant))
    assert.deepEqual([foreign.status, foreign.json.code], [403, 'forbidden'])
    const member = await call('POST', '/v1/media/evidence', {
      actor: P,
      body: { exchangeId, grantId, seq: 3, receipt: inputWindow(grantId) },
    })
    assert.equal(member.status, 401, 'the bridge capability only, never a member')
  })

  it('reads the evidence to the principal alone; the guard ends the exchange at its budget, on the write', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId, { budget: 10_000, outputPerTurn: 1000 })
    const exchangeId = await open(projectId)
    assert.equal((await write(exchangeId, grantId, 1, inputWindow(grantId))).status, 200)
    const under = await write(exchangeId, grantId, 2, provider(grantId, 4000, 3000))
    assert.deepEqual(under.json, { ended: false, reason: null }, '4000 + 3000 + 1000 is under 10000')
    const over = await write(exchangeId, grantId, 3, provider(grantId, 6000, 3500))
    assert.deepEqual(over.json, { ended: true, reason: 'usage' }, 'the next turn could pass the budget')
    const read = await call('GET', `/api/v1/exchanges/${exchangeId}/qualification-evidence`, { actor: P })
    assert.equal(read.status, 200, JSON.stringify(read.json))
    assert.equal(read.json.state, 'ended')
    assert.equal(read.json.grant.endedReason, 'usage')
    assert.equal(read.json.grant.usageTokens, 6000)
    assert.deepEqual(
      (read.json.receipts as Array<{ source: string; seq: number; kind: string }>).map((r) => [
        r.source,
        r.seq,
        r.kind,
      ]),
      [
        ['bridge', 1, 'input_window'],
        ['bridge', 2, 'provider'],
        ['bridge', 3, 'provider'],
        ['service', 0, 'guard'],
      ],
    )
    const other = await call('GET', `/api/v1/exchanges/${exchangeId}/qualification-evidence`, { actor: E })
    assert.deepEqual([other.status, other.json.code], [422, 'not_found'], 'another member finds nothing')
    const nobody = await call('GET', `/api/v1/exchanges/${randomUUID()}/qualification-evidence`, { actor: P })
    assert.deepEqual([nobody.status, nobody.json.code], [422, 'not_found'])
  })

  it('ends an exchange past its deadline on the next presence report or assignment poll, with no Lab', async () => {
    const { projectId, roomId } = await project()
    const grantId = await grant(projectId)
    // 21 minutes ago the grant was made (it still has 39 left); its exchanges opened a minute later, so 15 minutes on
    // they are past their 900 s.
    await owner((c) =>
      c.query(
        `UPDATE sophia.voice_qualification_grants SET created_at=created_at-interval '21 minutes',
                expires_at=expires_at-interval '21 minutes' WHERE id=$1`,
        [grantId],
      ),
    )
    const viaPresence = await open(projectId)
    await owner((c) =>
      c.query(`UPDATE sophia.room_exchanges SET opened_at=now()-interval '20 minutes' WHERE id=$1`, [viaPresence]),
    )
    const report = await call('POST', '/v1/media/presence', {
      media: true,
      body: {
        roomId,
        exchangeId: viaPresence,
        bridgeInstanceId: 'bridge-1',
        voice: 'ready',
        reason: null,
        participants: [],
      },
    })
    assert.equal(report.status, 204, JSON.stringify(report.json))
    const ended = await owner((c) =>
      c.query<{ state: string; reason: string }>(
        `SELECT e.state, q.ended_reason AS reason FROM sophia.room_exchanges e
          JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id WHERE e.id=$1`,
        [viaPresence],
      ),
    )
    assert.deepEqual(ended.rows[0], { state: 'ended', reason: 'deadline' })
    const viaPoll = await open(projectId)
    await owner((c) =>
      c.query(`UPDATE sophia.room_exchanges SET opened_at=now()-interval '20 minutes' WHERE id=$1`, [viaPoll]),
    )
    const batch = await call('GET', '/v1/media/assignments?waitMs=0', { media: true })
    assert.equal(
      (batch.json.assignments as Array<{ exchangeId: string }>).some((a) => a.exchangeId === viaPoll),
      false,
      'not assigned: the guard ended it before the read',
    )
  })

  it('is off by default: no receipt route, no grant passed on, no guard, no grant on the room token', async () => {
    const { projectId, roomId, roomRevision } = await project()
    const grantId = await grant(projectId)
    await owner((c) =>
      c.query(
        `UPDATE sophia.voice_qualification_grants SET created_at=created_at-interval '21 minutes',
                expires_at=expires_at-interval '21 minutes' WHERE id=$1`,
        [grantId],
      ),
    )
    const exchangeId = await open(projectId)
    await owner((c) =>
      c.query(`UPDATE sophia.room_exchanges SET opened_at=now()-interval '20 minutes' WHERE id=$1`, [exchangeId]),
    )
    const receipt = await call('POST', '/v1/media/evidence', {
      api: off,
      media: true,
      body: { exchangeId, grantId, seq: 1, receipt: inputWindow(grantId) },
    })
    // No such route: the capability hook knows only routes that exist, so the bridge's token is refused as a member's.
    assert.equal(receipt.status, 401, 'no receipt route')
    const kept = await owner((c) =>
      c.query(`SELECT 1 FROM sophia.voice_qualification_evidence WHERE exchange_id=$1`, [exchangeId]),
    )
    assert.equal(kept.rowCount, 0, 'nothing recorded')
    const report = await call('POST', '/v1/media/presence', {
      api: off,
      media: true,
      body: { roomId, exchangeId, bridgeInstanceId: 'bridge-1', voice: 'ready', reason: null, participants: [] },
    })
    assert.equal(report.status, 204)
    const batch = await call('GET', '/v1/media/assignments?waitMs=0', { api: off, media: true })
    const assigned = (batch.json.assignments as Array<{ exchangeId: string; qualification?: unknown }>).find(
      (a) => a.exchangeId === exchangeId,
    )
    assert.ok(assigned, "no guard: past its grant's deadline, still assigned")
    assert.equal(assigned.qualification, undefined, 'the grant is not passed on, so a bridge never records')
    const roomToken = await call('POST', `/api/v1/projects/${projectId}/room-token`, {
      api: off,
      actor: P,
      body: { roomId, expectedAudienceRevision: roomRevision },
    })
    assert.equal(roomToken.status, 200)
    assert.equal(roomToken.json.qualification, undefined)
    const read = await call('GET', `/api/v1/exchanges/${exchangeId}/qualification-evidence`, { api: off, actor: P })
    assert.equal(read.status, 404, 'no read route')
  })

  it('names its deployed commit on /health, and null for anything but 40 hex', async () => {
    assert.deepEqual((await call('GET', '/health')).json, { ok: true, commit: COMMIT })
    const plain = buildApp({
      pool,
      verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
    })
    await plain.ready()
    try {
      assert.deepEqual(JSON.parse((await plain.inject({ method: 'GET', url: '/health' })).body), {
        ok: true,
        commit: null,
      })
    } finally {
      await plain.close()
    }
  })
})
