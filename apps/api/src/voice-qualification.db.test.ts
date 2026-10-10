// Voice qualification evidence through the API (A15, migrations 0046 and 0051; docs/plans/voice-qualification-g7.md), level:
// sql-run. The bridge's receipts, the principal's read, the grant on the assignment and the room token, and the guard
// on the presence and assignment paths. LiveKit is unreachable here: room tokens are signed locally. The last case
// runs the media bridge's own session (RoomSession, its HTTP client) against this API, with LABELLED FAKES for LiveKit
// and Gemini Live: it proves the bridge's receipts cross the real contract, not that a model or a room heard anything.
import { createHash, randomUUID } from 'node:crypto'
import http from 'node:http'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { MediaEvidenceWrite, MediaToolCall } from '@sophia/contracts'
import {
  DECLARED_NAMES,
  httpMediaService,
  MediaBridge,
  loadMissionGuide,
  RoomSession,
  type LiveEvents,
  type LiveLink,
  type RoomEvents,
  type RoomLink,
} from '@sophia/media-bridge'
import {
  admitNativeTask,
  claimLiveCall,
  createPool,
  liveCallAdmits,
  readSnapshot,
  recordLiveCall,
  startExchange,
  submitContribution,
  toolSpeaker,
  withActor,
  withService,
} from '@sophia/persistence'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  type RegisteredRuntime,
  type TestDatabase,
} from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { callSha256 } from './media-tools.ts'

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
  init: { actor?: string; media?: boolean; body?: unknown; api?: FastifyInstance; key?: string } = {},
) {
  const res = await (init.api ?? app).inject({
    method,
    url,
    headers: {
      ...(init.actor ? { authorization: `Bearer ${await token(init.actor)}` } : {}),
      ...(init.media ? { authorization: `Bearer ${MEDIA_TOKEN}` } : {}),
      ...(method === 'POST' && !init.media ? { 'idempotency-key': init.key ?? randomUUID() } : {}),
    },
    ...(init.body === undefined ? {} : { payload: init.body as Record<string, unknown> }),
  })
  const json = res.body ? JSON.parse(res.body) : null
  return { status: res.statusCode, json }
}

/** A tool call's answer as the bridge reads it: the HTTP status, the call's status and its code. */
const answerOf = (r: { status: number; json: { status: string; output: { code?: string } } }) =>
  [r.status, r.json.status, r.json.output.code] as const

/** The bridge's durable reservation (A15), with the media-bridge capability. */
const reserve = (body: Record<string, unknown>, api?: FastifyInstance) =>
  call('POST', '/v1/media/qualification-reserve', { media: true, body, ...(api ? { api } : {}) })

/** The API listening on a port, for the bridge's own HTTP client; once for the file. */
let listening: Promise<string> | null = null
const baseUrl = () => (listening ??= app.listen({ host: '127.0.0.1', port: 0 }))

/** Turns of the event loop until `check` holds: the session's receipts go out on their own. */
async function until(what: string, check: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
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

async function grant(
  projectId: string,
  limits: { budget?: number; outputPerTurn?: number; connections?: number; turns?: number } = {},
): Promise<string> {
  const { rows } = await owner((c) =>
    c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,$6,$7,$4,$5,3600)).id AS id`,
      [
        projectId,
        P,
        RUN,
        limits.outputPerTurn ?? 1000,
        limits.budget ?? 200_000,
        limits.connections ?? 3,
        limits.turns ?? 20,
      ],
    ),
  )
  const id = rows[0]?.id
  assert.ok(id)
  return id
}

/** The last item, which must be there. */
function lastOf<T>(items: readonly T[]): T {
  const last = items.at(-1)
  assert.ok(last !== undefined)
  return last
}

/** Each listed call's command kind, or null, and how it was answered. */
const kinds = (calls: ReadonlyArray<{ command: { kind: string } | null; outcome: string | null }>) =>
  calls.map((c) => [c.command?.kind ?? null, c.outcome])

/** An exchange `opener` opens, holding its floor (input epoch 1). */
async function open(projectId: string, opener = P): Promise<string> {
  const snap = await withActor(pool, opener, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const receipt = await withActor(pool, opener, 'write', (c) =>
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

/** The connections whose `ready` an exchange keeps, from its kept receipts ([seq, kind or provider phase, connection]). */
const readies = (kept: Array<Array<number | string | null>>) =>
  kept.filter(([, kind]) => kind === 'provider:ready').map(([, , connection]) => connection)

/** 1, 2, ..., n. */
const dense = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/** A bridge receipt under its write identity (0051: the service numbers it). */
const write = (exchangeId: string, grantId: string, writeId: string, receipt: Record<string, unknown>) =>
  call('POST', '/v1/media/evidence-writes', {
    media: true,
    body: { exchangeId, grantId, writeId, receipt } satisfies Record<keyof MediaEvidenceWrite, unknown>,
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

  it('numbers a bridge receipt once per write identity, refuses free text, another run or another grant, and spends no number on a refusal (0051)', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId)
    const exchangeId = await open(projectId)
    const [one, two, three] = [randomUUID(), randomUUID(), randomUUID()]
    assert.equal(
      (await write(exchangeId, grantId, one, inputWindow(grantId))).status,
      422,
      'connection 1 is not reserved',
    )
    assert.equal((await reserve({ exchangeId, grantId, kind: 'connection' })).json.ordinal, 1)
    const first = await write(exchangeId, grantId, one, inputWindow(grantId))
    assert.equal(first.status, 200, JSON.stringify(first.json))
    assert.deepEqual(first.json, { seq: 1, replayed: false, ended: false, reason: null }, 'the refusal spent nothing')
    const again = await write(exchangeId, grantId, one, inputWindow(grantId))
    assert.deepEqual([again.status, again.json], [200, { seq: 1, replayed: true, ended: false, reason: null }])
    const reused = await write(exchangeId, grantId, one, inputWindow(grantId, { chunkCount: 101 }))
    assert.deepEqual([reused.status, reused.json.code], [409, 'idempotency_conflict'])
    const text = await write(exchangeId, grantId, two, inputWindow(grantId, { transcript: 'hello' }))
    assert.equal(text.status, 422, 'no free text: the schema refuses any field it does not declare')
    const words = await write(exchangeId, grantId, two, inputWindow(grantId, { endReason: 'the user said hello' }))
    assert.equal(words.status, 422, 'an enumerated word only')
    const otherRun = await write(exchangeId, grantId, two, inputWindow(grantId, { runBindingSha256: 'ee'.repeat(32) }))
    assert.deepEqual([otherRun.status, otherRun.json.code], [422, 'invalid_request'])
    const otherGrant = randomUUID()
    const foreign = await write(exchangeId, otherGrant, two, inputWindow(otherGrant))
    assert.deepEqual([foreign.status, foreign.json.code], [403, 'forbidden'])
    const nameless = await call('POST', '/v1/media/evidence-writes', {
      media: true,
      body: { exchangeId, grantId, writeId: 'not-a-uuid', receipt: inputWindow(grantId) },
    })
    assert.equal(nameless.status, 422, 'a write names its identity as a UUID')
    const numbered = await call('POST', '/v1/media/evidence-writes', {
      media: true,
      body: { exchangeId, grantId, writeId: three, seq: 7, receipt: inputWindow(grantId) },
    })
    assert.equal(numbered.status, 422, 'and never a number of its own')
    const member = await call('POST', '/v1/media/evidence-writes', {
      actor: P,
      body: { exchangeId, grantId, writeId: three, receipt: inputWindow(grantId) },
    })
    assert.equal(member.status, 401, 'the bridge capability only, never a member')
    const next = await write(exchangeId, grantId, two, inputWindow(grantId, { windowSeq: 2 }))
    assert.deepEqual(next.json, { seq: 2, replayed: false, ended: false, reason: null }, 'dense: no refusal spent one')
    const kept = await owner((c) =>
      c.query<{ seq: number }>(
        `SELECT seq FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 AND source='bridge' ORDER BY seq`,
        [exchangeId],
      ),
    )
    assert.deepEqual(
      kept.rows.map((r) => r.seq),
      [1, 2],
    )
  })

  it('the bridge’s own numbering is retired: its route answers 410 and keeps nothing; a member is still refused there (0051)', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId)
    const exchangeId = await open(projectId)
    await reserve({ exchangeId, grantId, kind: 'connection' })
    const retired = await call('POST', '/v1/media/evidence', {
      media: true,
      body: { exchangeId, grantId, seq: 1, receipt: inputWindow(grantId) },
    })
    assert.deepEqual([retired.status, retired.json.code], [410, 'evidence_route_retired'])
    const member = await call('POST', '/v1/media/evidence', {
      actor: P,
      body: { exchangeId, grantId, seq: 1, receipt: inputWindow(grantId) },
    })
    assert.equal(member.status, 401, 'the bridge capability only, never a member')
    const kept = await owner((c) =>
      c.query(`SELECT 1 FROM sophia.voice_qualification_evidence WHERE exchange_id=$1`, [exchangeId]),
    )
    assert.equal(kept.rowCount, 0, 'nothing kept')
  })

  it('reads the evidence to the principal alone; the guard ends the exchange at its budget, on the write', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId, { budget: 10_000, outputPerTurn: 1000 })
    const exchangeId = await open(projectId)
    await reserve({ exchangeId, grantId, kind: 'connection' })
    assert.equal((await write(exchangeId, grantId, randomUUID(), inputWindow(grantId))).status, 200)
    const under = await write(exchangeId, grantId, randomUUID(), provider(grantId, 4000, 3000))
    assert.deepEqual(
      under.json,
      { seq: 2, replayed: false, ended: false, reason: null },
      '4000 + 3000 + 1000 is under 10000',
    )
    const over = await write(exchangeId, grantId, randomUUID(), provider(grantId, 6000, 3500))
    assert.deepEqual(
      over.json,
      { seq: 3, replayed: false, ended: true, reason: 'usage' },
      'the next turn could pass the budget',
    )
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
    const receipt = await call('POST', '/v1/media/evidence-writes', {
      api: off,
      media: true,
      body: { exchangeId, grantId, writeId: randomUUID(), receipt: inputWindow(grantId) },
    })
    // No such route: the capability hook knows only routes that exist, so the bridge's token is refused as a member's.
    assert.equal(receipt.status, 401, 'no receipt route')
    const retired = await call('POST', '/v1/media/evidence', {
      api: off,
      media: true,
      body: { exchangeId, grantId, seq: 1, receipt: inputWindow(grantId) },
    })
    assert.equal(retired.status, 401, 'nor the retired one')
    assert.equal((await reserve({ exchangeId, grantId, kind: 'connection' }, off)).status, 401, 'no reservation route')
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

/** The grant a room token names for `actor`, through the real route (rooms.ts), as the Studio asks for one; or null. */
async function tokenGrant(projectId: string, actor = P): Promise<string | null> {
  const snap = await withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const res = await call('POST', `/api/v1/projects/${projectId}/room-token`, {
    actor,
    body: { roomId: snap.room.id, expectedAudienceRevision: snap.audienceRevision },
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return (res.json.qualification as { grantId: string } | undefined)?.grantId ?? null
}

/** The grant an exchange is under (0046 voice_grant_of, as the bridge's assignment names it), or null. */
const coveredBy = async (exchangeId: string) =>
  (
    await owner((c) =>
      c.query<{ g: string | null }>(
        `SELECT (sophia.voice_grant_of(e.project_id,e.opened_at)).id AS g FROM sophia.room_exchanges e WHERE e.id=$1`,
        [exchangeId],
      ),
    )
  ).rows[0]?.g ?? null

const endExchange = (exchangeId: string) =>
  owner((c) => c.query(`UPDATE sophia.room_exchanges SET state='ended', ended_at=now() WHERE id=$1`, [exchangeId]))

describe('a room token names a grant only while the room’s open exchange, if any, is under it (Codex P1 r4232975804, 0051)', () => {
  it('R1, root’s sequence: an exchange opened under no grant, then a grant for its principal: none while that exchange is open; the grant once it ends, and for a fresh exchange under it', async () => {
    const { projectId } = await project()
    const uncovered = await open(projectId)
    const grantId = await grant(projectId)
    assert.equal(await coveredBy(uncovered), null, 'the open exchange is under no grant')
    assert.equal(await tokenGrant(projectId), null, 'so the token names none')
    await endExchange(uncovered)
    assert.equal(await tokenGrant(projectId), grantId, 'once it ended')
    const fresh = await open(projectId)
    assert.equal(await coveredBy(fresh), grantId)
    assert.equal(await tokenGrant(projectId), grantId)
  })

  it('C1, C2, C3 (controls): a grant before any exchange, a fresh exchange under it, and an exchange ended before the grant: the token names it; another member, never', async () => {
    const first = await project()
    const grantId = await grant(first.projectId)
    assert.equal(await tokenGrant(first.projectId), grantId, 'C1: no exchange')
    const fresh = await open(first.projectId)
    assert.equal(await coveredBy(fresh), grantId)
    assert.equal(await tokenGrant(first.projectId), grantId, 'C2: a fresh exchange under it')
    assert.equal(await tokenGrant(first.projectId, E), null, 'another member: none')
    const second = await project()
    await endExchange(await open(second.projectId))
    const later = await grant(second.projectId)
    assert.equal(await tokenGrant(second.projectId), later, 'C3: an exchange ended before the grant')
  })

  it('a grant superseded while an exchange is open under it: the new grant is not named until that exchange ends', async () => {
    const { projectId } = await project()
    const earlier = await grant(projectId)
    const underEarlier = await open(projectId)
    const later = await grant(projectId)
    assert.notEqual(later, earlier)
    assert.equal(await coveredBy(underEarlier), earlier, 'the open exchange stays under the grant it opened under')
    assert.equal(await tokenGrant(projectId), null, 'the new grant is not that exchange’s')
    await endExchange(underEarlier)
    assert.equal(await tokenGrant(projectId), later)
  })

  it('keeps 0046’s authority: executed by the API’s role alone, as the definer, with its search path', async () => {
    const { rows } = await owner((c) =>
      c.query<{ api: boolean; public: boolean; definer: boolean; config: string[] }>(
        `SELECT has_function_privilege('sophia_api','sophia.voice_room_qualification(uuid)','EXECUTE') AS api,
                has_function_privilege('public','sophia.voice_room_qualification(uuid)','EXECUTE') AS public,
                p.prosecdef AS definer, p.proconfig AS config
           FROM pg_proc p WHERE p.oid='sophia.voice_room_qualification(uuid)'::regprocedure`,
      ),
    )
    assert.deepEqual(rows[0], {
      api: true,
      public: false,
      definer: true,
      config: ['search_path=pg_catalog, sophia'],
    })
  })
})

describe('the exchange of a voice-created task, and the room as the bridge last saw it (A15, 0046)', () => {
  /**
   * A brief admitted by `actor` under `key`. `forCall`: admitted as the API admits a recorded voice call's command
   * (liveCallAdmits first, in the same transaction); otherwise as a member's own request under that key.
   */
  async function brief(projectId: string, actor: string, key: string, forCall = false): Promise<string> {
    const said = await withActor(pool, actor, 'write', (c) =>
      submitContribution(c, projectId, randomUUID(), {
        source: null,
        text: 'Draft the brief from this.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    const { rows } = await owner((c) =>
      c.query<{ r: string }>(`SELECT mission_revision AS r FROM sophia.projects WHERE id=$1`, [projectId]),
    )
    const receipt = await withActor(pool, actor, 'write', async (c) => {
      if (forCall) await liveCallAdmits(c, projectId, key)
      return admitNativeTask(c, projectId, key, {
        kind: 'draft_brief',
        instruction: 'Draft the brief.',
        contributionIds: [said.contributionId],
        expectedMissionRevision: Number(rows[0]?.r),
      })
    })
    return receipt.taskId
  }

  const toolCall = (exchangeId: string, actorId: string, callId: string, api = app) =>
    call('POST', '/v1/media/tool-calls', {
      api,
      media: true,
      body: { exchangeId, connectionGeneration: 1, callId, name: 'project_status', args: {}, inputEpoch: 1, actorId },
    })

  const exchangesOf = async (projectId: string, actor: string, api = app) =>
    new Map(
      (
        (await call('GET', `/api/v1/projects/${projectId}/snapshot`, { actor, api })).json.work as Array<{
          id: string
          exchangeId?: string
        }>
      ).map((t) => [t.id, t.exchangeId]),
    )

  /** An exchange P opens under P's voice qualification grant: only then are P's calls in it recorded. */
  const granted = async (projectId: string) => {
    await grant(projectId)
    return open(projectId)
  }

  const recorded = async (key: string) =>
    (await owner((c) => c.query(`SELECT 1 FROM sophia.live_tool_calls WHERE idempotency_key=$1`, [key]))).rowCount

  it('names the exchange its voice tool call ran in; a member’s own command under any key, another actor or the API off names none', async () => {
    const { projectId } = await project()
    await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const exchangeId = await granted(projectId)
    const bound = await toolCall(exchangeId, P, 'call-1')
    assert.equal(bound.status, 200, JSON.stringify(bound.json))
    assert.notEqual(bound.json.status, 'clarify', 'the call was bound to its speaker')
    const key = `live:${exchangeId}:1:call-1`
    assert.equal(await recorded(key), 1, 'the service recorded the call as it bound it')
    const voiced = await brief(projectId, P, key, true)
    assert.equal((await toolCall(exchangeId, P, 'call-5')).status, 200)
    const sameKey = await brief(projectId, P, `live:${exchangeId}:1:call-5`)
    const lookAlike = await brief(projectId, E, `live:${exchangeId}:1:call-2`)
    const otherActor = await brief(projectId, E, key)
    const studio = await brief(projectId, P, randomUUID())
    await assert.rejects(
      brief(projectId, E, key, true),
      { code: 'forbidden' },
      'nobody admits for another speaker’s call',
    )
    const seen = await exchangesOf(projectId, E)
    assert.equal(seen.get(voiced), exchangeId, 'the task its call created names the exchange')
    assert.equal(
      seen.get(sameKey),
      undefined,
      'the speaker’s own request under the very key of a recorded call that admitted nothing names none',
    )
    assert.equal(seen.get(lookAlike), undefined, 'a member’s own key that reads live:… names none')
    assert.equal(seen.get(otherActor), undefined, 'another actor’s command under the same key names none')
    assert.equal(seen.get(studio), undefined)
    const detail = await call('GET', `/api/v1/projects/${projectId}/native-tasks/${voiced}`, { actor: P })
    assert.equal(detail.status, 200, JSON.stringify(detail.json))
    assert.equal(detail.json.task.exchangeId, exchangeId, 'the task detail names it too')
    assert.equal((await exchangesOf(projectId, P, off)).get(voiced), undefined, 'the API off reads none of it')
    const offCall = await toolCall(exchangeId, P, 'call-3', off)
    assert.equal(offCall.status, 200)
    assert.equal(await recorded(`live:${exchangeId}:1:call-3`), 0, 'the API off records nothing')
    const unbound = await toolCall(exchangeId, E, 'call-4')
    assert.equal(unbound.json.status, 'clarify', 'a caller who does not hold the floor is not bound')
    assert.equal(await recorded(`live:${exchangeId}:1:call-4`), 0, 'and nothing is recorded for it')
    const outsider = randomUUID()
    const theirs = await call('GET', `/api/v1/projects/${projectId}/snapshot`, { actor: outsider })
    assert.equal(theirs.status, 403, 'a non-member reads no task at all')
  })

  /** A member's view of one recorded call (A15 ExchangeCalls). */
  interface Listed {
    seq: number
    tool: string
    inputEpoch: number
    answeredAt: string | null
    outcome: string | null
    command: { commandId: string; kind: string; goalId: string; authorityEpoch: number; state: string } | null
    taskId: string | null
  }

  /**
   * P's voice calls in one exchange on one task's goal: a steer, a Hold on running work, a Hold on work already held, a
   * replay of the first Hold and a read; then P's own request under the read's key, and P's call in another exchange
   * that created a task there.
   */
  async function controlledExchange() {
    const { projectId } = await project()
    await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const exchangeId = await granted(projectId)
    const task = await brief(projectId, E, randomUUID())
    const goal = async () => {
      const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
      const found = snap?.goals.find((x) => x.id === snap.work.find((t) => t.id === task)?.goalId)
      assert.ok(found)
      return found
    }
    const goalId = (await goal()).id
    const voice = (callId: string, name: string, args: Record<string, unknown> = {}) =>
      call('POST', '/v1/media/tool-calls', {
        media: true,
        body: { exchangeId, connectionGeneration: 1, callId, name, args, inputEpoch: 1, actorId: P, guide: 'v1.2' },
      })
    const steer = await voice('steer-1', 'control_work', {
      taskId: task,
      action: 'steer',
      brief: 'Lead with the cost.',
    })
    assert.equal(steer.json.status, 'ok', JSON.stringify(steer.json))
    // The work started: only running work takes a Hold.
    await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [goalId]))
    const hold = await voice('hold-1', 'control_work', { taskId: task, action: 'hold' })
    assert.equal(hold.json.status, 'ok', JSON.stringify(hold.json))
    assert.equal((await goal()).status, 'holding')
    const again = await voice('hold-2', 'control_work', { taskId: task, action: 'hold' })
    assert.equal(again.json.status, 'refused', 'a Hold on work already held is refused')
    const replay = await voice('hold-1', 'control_work', { taskId: task, action: 'hold' })
    assert.equal(
      replay.json.output.commandId,
      hold.json.output.commandId,
      'a replay is answered with its first command',
    )
    assert.equal((await voice('status-1', 'project_status')).json.status, 'ok')
    // The speaker's own request, under the very key of a call that admitted nothing, is admitted as theirs alone.
    const g = await goal()
    const forged = await call('POST', `/api/v1/projects/${projectId}/commands`, {
      actor: P,
      key: `live:${exchangeId}:1:status-1`,
      body: {
        kind: 'stop',
        goalId,
        expectedGoalRevision: g.revision,
        expectedAuthorityEpoch: g.authorityEpoch,
        bodySourceId: null,
      },
    })
    assert.equal(forged.status, 202, JSON.stringify(forged.json))
    const other = await project()
    await registerRuntime(db.ownerUrl, { projectId: other.projectId, admin: A })
    const otherExchange = await granted(other.projectId)
    assert.equal((await toolCall(otherExchange, P, 'y-1')).json.status, 'ok')
    const otherTask = await brief(other.projectId, P, `live:${otherExchange}:1:y-1`, true)
    return {
      exchangeId,
      goalId,
      epoch: (await goal()).authorityEpoch,
      holdId: String(hold.json.output.commandId),
      forgedId: String(forged.json.commandId),
      otherExchange,
      otherTask,
    }
  }

  const callsOf = (actor: string, exchange: string, api = app) =>
    call('GET', `/api/v1/exchanges/${exchange}/calls`, { actor, api })

  it('lists a member’s own calls in an exchange, each with only the command it admitted: a refusal, a replay, a read or a member’s own command certifies nothing', async () => {
    const x = await controlledExchange()
    const mine = await callsOf(P, x.exchangeId)
    assert.equal(mine.status, 200, JSON.stringify(mine.json))
    assert.equal(mine.json.exchangeId, x.exchangeId)
    const list = mine.json.calls as Listed[]
    assert.deepEqual(
      list.map((c) => [c.tool, c.command ? [c.command.kind, c.command.goalId] : null, c.taskId, c.outcome]),
      [
        ['control_work', ['steer', x.goalId], null, 'ok'],
        ['control_work', ['hold', x.goalId], null, 'ok'],
        ['control_work', null, null, 'refused'],
        ['project_status', null, null, 'ok'],
      ],
      'in the order recorded: the steer, the Hold, the refused Hold, the read; the replay is the Hold’s one entry, and the speaker’s own command under the read’s key is not the read’s',
    )
    assert.ok(
      list.every((c) => c.inputEpoch === 1 && c.answeredAt !== null),
      'each was answered, after what it admitted committed',
    )
    const [steer, hold] = list
    assert.ok(steer?.command && hold?.command)
    assert.ok(
      list.every((c, i) => i === 0 || c.seq > Number(list[i - 1]?.seq)),
      'seq increases in the order listed',
    )
    assert.equal(hold.command.commandId, x.holdId, 'the Hold’s entry is its own command')
    assert.equal(
      hold.command.authorityEpoch,
      x.epoch - 1,
      'the epoch the Hold took (the request after it took the next)',
    )
    assert.ok(hold.command.authorityEpoch > steer.command.authorityEpoch)
    const text = JSON.stringify(mine.json)
    assert.ok(!text.includes(x.otherTask), 'a task the same principal’s call created elsewhere is not listed')
    assert.ok(!text.includes(x.forgedId), 'nor is the speaker’s own command')
  })

  it('a call id reused for another operation is refused before it runs: nothing links to the call it reuses (Codex P1 on PR #190)', async () => {
    const { projectId } = await project()
    await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const exchangeId = await granted(projectId)
    const task = await brief(projectId, E, randomUUID())
    const goalOf = async () => {
      const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
      const found = snap?.goals.find((x) => x.id === snap.work.find((t) => t.id === task)?.goalId)
      assert.ok(found)
      return found
    }
    const goalId = (await goalOf()).id
    await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [goalId]))
    const voice = (callId: string, name: string, args: Record<string, unknown> = {}) =>
      call('POST', '/v1/media/tool-calls', {
        media: true,
        body: { exchangeId, connectionGeneration: 1, callId, name, args, inputEpoch: 1, actorId: P, guide: 'v1.2' },
      })
    assert.equal((await voice('c-1', 'project_status')).json.status, 'ok', 'a read, recorded and answered')
    // The provider reuses the read's call id for a Hold on running work.
    const reused = await voice('c-1', 'control_work', { taskId: task, action: 'hold' })
    assert.deepEqual(
      [reused.status, reused.json.status, reused.json.output.code],
      [200, 'refused', 'not_started:idempotency_conflict'],
    )
    assert.equal((await goalOf()).status, 'running', 'the Hold never ran')
    // The same read again, the bridge's retry of a lost answer: answered as before.
    assert.equal((await voice('c-1', 'project_status')).json.status, 'ok')
    // A Hold under its own id is admitted and linked once, replayed or not.
    const hold = await voice('h-1', 'control_work', { taskId: task, action: 'hold' })
    assert.equal(hold.json.status, 'ok', JSON.stringify(hold.json))
    assert.equal((await voice('h-1', 'control_work', { taskId: task, action: 'hold' })).json.status, 'ok')
    const listed = (await callsOf(P, exchangeId)).json.calls as Listed[]
    assert.deepEqual(
      listed.map((c) => [c.tool, c.command ? [c.command.kind, c.command.commandId] : null, c.outcome]),
      [
        ['project_status', null, 'ok'],
        ['control_work', ['hold', String(hold.json.output.commandId)], 'ok'],
      ],
      'the read stays a read with no command; the Hold is its own call’s, once',
    )
    const rows = await owner((c) =>
      c.query<{ tool: string; command: string | null }>(
        `SELECT tool, command_id AS command FROM sophia.live_tool_calls WHERE exchange_id=$1 ORDER BY seq`,
        [exchangeId],
      ),
    )
    assert.deepEqual(
      rows.rows.map((r) => [r.tool, r.command === null]),
      [
        ['project_status', true],
        ['control_work', false],
      ],
    )
  })

  /**
   * A project with running work, and an exchange (under P's grant with voice qualification on) whose floor P held at
   * input epoch 1 and Davide (E) holds at 2: the bridge's calls for either speaker, through the API in that mode.
   */
  async function twoSpeakers(mode: 'on' | 'off') {
    const api = mode === 'on' ? app : off
    const { projectId } = await project()
    const runtime = await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const exchangeId = mode === 'on' ? await granted(projectId) : await open(projectId)
    await owner((c) =>
      c.query(`INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES($1,$2,2,$3)`, [
        projectId,
        exchangeId,
        E,
      ]),
    )
    const task = await brief(projectId, A, randomUUID())
    /** The goal of a task (the brief's, unless named). */
    const goalOf = async (of = task) => {
      const snap = await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId))
      const found = snap?.goals.find((x) => x.id === snap.work.find((t) => t.id === of)?.goalId)
      assert.ok(found)
      return found
    }
    const goalId = (await goalOf()).id
    await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [goalId]))
    /**
     * The bridge's call with the context it carries: an utterance, an input mode, a guide (v1.2 unless named; undefined
     * leaves it out).
     */
    const voiceIn =
      (context: {
        utterance?: MediaToolCall['utterance']
        inputMode?: MediaToolCall['inputMode']
        guide?: MediaToolCall['guide']
      }) =>
      (actorId: string, inputEpoch: number, callId: string, name: string, args = {}) =>
        call('POST', '/v1/media/tool-calls', {
          api,
          media: true,
          body: {
            exchangeId,
            connectionGeneration: 1,
            callId,
            name,
            args,
            inputEpoch,
            actorId,
            guide: 'v1.2',
            ...context,
          },
        })
    const voice = voiceIn({})
    const commandsUnder = async (callId: string) =>
      (
        await owner((c) =>
          c.query<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.commands WHERE idempotency_key=$1`, [
            `live:${exchangeId}:1:${callId}`,
          ]),
        )
      ).rows[0]?.n
    /** Who admitted each command under a call's key, and its kind, in the order admitted. */
    const commandsBy = async (callId: string) =>
      (
        await owner((c) =>
          c.query<{ actor: string; kind: string }>(
            `SELECT actor_id AS actor, kind FROM sophia.commands WHERE idempotency_key=$1 ORDER BY created_at`,
            [`live:${exchangeId}:1:${callId}`],
          ),
        )
      ).rows.map((r) => [r.actor, r.kind])
    /** The claims (0047) held under these calls' keys. */
    const claimsOf = async (...callIds: string[]) =>
      (
        await owner((c) =>
          c.query<{ key: string }>(
            `SELECT idempotency_key AS key FROM sophia.live_call_keys WHERE idempotency_key = ANY($1)`,
            [callIds.map((id) => `live:${exchangeId}:1:${id}`)],
          ),
        )
      ).rows.map((r) => r.key)
    /** Bind another speaker to an input epoch of the exchange, as a floor change would. */
    const bindTo = (actorId: string, inputEpoch: number) =>
      owner((c) =>
        c.query(`INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES($1,$2,$3,$4)`, [
          projectId,
          exchangeId,
          inputEpoch,
          actorId,
        ]),
      )
    return {
      api,
      runtime,
      projectId,
      exchangeId,
      task,
      goalId,
      goalOf,
      voice,
      voiceIn,
      commandsUnder,
      commandsBy,
      claimsOf,
      bindTo,
      hold: { taskId: task, action: 'hold' },
    }
  }

  /**
   * Research may start in the project: its research grant is enabled, and its runtime said hello with the research
   * specialist and is ready.
   */
  async function researchReady(projectId: string, rt: RegisteredRuntime, api = app): Promise<void> {
    await owner((c) =>
      c.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId]),
    )
    const headers = {
      authorization: `Bearer ${rt.token}`,
      'x-sophia-runtime-unit': rt.runtimeUnitId,
      'x-sophia-bridge-instance': randomUUID(),
      'x-sophia-bridge-protocol': '1',
    }
    const roles = [{ id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }]
    const hello = await api.inject({
      method: 'POST',
      url: '/v1/runtime/hello',
      headers,
      payload: { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles },
    })
    assert.equal(hello.statusCode, 200, hello.body)
    const ready = await api.inject({
      method: 'POST',
      url: '/v1/runtime/ready',
      headers,
      payload: { state: 'ready', reason: null, unrecovered: [] },
    })
    assert.equal(ready.statusCode, 204, ready.body)
  }

  /** Deadlocks PostgreSQL has counted in this database so far, once its statistics have been flushed (about 1 s). */
  const deadlocks = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const { rows } = await owner((c) =>
      c.query<{ n: string }>(`SELECT deadlocks AS n FROM pg_stat_database WHERE datname=current_database()`),
    )
    return Number(rows[0]?.n)
  }

  const conflict = [200, 'refused', 'not_started:idempotency_conflict'] as const

  for (const mode of ['on', 'off'] as const) {
    describe(`a call key is one call whoever speaks, voice qualification ${mode} (root’s ruling, 0047)`, () => {
      /** Each call P listed in the exchange (voice qualification on): its tool, its command's kind and its answer. */
      const listedBy = async (exchangeId: string) =>
        ((await callsOf(P, exchangeId)).json.calls as Listed[]).map((c) => [c.tool, c.command?.kind ?? null, c.outcome])

      it('the same tool under a reused call id with other arguments is another call: refused before it runs, after a clarify or an ok (Codex P1 r4233409532)', async () => {
        const x = await twoSpeakers(mode)
        // Root's sequence: control_work with no arguments is a question back; then a Hold under the same id.
        assert.equal((await x.voice(P, 1, 'a-1', 'control_work')).json.status, 'clarify')
        assert.deepEqual(
          answerOf(await x.voice(P, 1, 'a-1', 'control_work', x.hold)),
          conflict,
          'a Hold after a clarify',
        )
        assert.equal((await x.goalOf()).status, 'running', 'no Hold ran under the key')
        assert.equal(await x.commandsUnder('a-1'), 0)
        // After an ok: a Hold on the brief's work, then the same id for a Hold on other work.
        const other = await brief(x.projectId, A, randomUUID())
        const otherGoal = (await x.goalOf(other)).id
        await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [otherGoal]))
        const hold = await x.voice(P, 1, 'a-2', 'control_work', x.hold)
        assert.equal(hold.json.status, 'ok', JSON.stringify(hold.json))
        const otherHold = { taskId: other, action: 'hold' }
        assert.deepEqual(answerOf(await x.voice(P, 1, 'a-2', 'control_work', otherHold)), conflict, 'after an ok')
        assert.equal((await x.goalOf(other)).status, 'running', 'the other work was never held')
        assert.deepEqual(await x.commandsBy('a-2'), [[P, 'hold']], 'the first Hold only')
        if (mode === 'on')
          assert.deepEqual(
            await listedBy(x.exchangeId),
            [
              ['control_work', null, 'clarify'],
              ['control_work', 'hold', 'ok'],
            ],
            'the clarify carries no command, and the Hold is its own call’s, once',
          )
      })

      it('start_research under the id of one that had no question is another call: nothing starts (Codex P1 r4233409532)', async () => {
        const x = await twoSpeakers(mode)
        await researchReady(x.projectId, x.runtime, x.api)
        const question = { question: 'Which sandboxes do PDF rendering services use?' }
        assert.equal((await x.voice(P, 1, 's-1', 'start_research')).json.status, 'clarify')
        assert.deepEqual(answerOf(await x.voice(P, 1, 's-1', 'start_research', question)), conflict)
        assert.equal(await x.commandsUnder('s-1'), 0, 'no research was admitted under the key')
        // The question under its own id starts it, and its retry is answered with that task.
        const first = await x.voice(P, 1, 's-2', 'start_research', question)
        assert.equal(first.json.status, 'admitted', JSON.stringify(first.json))
        const retry = await x.voice(P, 1, 's-2', 'start_research', question)
        assert.deepEqual([retry.json.status, retry.json.output.taskId], ['admitted', first.json.output.taskId])
        assert.equal(await x.commandsUnder('s-2'), 1)
        if (mode === 'on')
          assert.deepEqual(await listedBy(x.exchangeId), [
            ['start_research', null, 'clarify'],
            ['start_research', 'native_task', 'admitted'],
          ])
      })

      it('decide_mission_change under the id of the one its proposal’s utterance could only clarify is another call in the next: refused, nothing accepted (Codex r4233923450)', async () => {
        const x = await twoSpeakers(mode)
        const missionRevision = async () =>
          (
            await owner((c) =>
              c.query<{ r: number }>(`SELECT mission_revision::int AS r FROM sophia.projects WHERE id=$1`, [
                x.projectId,
              ]),
            )
          ).rows[0]?.r
        const proposed = await call('POST', `/api/v1/projects/${x.projectId}/mission/proposals`, {
          actor: A,
          body: { kind: 'mission', statement: 'A map of workshops.' },
        })
        assert.equal(proposed.status, 202, JSON.stringify(proposed.json))
        const decisionId = String(proposed.json.decisionId)
        const at4 = x.voiceIn({ utterance: 4, inputMode: 'voice' })
        const at5 = x.voiceIn({ utterance: 5, inputMode: 'voice' })
        const read = await at4(P, 1, 'u-read', 'read_selected_source', { decisionId })
        assert.equal(read.json.output.putToSpeaker, true, 'the proposal is put to the speaker in utterance 4')
        const answer = { proposalId: decisionId, proposalRevision: 1, decision: 'accept' }
        assert.equal((await at4(P, 1, 'u-1', 'decide_mission_change', answer)).json.status, 'clarify')
        assert.equal(
          (await at4(P, 1, 'u-1', 'decide_mission_change', answer)).json.status,
          'clarify',
          'the identical call in the same utterance is its retry',
        )
        assert.deepEqual(
          answerOf(await at5(P, 1, 'u-1', 'decide_mission_change', answer)),
          conflict,
          'the same tool and arguments in utterance 5 are another call',
        )
        assert.equal(await missionRevision(), 1, 'nothing was accepted under the key')
        // A later utterance under its own key decides it; its retry is the same decision.
        const decided = await at5(P, 1, 'u-2', 'decide_mission_change', answer)
        assert.deepEqual(
          [decided.json.status, decided.json.output.decision, decided.json.output.missionRevision],
          ['committed', 'accepted', 2],
          JSON.stringify(decided.json),
        )
        const again = await at5(P, 1, 'u-2', 'decide_mission_change', answer)
        assert.equal(again.json.status, 'committed')
        // Recorded (voice on), its repeat is answered from the record; not recorded, it runs again (r4234171899).
        if (mode === 'on') assert.equal(again.json.output.replayed, true)
        else assert.equal(again.json.output.missionRevision, 2)
        assert.equal(await missionRevision(), 2)
        if (mode === 'on')
          assert.deepEqual(
            await listedBy(x.exchangeId),
            [
              ['read_selected_source', null, 'ok'],
              ['decide_mission_change', null, 'clarify'],
              ['decide_mission_change', null, 'committed'],
            ],
            'the clarify stays the only answer of its call; the decision is its own call’s',
          )
      })

      it('the same call in another input mode or under another guide, or with an utterance it lacked, is another call (Codex r4233923450)', async () => {
        const x = await twoSpeakers(mode)
        const spoken = x.voiceIn({ inputMode: 'voice' })
        assert.equal((await spoken(P, 1, 'k-1', 'project_status')).json.status, 'ok')
        assert.equal((await spoken(P, 1, 'k-1', 'project_status')).json.status, 'ok', 'its retry')
        assert.deepEqual(answerOf(await x.voiceIn({ inputMode: 'text' })(P, 1, 'k-1', 'project_status')), conflict)
        assert.equal((await x.voice(P, 1, 'k-2', 'project_status')).json.status, 'ok', 'guide v1.2')
        const v13 = x.voiceIn({ guide: 'v1.3' })
        assert.deepEqual(answerOf(await v13(P, 1, 'k-2', 'project_status')), conflict, 'guide v1.3')
        const bare = x.voiceIn({ guide: undefined })
        assert.equal((await bare(P, 1, 'k-3', 'project_status')).json.status, 'ok', 'no guide, no utterance')
        assert.equal((await bare(P, 1, 'k-3', 'project_status')).json.status, 'ok', 'its retry')
        const named = x.voiceIn({ guide: undefined, utterance: 1 })
        assert.deepEqual(answerOf(await named(P, 1, 'k-3', 'project_status')), conflict, 'an utterance it lacked')
      })

      it('the same arguments again go on as before, after a clarify and after an ok: at most one command (Codex P1 r4233409532)', async () => {
        const x = await twoSpeakers(mode)
        const unclear = { taskId: x.task }
        assert.equal((await x.voice(P, 1, 'i-1', 'control_work', unclear)).json.status, 'clarify')
        const asked = await x.voice(P, 1, 'i-1', 'control_work', unclear)
        assert.equal(asked.json.status, 'clarify', 'its retry')
        assert.equal(await x.commandsUnder('i-1'), 0)
        const hold = await x.voice(P, 1, 'i-2', 'control_work', x.hold)
        assert.equal(hold.json.status, 'ok', JSON.stringify(hold.json))
        const retry = await x.voice(P, 1, 'i-2', 'control_work', x.hold)
        assert.deepEqual([retry.json.status, retry.json.output.commandId], ['ok', hold.json.output.commandId])
        assert.equal(await x.commandsUnder('i-2'), 1)
        // Recorded (voice on), each retry is answered from the record (r4234171899); not recorded, it runs again.
        assert.deepEqual(
          [asked.json.output.replayed, retry.json.output.replayed],
          mode === 'on' ? [true, true] : [undefined, undefined],
        )
        if (mode === 'on')
          assert.deepEqual(await listedBy(x.exchangeId), [
            ['control_work', null, 'clarify'],
            ['control_work', 'hold', 'ok'],
          ])
      })

      it(`a Hold refused while its goal was completed, repeated once it runs: ${mode === 'on' ? 'answered from the record, nothing admitted' : 'not recorded, so it runs again'} (Codex r4234171899)`, async () => {
        // Root's sequence: the Hold refused while the goal is completed; the goal running; the identical call again.
        const x = await twoSpeakers(mode)
        const goalIs = (status: string) =>
          owner((c) => c.query(`UPDATE sophia.goals SET status=$2 WHERE id=$1`, [x.goalId, status]))
        await goalIs('completed')
        const refused = await x.voice(P, 1, 'a-1', 'control_work', x.hold)
        assert.equal(refused.json.status, 'refused', JSON.stringify(refused.json))
        await goalIs('running')
        const again = await x.voice(P, 1, 'a-1', 'control_work', x.hold)
        if (mode === 'on') {
          assert.deepEqual(
            [again.json.status, again.json.output.replayed],
            ['refused', true],
            JSON.stringify(again.json),
          )
          assert.equal(await x.commandsUnder('a-1'), 0, 'nothing admitted under the key')
          assert.equal((await x.goalOf()).status, 'running', 'the work was not held')
          assert.deepEqual(
            await listedBy(x.exchangeId),
            [['control_work', null, 'refused']],
            'the record still says refused, and no command is linked to it',
          )
        } else {
          assert.equal(again.json.status, 'ok', 'nothing recorded to keep true: a repeat gets a fresh answer')
          assert.equal(await x.commandsUnder('a-1'), 1)
          await goalIs('running')
        }
        // Root's control: a fresh call key after the same change admits exactly one command.
        const fresh = await x.voice(P, 1, 'a-2', 'control_work', x.hold)
        assert.deepEqual([fresh.json.status, fresh.json.output.replayed], ['ok', undefined], JSON.stringify(fresh.json))
        assert.equal(await x.commandsUnder('a-2'), 1)
        assert.equal((await x.goalOf()).status, 'holding')
        if (mode === 'on')
          assert.deepEqual(await listedBy(x.exchangeId), [
            ['control_work', null, 'refused'],
            ['control_work', 'hold', 'ok'],
          ])
      })

      it('a peer’s refused Hold, repeated once the work runs, runs again: nothing of theirs is recorded (Codex r4234171899, control)', async () => {
        const x = await twoSpeakers(mode)
        await owner((c) => c.query(`UPDATE sophia.goals SET status='held' WHERE id=$1`, [x.goalId]))
        assert.equal((await x.voice(E, 2, 'p-1', 'control_work', x.hold)).json.status, 'refused')
        await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [x.goalId]))
        const again = await x.voice(E, 2, 'p-1', 'control_work', x.hold)
        assert.deepEqual([again.json.status, again.json.output.replayed], ['ok', undefined])
        assert.equal(await x.commandsUnder('p-1'), 1)
        if (mode === 'on') assert.deepEqual(await listedBy(x.exchangeId), [], 'nothing of Davide’s')
      })

      it('the same arguments in another key order, at any depth, are the same call; an array in another order is not (Codex P1 r4233409532)', async () => {
        const x = await twoSpeakers(mode)
        const args = { taskId: x.task, action: 'hold', detail: { b: 1, a: [1, { d: 2, c: 3 }] } }
        const hold = await x.voice(P, 1, 'o-1', 'control_work', args)
        assert.equal(hold.json.status, 'ok', JSON.stringify(hold.json))
        const reordered = { detail: { a: [1, { c: 3, d: 2 }], b: 1 }, action: 'hold', taskId: x.task }
        const retry = await x.voice(P, 1, 'o-1', 'control_work', reordered)
        assert.deepEqual([retry.json.status, retry.json.output.commandId], ['ok', hold.json.output.commandId])
        const swapped = { taskId: x.task, action: 'hold', detail: { b: 1, a: [{ d: 2, c: 3 }, 1] } }
        assert.deepEqual(answerOf(await x.voice(P, 1, 'o-1', 'control_work', swapped)), conflict)
        assert.equal(await x.commandsUnder('o-1'), 1)
        if (mode === 'on') assert.deepEqual(await listedBy(x.exchangeId), [['control_work', 'hold', 'ok']])
      })

      it('the principal first: a peer’s call under the key, or the principal’s for another tool, is refused before it runs', async () => {
        const x = await twoSpeakers(mode)
        assert.equal((await x.voice(P, 1, 'c-1', 'project_status')).json.status, 'ok')
        assert.deepEqual(answerOf(await x.voice(E, 2, 'c-1', 'control_work', x.hold)), conflict, 'another speaker')
        assert.deepEqual(answerOf(await x.voice(E, 2, 'c-1', 'project_status')), conflict, 'another speaker, same read')
        assert.deepEqual(answerOf(await x.voice(P, 1, 'c-1', 'control_work', x.hold)), conflict, 'another tool')
        assert.equal((await x.goalOf()).status, 'running', 'no Hold ran under the key')
        assert.equal(await x.commandsUnder('c-1'), 0)
      })

      it('the peer first: the principal’s call under a peer’s call key is refused before it runs', async () => {
        const x = await twoSpeakers(mode)
        assert.equal((await x.voice(E, 2, 'c-2', 'project_status')).json.status, 'ok')
        assert.deepEqual(answerOf(await x.voice(P, 1, 'c-2', 'control_work', x.hold)), conflict)
        assert.equal((await x.goalOf()).status, 'running', 'no Hold ran under the key')
        assert.equal(await x.commandsUnder('c-2'), 0)
        if (mode === 'on') {
          const listed = (await callsOf(P, x.exchangeId)).json.calls as Listed[]
          assert.deepEqual(listed, [], 'nothing of Davide’s call, nor the principal’s refused one, in the evidence')
        }
      })

      it('a peer’s own call under a new key, and each speaker’s lost-answer retry, go on as before: one command each', async () => {
        const x = await twoSpeakers(mode)
        const peer = await x.voice(E, 2, 'e-1', 'control_work', x.hold)
        assert.equal(peer.json.status, 'ok', JSON.stringify(peer.json))
        const retry = await x.voice(E, 2, 'e-1', 'control_work', x.hold)
        assert.deepEqual([retry.json.status, retry.json.output.commandId], ['ok', peer.json.output.commandId])
        assert.equal(await x.commandsUnder('e-1'), 1)
        // The Hold settled (the runtime checked the stops): the work is held, and takes the principal's Resume.
        await owner((c) => c.query(`UPDATE sophia.goals SET status='held' WHERE id=$1`, [x.goalId]))
        const resume = await x.voice(P, 1, 'r-1', 'control_work', { taskId: x.task, action: 'resume' })
        assert.equal(resume.json.status, 'ok', JSON.stringify(resume.json))
        const again = await x.voice(P, 1, 'r-1', 'control_work', { taskId: x.task, action: 'resume' })
        assert.deepEqual([again.json.status, again.json.output.commandId], ['ok', resume.json.output.commandId])
        assert.equal(await x.commandsUnder('r-1'), 1)
        if (mode === 'on') {
          const listed = (await callsOf(P, x.exchangeId)).json.calls as Listed[]
          assert.deepEqual(
            listed.map((c) => [c.tool, c.command?.commandId ?? null]),
            [['control_work', String(resume.json.output.commandId)]],
            'the principal’s own call only, linked once; nothing of Davide’s',
          )
          assert.ok(!JSON.stringify(listed).includes(E))
        }
      })

      it('a command first under the key, in either order: the other speaker’s call is refused, and the one command is the first’s (prodrev-r3 N3)', async () => {
        const x = await twoSpeakers(mode)
        assert.equal((await x.voice(P, 1, 'h-1', 'control_work', x.hold)).json.status, 'ok')
        assert.deepEqual(answerOf(await x.voice(E, 2, 'h-1', 'control_work', x.hold)), conflict)
        assert.deepEqual(await x.commandsBy('h-1'), [[P, 'hold']], 'the principal’s Hold only')
        await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [x.goalId]))
        assert.equal((await x.voice(E, 2, 'h-2', 'control_work', x.hold)).json.status, 'ok')
        assert.deepEqual(answerOf(await x.voice(P, 1, 'h-2', 'control_work', x.hold)), conflict)
        assert.deepEqual(await x.commandsBy('h-2'), [[E, 'hold']], 'Davide’s Hold only')
      })

      it('a call that does not bind claims nothing: the speaker it belongs to then runs under that key (prodrev-r3 N3)', async () => {
        const x = await twoSpeakers(mode)
        const outsider = randomUUID()
        await x.bindTo(outsider, 5) // bound to an epoch, but no member of the project
        assert.equal((await x.voice(E, 9, 'sq-1', 'project_status')).json.status, 'clarify', 'an epoch nobody holds')
        assert.equal((await x.voice(E, 1, 'sq-2', 'project_status')).json.status, 'clarify', 'the principal’s epoch')
        assert.equal((await x.voice(outsider, 5, 'sq-3', 'project_status')).json.status, 'clarify', 'a non-member')
        assert.deepEqual(await x.claimsOf('sq-1', 'sq-2', 'sq-3'), [], 'the claim rolled back with the bind')
        for (const callId of ['sq-1', 'sq-2', 'sq-3']) {
          const own = await x.voice(P, 1, callId, 'project_status')
          assert.equal(own.json.status, 'ok', `${callId}: ${JSON.stringify(own.json)}`)
        }
      })

      it('the same speaker at another input epoch is another call: refused under the key, nothing runs (prodrev-r3 N3)', async () => {
        const x = await twoSpeakers(mode)
        await x.bindTo(P, 3) // the floor came back to the principal at epoch 3
        assert.equal((await x.voice(P, 1, 'm-1', 'project_status')).json.status, 'ok')
        assert.deepEqual(answerOf(await x.voice(P, 3, 'm-1', 'project_status')), conflict, 'the same read')
        assert.deepEqual(answerOf(await x.voice(P, 3, 'm-1', 'control_work', x.hold)), conflict, 'a Hold')
        assert.equal((await x.goalOf()).status, 'running', 'no Hold ran under the key')
        assert.equal(await x.commandsUnder('m-1'), 0)
      })

      it('calls under distinct keys at once, three in each of 10 trials: every one goes on, no deadlock, one command each (prodrev-r3 F1)', async () => {
        const x = await twoSpeakers(mode)
        const tasks = [x.task, await brief(x.projectId, A, randomUUID()), await brief(x.projectId, A, randomUUID())]
        const goals = await Promise.all(tasks.map(async (t) => (await x.goalOf(t)).id))
        const deadlocksBefore = await deadlocks()
        const seen: string[] = []
        const commands: number[] = []
        for (let trial = 0; trial < 10; trial += 1) {
          await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id = ANY($1)`, [goals]))
          const keys = ['pa', 'pb', 'ec'].map((k) => `${k}-${String(trial)}`)
          const holds = await Promise.all([
            x.voice(P, 1, keys[0] ?? '', 'control_work', { taskId: tasks[0], action: 'hold' }),
            x.voice(P, 1, keys[1] ?? '', 'control_work', { taskId: tasks[1], action: 'hold' }),
            x.voice(E, 2, keys[2] ?? '', 'control_work', { taskId: tasks[2], action: 'hold' }),
          ])
          seen.push(holds.map((r) => String(r.json.status)).join('/'))
          for (const key of keys) commands.push((await x.commandsUnder(key)) ?? 0)
        }
        const counted = (await deadlocks()) - deadlocksBefore
        assert.deepEqual(
          seen.filter((s) => s !== 'ok/ok/ok'),
          [],
          `every call answered ok (PostgreSQL counted ${String(counted)} deadlocks)`,
        )
        assert.equal(counted, 0, 'no deadlock (40P01)')
        assert.deepEqual(
          commands,
          Array.from({ length: 30 }, () => 1),
          'one command under each key',
        )
      })

      it('two speakers at once under one key: exactly one proceeds, whichever, in each of 5 trials', async () => {
        const x = await twoSpeakers(mode)
        for (let trial = 0; trial < 5; trial += 1) {
          const callId = `race-${String(trial)}`
          const both = await Promise.all([
            x.voice(P, 1, callId, 'project_status'),
            x.voice(E, 2, callId, 'project_status'),
          ])
          const answers = both.map((r) => answerOf(r))
          assert.deepEqual(
            answers.map((a) => a[1]).toSorted((a, b) => a.localeCompare(b)),
            ['ok', 'refused'],
            `trial ${String(trial)}: ${JSON.stringify(answers)}`,
          )
          assert.deepEqual(
            answers.find((a) => a[1] === 'refused'),
            conflict,
          )
        }
      })
    })
  }

  describe('a recorded call once answered is terminal (Codex r4234171899)', () => {
    /** Each call P listed in the exchange: its tool, its command's kind and its answer. */
    const listedIn = async (exchangeId: string) =>
      ((await callsOf(P, exchangeId)).json.calls as Listed[]).map((c) => [c.tool, c.command?.kind ?? null, c.outcome])

    it('a recorded call whose first attempt stopped before its answer runs again, once, and is answered', async () => {
      const x = await twoSpeakers('on')
      const key = `live:${x.exchangeId}:1:l-1`
      // The first attempt claimed, bound and recorded the call, then stopped before it ran or was answered.
      await withService(pool, async (c) => {
        const bound = { exchangeId: x.exchangeId, inputEpoch: 1, actorId: P, key, name: 'control_work' }
        await claimLiveCall(c, { ...bound, callSha256: callSha256({ args: x.hold, guide: 'v1.2' }) })
        await toolSpeaker(c, x.exchangeId, 1, P)
        assert.equal(await recordLiveCall(c, bound), true)
      })
      assert.deepEqual(await listedIn(x.exchangeId), [['control_work', null, null]], 'recorded, not answered')
      const retry = await x.voice(P, 1, 'l-1', 'control_work', x.hold)
      assert.deepEqual([retry.json.status, retry.json.output.replayed], ['ok', undefined], JSON.stringify(retry.json))
      assert.equal(await x.commandsUnder('l-1'), 1, 'its handler ran once')
      assert.deepEqual(await listedIn(x.exchangeId), [['control_work', 'hold', 'ok']], 'and it is answered')
      const again = await x.voice(P, 1, 'l-1', 'control_work', x.hold)
      assert.deepEqual(
        [again.json.status, again.json.output.replayed, again.json.output.commandId],
        ['ok', true, retry.json.output.commandId],
      )
      assert.equal(await x.commandsUnder('l-1'), 1)
    })

    it('two identical recorded calls at once: one is made, the other answered from its record once it is answered', async () => {
      const x = await twoSpeakers('on')
      const both = await Promise.all([
        x.voice(P, 1, 'w-1', 'control_work', x.hold),
        x.voice(P, 1, 'w-1', 'control_work', x.hold),
      ])
      assert.deepEqual(
        both.map((r) => String(r.json.status)),
        ['ok', 'ok'],
      )
      assert.equal(both[0]?.json.output.commandId, both[1]?.json.output.commandId)
      assert.deepEqual(
        both.map((r) => r.json.output.replayed === true).toSorted((a, b) => Number(a) - Number(b)),
        [false, true],
        'exactly one ran',
      )
      assert.equal(await x.commandsUnder('w-1'), 1)
      assert.deepEqual(await listedIn(x.exchangeId), [['control_work', 'hold', 'ok']])
    })
  })

  it('lists another exchange’s calls only there; another member, an outsider or the API off reads none', async () => {
    const x = await controlledExchange()
    const theirs = await callsOf(P, x.otherExchange)
    assert.deepEqual(
      (theirs.json.calls as Listed[]).map((c) => c.taskId),
      [x.otherTask],
      'the other exchange lists its own call, with the task it created',
    )
    const seenByE = await callsOf(E, x.exchangeId)
    assert.deepEqual(
      [seenByE.json.exchangeId, seenByE.json.calls],
      [x.exchangeId, []],
      'another member sees none of the speaker’s calls',
    )
    assert.deepEqual(
      (await callsOf(E, x.otherExchange)).json.calls,
      [],
      'nor in the other project, where E is a member too',
    )
    const outsider = await callsOf(randomUUID(), x.exchangeId)
    assert.deepEqual([outsider.status, outsider.json.code], [422, 'not_found'], 'a non-member finds no exchange')
    const unknown = await callsOf(P, randomUUID())
    assert.deepEqual([unknown.status, unknown.json.code], [422, 'not_found'])
    for (const id of [x.exchangeId.toUpperCase(), `urn:uuid:${x.exchangeId}`]) {
      const odd = await callsOf(P, id)
      assert.deepEqual([odd.status, odd.json.code], [422, 'invalid_request'], 'only a lowercase canonical id')
    }
    const badAfter = await call('GET', `/api/v1/exchanges/${x.exchangeId}/calls?after=yesterday`, { actor: P })
    assert.deepEqual([badAfter.status, badAfter.json.code], [422, 'invalid_request'])
    assert.equal((await callsOf(P, x.exchangeId, off)).status, 404, 'the API off serves no such route')
  })

  it('keeps only the grant’s principal’s calls in an exchange under the grant; every call is answered as before', async () => {
    const ungranted = await project()
    await registerRuntime(db.ownerUrl, { projectId: ungranted.projectId, admin: A })
    const plain = await open(ungranted.projectId)
    const asked = await toolCall(plain, P, 'plain-1')
    assert.equal(asked.json.status, 'ok', 'the call is answered as with voice qualification off')
    assert.equal(await recorded(`live:${plain}:1:plain-1`), 0, 'no grant: nothing is kept')
    const task = await brief(ungranted.projectId, E, randomUUID())
    const steer = await call('POST', '/v1/media/tool-calls', {
      media: true,
      body: {
        exchangeId: plain,
        connectionGeneration: 1,
        callId: 'plain-2',
        name: 'control_work',
        args: { taskId: task, action: 'steer', brief: 'Lead with the cost.' },
        inputEpoch: 1,
        actorId: P,
        guide: 'v1.2',
      },
    })
    assert.equal(steer.json.status, 'ok', 'a control is admitted as before, with nothing to link it to')
    assert.deepEqual((await callsOf(P, plain)).json.calls, [])
    const other = await project()
    await registerRuntime(db.ownerUrl, { projectId: other.projectId, admin: A })
    await grant(other.projectId)
    const theirs = await open(other.projectId, E)
    const spoken = await toolCall(theirs, E, 'e-1')
    assert.equal(spoken.json.status, 'ok', 'E holds the floor and is answered')
    assert.equal(await recorded(`live:${theirs}:1:e-1`), 0, 'a speaker other than the grant’s principal is not kept')
    assert.deepEqual((await callsOf(E, theirs)).json.calls, [])
  })

  it('a baseline leaves out a call already on its way; a call not answered yet shows no command', async () => {
    const { projectId } = await project()
    await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const exchangeId = await granted(projectId)
    const task = await brief(projectId, E, randomUUID())
    const goalId = (await withActor(pool, P, 'read', (c) => readSnapshot(c, projectId)))?.work.find(
      (t) => t.id === task,
    )?.goalId
    assert.ok(goalId)
    await owner((c) => c.query(`UPDATE sophia.goals SET status='running' WHERE id=$1`, [goalId]))
    const hold = (callId: string) =>
      call('POST', '/v1/media/tool-calls', {
        media: true,
        body: {
          exchangeId,
          connectionGeneration: 1,
          callId,
          name: 'control_work',
          args: { taskId: task, action: 'hold' },
          inputEpoch: 1,
          actorId: P,
          guide: 'v1.2',
        },
      })
    const recordOnly = (callId: string) => (c: pg.PoolClient) =>
      recordLiveCall(c, {
        exchangeId,
        inputEpoch: 1,
        actorId: P,
        key: `live:${exchangeId}:1:${callId}`,
        name: 'control_work',
      })
    // A stray Hold is on its way, recorded but not committed, while the Lab reads its baseline.
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const stray = withService(pool, async (c) => {
      await recordOnly('stray')(c)
      started.resolve()
      await gate.promise
    })
    await started.promise
    const baseline = await callsOf(P, exchangeId)
    assert.deepEqual(baseline.json.calls, [], 'not committed: not seen')
    gate.resolve()
    await stray
    assert.equal((await hold('stray')).json.status, 'ok', 'the stray Hold commits and is admitted after the baseline')
    assert.equal((await hold('own')).json.status, 'refused', 'the step’s own Hold: the goal was held before it')
    assert.deepEqual(kinds((await callsOf(P, exchangeId)).json.calls), [
      ['hold', 'ok'],
      [null, 'refused'],
    ])
    const since = await call(
      'GET',
      `/api/v1/exchanges/${exchangeId}/calls?after=${encodeURIComponent(String(baseline.json.readAt))}`,
      { actor: P },
    )
    assert.deepEqual(
      kinds(since.json.calls),
      [[null, 'refused']],
      'after the baseline, only the step’s own refused Hold, which certifies nothing',
    )
    // A call recorded and not answered yet: whatever it admits may not have committed.
    await withService(pool, recordOnly('pending'))
    const pending = lastOf<Listed>((await callsOf(P, exchangeId)).json.calls)
    assert.deepEqual([pending.answeredAt, pending.outcome, pending.command], [null, null, null])
    assert.equal((await hold('pending')).json.status, 'refused')
    const answered = lastOf<Listed>((await callsOf(P, exchangeId)).json.calls)
    assert.equal(answered.seq, pending.seq, 'the same call, answered')
    assert.deepEqual([answered.answeredAt === null, answered.outcome], [false, 'refused'])
  })

  it('start_research by voice: its task names the exchange, and only the call that created it lists that task', async () => {
    const { projectId } = await project()
    await researchReady(projectId, await registerRuntime(db.ownerUrl, { projectId, admin: A }))
    const exchangeId = await granted(projectId)
    const research = (callId: string) =>
      call('POST', '/v1/media/tool-calls', {
        media: true,
        body: {
          exchangeId,
          connectionGeneration: 1,
          callId,
          name: 'start_research',
          args: { question: 'Which sandboxes do PDF rendering services use?' },
          inputEpoch: 1,
          actorId: P,
          guide: 'v1.2',
        },
      })
    const first = await research('r-1')
    assert.equal(first.json.status, 'admitted', JSON.stringify(first.json))
    const taskId = String(first.json.output.taskId)
    const repeat = await research('r-2')
    assert.deepEqual(
      [repeat.json.status, repeat.json.output.existingTaskId],
      ['ok', taskId],
      'the same question again is answered with the task under way',
    )
    assert.equal((await research('r-1')).json.output.taskId, taskId, 'a replay is answered with its first task')
    const list = (await call('GET', `/api/v1/exchanges/${exchangeId}/calls`, { actor: P })).json.calls as Array<{
      tool: string
      command: { kind: string } | null
      taskId: string | null
      outcome: string | null
    }>
    assert.deepEqual(
      list.map((x) => [x.tool, x.command?.kind ?? null, x.taskId, x.outcome]),
      [
        ['start_research', 'native_task', taskId, 'admitted'],
        ['start_research', null, null, 'ok'],
      ],
      'the repeat created nothing, so it certifies no creation; the replay is the first call’s one entry',
    )
    assert.equal((await exchangesOf(projectId, E)).get(taskId), exchangeId, 'a member reads the task’s exchange')
  })

  it('answers a member only whether they are in the room, the counts and the report’s age; nobody else’s identity', async () => {
    const { roomId } = await project()
    const presence = (actor: string, api = app, room = roomId) =>
      call('GET', `/api/v1/rooms/${room}/live-presence`, { actor, api })
    const none = await presence(P)
    assert.equal(none.status, 200, JSON.stringify(none.json))
    assert.deepEqual(
      [none.json.observed, none.json.fresh, none.json.selfPresent, none.json.participants],
      [false, false, false, 0],
      'no report: nothing observed, and nothing claimed',
    )
    const report = await call('POST', '/v1/media/presence', {
      media: true,
      body: {
        roomId,
        exchangeId: null,
        bridgeInstanceId: 'bridge-1',
        voice: 'ready',
        reason: null,
        participants: [
          { identity: P, standing: 'editor' },
          { identity: 'guest-0001', standing: 'guest' },
        ],
      },
    })
    assert.equal(report.status, 204)
    const mine = await presence(P)
    assert.deepEqual(Object.keys(mine.json).toSorted(), [
      'emptySince',
      'exchangeId',
      'fresh',
      'guests',
      'observed',
      'participants',
      'reportedAt',
      'roomId',
      'selfPresent',
      'voice',
    ])
    assert.deepEqual(
      [
        mine.json.observed,
        mine.json.fresh,
        mine.json.selfPresent,
        mine.json.participants,
        mine.json.guests,
        mine.json.voice,
      ],
      [true, true, true, 2, 1, 'ready'],
    )
    assert.ok(!JSON.stringify(mine.json).includes('guest-0001'), 'no identity but the caller’s own presence')
    assert.equal((await presence(E)).json.selfPresent, false, 'another member sees only that they are not in it')
    await owner((c) =>
      c.query(`UPDATE sophia.room_ai_presence SET reported_at=now()-interval '1 minute' WHERE room_id=$1`, [roomId]),
    )
    assert.equal((await presence(P)).json.fresh, false, 'an old report is stale')
    const outsider = await presence(randomUUID())
    assert.deepEqual([outsider.status, outsider.json.code], [422, 'not_found'], 'a non-member finds no room')
    const unknown = await presence(P, app, randomUUID())
    assert.deepEqual([unknown.status, unknown.json.code], [422, 'not_found'])
    const urn = await presence(P, app, `urn:uuid:${roomId}`)
    assert.deepEqual([urn.status, urn.json.code], [422, 'invalid_request'], 'only a lowercase canonical id')
    assert.equal((await presence(P, off)).status, 404, 'the API off serves no such route')
  })
})

describe('the media bridge records through the API (A15; fake LiveKit and Google)', () => {
  it('its receipts are taken as A15 declares them, read back by the principal, and the guard’s end closes it', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId)
    const exchangeId = await open(projectId)
    const service = httpMediaService(await baseUrl(), MEDIA_TOKEN)
    const batch = await service.assignments(null, 0, new AbortController().signal)
    const assignment = batch.assignments.find((a) => a.exchangeId === exchangeId)
    assert.ok(assignment?.qualification, 'the assignment names the grant')
    assert.equal(assignment.inputActorId, P, 'the principal opened it, and holds the floor')
    let roomEvents: RoomEvents | undefined
    let liveEvents: LiveEvents | undefined
    let closed = 0
    let sent = 0
    const played: Int16Array[] = []
    const logs: Array<[string, Record<string, unknown>]> = []
    const session = new RoomSession(assignment, {
      service,
      // LABELLED FAKE LiveKit room: the principal is in it.
      joinRoom: async (_access, events) => {
        await Promise.resolve()
        roomEvents = events
        const room: RoomLink = {
          people: () => [{ identity: P, standing: 'editor' }],
          play: async (frame) => void played.push(await Promise.resolve(frame)),
          clearPlayback: () => undefined,
          watch: () => undefined,
          setState: () => Promise.resolve(),
          close: () => Promise.resolve(void (closed += 1)),
        }
        return room
      },
      // LABELLED FAKE Gemini Live connection.
      connectLive: async (_options, events) => {
        await Promise.resolve()
        liveEvents = events
        const live: LiveLink = {
          sendAudio: () => void (sent += 1),
          sendAudioStreamEnd: () => undefined,
          sendFrame: () => undefined,
          sendToolResponses: () => undefined,
          sendNotice: () => undefined,
          close: () => void (closed += 1),
        }
        return live
      },
      apiKey: 'fake',
      model: 'gemini-3.8-live',
      guide: loadMissionGuide(DECLARED_NAMES),
      bridgeInstanceId: 'bridge-voice',
      now: Date.now,
      log: (event, detail) => logs.push([event, detail ?? {}]),
      every: () => () => undefined,
      voiceEvidence: true,
      evidenceRetryMs: [0, 0],
    })
    await session.start()
    assert.ok(roomEvents && liveEvents)
    liveEvents.setupComplete()
    for (let i = 0; i < 3; i += 1) roomEvents.audio(P, new Int16Array(1600).fill(2000), 16000, 1)
    // The input waits for its generation's reservation on the API, then goes on.
    await until('the held input went on', () => sent === 3)
    liveEvents.inputTranscript('Synthetic words for the Lab', true)
    liveEvents.audio(Buffer.alloc(480 * 2 * 2, 1).toString('base64'), 'audio/pcm;rate=24000')
    await new Promise((resolve) => setImmediate(resolve))
    liveEvents.turnComplete()
    // A report that leaves no room for the next turn: the API's guard ends the exchange on this receipt, and its
    // answer closes the session at once.
    liveEvents.usage({ totalTokenCount: 196_000, promptTokenCount: 26_000 })
    await until(`the session closed (${String(closed)})`, () => closed === 2)
    await session.close()
    assert.ok(logs.some(([event, d]) => event === 'qualification.exchange_ended' && d.reason === 'usage'))
    assert.deepEqual(
      logs.filter(([event]) => event === 'evidence.dropped'),
      [],
      'every receipt was taken',
    )
    const read = await call('GET', `/api/v1/exchanges/${exchangeId}/qualification-evidence`, { actor: P })
    assert.equal(read.status, 200, JSON.stringify(read.json))
    assert.equal(read.json.state, 'ended')
    assert.deepEqual(
      [
        read.json.grant.endedReason,
        read.json.grant.usageTokens,
        read.json.grant.turns,
        read.json.grant.connectionsOpened,
      ],
      ['usage', 196_000, 1, 1],
    )
    type Kept = { source: string; seq: number; kind: string; receipt: Record<string, unknown> }
    const kept = read.json.receipts as Kept[]
    assert.deepEqual(
      kept.map((r) => [r.source, r.seq, r.kind === 'provider' ? `provider:${String(r.receipt.phase)}` : r.kind]),
      [
        ['bridge', 1, 'provider:setup'],
        ['bridge', 2, 'provider:ready'],
        ['bridge', 3, 'input_window'],
        ['bridge', 4, 'input_turn'],
        ['bridge', 5, 'output_reply'],
        ['bridge', 6, 'provider:usage'],
        ['bridge', 7, 'provider:closed'],
        ['bridge', 8, 'session_closed'],
        ['service', 0, 'guard'],
      ],
    )
    assert.ok(kept.every((r) => r.receipt.grantId === grantId && r.receipt.runBindingSha256 === RUN))
    const window = kept.find((r) => r.kind === 'input_window')?.receipt
    assert.deepEqual([window?.chunkCount, window?.sampleCount, window?.endReason], [3, 4800, 'turn_complete'])
    const reply = kept.find((r) => r.kind === 'output_reply')?.receipt
    assert.deepEqual([reply?.framesPlayed, reply?.terminal], [played.length, 'played'])
    assert.equal(kept.find((r) => r.kind === 'session_closed')?.receipt.reason, 'ended')
    assert.equal(JSON.stringify(read.json).includes('Synthetic words'), false, 'no words reached the API')
  })
})

describe('the exchange’s durable bound through the API (A15, 0046)', () => {
  it('reserves connections and generations for the bridge alone, and answers what it cannot bind in the API’s words', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId, { connections: 1 })
    const exchangeId = await open(projectId)
    const granted = await reserve({ exchangeId, grantId, kind: 'connection' })
    assert.deepEqual([granted.status, granted.json], [200, { ok: true, ordinal: 1, stop: null, ended: false }])
    const generation = await reserve({ exchangeId, grantId, kind: 'generation', ordinal: 1, charge: 27_000 })
    assert.deepEqual(generation.json, { ok: true, ordinal: 1, stop: null, ended: false })
    // A top-up of the connection's input allowance: a charge only, no generation (Codex P1 on PR #190).
    const topUp = await reserve({ exchangeId, grantId, kind: 'spend', ordinal: 1, charge: 4000 })
    assert.deepEqual([topUp.status, topUp.json], [200, { ok: true, ordinal: 1, stop: null, ended: false }])
    const nameless = await reserve({ exchangeId, grantId, kind: 'spend', charge: 4000 })
    assert.deepEqual([nameless.status, nameless.json.code], [422, 'invalid_request'], 'a top-up names its connection')
    assert.equal((await reserve({ exchangeId: randomUUID(), grantId, kind: 'connection' })).json.code, 'not_found')
    assert.equal((await reserve({ exchangeId, grantId: randomUUID(), kind: 'connection' })).status, 403)
    for (const charge of [-1, 5_000_001]) {
      const bad = await reserve({ exchangeId, grantId, kind: 'generation', ordinal: 1, charge })
      assert.equal(bad.status, 422, `charge ${String(charge)}`)
    }
    const unreserved = await reserve({ exchangeId, grantId, kind: 'generation', ordinal: 2, charge: 1 })
    assert.deepEqual([unreserved.status, unreserved.json.code], [422, 'invalid_request'])
    const member = await call('POST', '/v1/media/qualification-reserve', {
      actor: P,
      body: { exchangeId, grantId, kind: 'connection' },
    })
    assert.equal(member.status, 401, 'the bridge capability only')
    const refused = await reserve({ exchangeId, grantId, kind: 'connection' })
    assert.deepEqual(refused.json, { ok: false, ordinal: null, stop: 'connections', ended: true })
    const ended = await reserve({ exchangeId, grantId, kind: 'connection' })
    assert.deepEqual([ended.status, ended.json.code], [409, 'invalid_state'], 'an ended exchange reserves nothing')
    const stop = await reserve({ exchangeId, grantId, kind: 'stop' })
    assert.deepEqual(
      [stop.status, stop.json],
      [200, { ok: true, ordinal: null, stop: null, ended: true }],
      'the bridge’s own stop: answered the same on an ended exchange',
    )
    const read = await call('GET', `/api/v1/exchanges/${exchangeId}/qualification-evidence`, { actor: P })
    assert.deepEqual(
      [read.json.state, read.json.grant.endedReason, read.json.grant.connectionsOpened, read.json.grant.turns],
      ['ended', 'connections', 1, 1],
    )
    assert.equal(read.json.grant.committedTokens, 31_000, 'the generation and the top-up')
    const endedTopUp = await reserve({ exchangeId, grantId, kind: 'spend', ordinal: 1, charge: 1 })
    assert.deepEqual([endedTopUp.status, endedTopUp.json.code], [409, 'invalid_state'], 'nor a top-up')
  })

  /**
   * The real MediaBridge on the real API; LiveKit and Gemini Live are LABELLED FAKES. `taken` is each receipt the API
   * took from this process, in the order it answered: [its write identity, the number the API gave it].
   */
  async function bridgeOn(exchangeId: string, url?: string) {
    const client = httpMediaService(url ?? (await baseUrl()), MEDIA_TOKEN)
    const taken: Array<[string, number]> = []
    const service: typeof client = {
      ...client,
      recordEvidence: async (w, signal) => {
        const ack = await client.recordEvidence(w, signal)
        taken.push([w.writeId, ack.seq])
        return ack
      },
    }
    const assigned = (await service.assignments(null, 0, new AbortController().signal)).assignments.find(
      (a) => a.exchangeId === exchangeId,
    )
    assert.ok(assigned?.qualification)
    const roomEvents: RoomEvents[] = []
    const lives: LiveEvents[] = []
    const sent: number[] = []
    const logs: Array<[string, Record<string, unknown>]> = []
    const bridge = new MediaBridge({
      service,
      joinRoom: async (_access, events) => {
        await Promise.resolve()
        roomEvents.push(events)
        const room: RoomLink = {
          people: () => [{ identity: P, standing: 'editor' }],
          play: () => Promise.resolve(),
          clearPlayback: () => undefined,
          watch: () => undefined,
          setState: () => Promise.resolve(),
          close: () => Promise.resolve(),
        }
        return room
      },
      connectLive: async (_options, events) => {
        await Promise.resolve()
        lives.push(events)
        const index = sent.push(0) - 1
        const live: LiveLink = {
          sendAudio: () => void (sent[index] = (sent[index] ?? 0) + 1),
          sendAudioStreamEnd: () => undefined,
          sendFrame: () => undefined,
          sendToolResponses: () => undefined,
          sendNotice: () => undefined,
          close: () => undefined,
        }
        return live
      },
      apiKey: 'fake',
      model: 'gemini-3.8-live',
      guide: loadMissionGuide(DECLARED_NAMES),
      bridgeInstanceId: 'bridge-bound',
      now: Date.now,
      log: (event, detail) => logs.push([event, detail ?? {}]),
      every: () => () => undefined,
      voiceEvidence: true,
      evidenceRetryMs: [0, 0],
      reserveRetryMs: [0, 0],
    })
    const stops = () => logs.filter(([event]) => event === 'qualification.stopped').map(([, d]) => d.why)
    /** The session stopped itself (a refusal), or the API's answer to a receipt said the exchange ended. */
    const done = () => stops().length > 0 || logs.some(([event]) => event === 'qualification.exchange_ended')
    const dropped = () => logs.filter(([event]) => event === 'evidence.dropped').map(([, d]) => d)
    const speak = () => roomEvents.at(-1)?.audio(P, new Int16Array(1600).fill(2000), 16000, 1)
    return { bridge, assigned, roomEvents, lives, sent, stops, done, dropped, taken, speak }
  }

  /** The bridge's receipts the exchange keeps, in the API's numbering: [seq, kind or provider phase, connection]. */
  const keptOf = async (exchangeId: string) =>
    (
      await owner((c) =>
        c.query<{ seq: number; kind: string; phase: string | null; connection: string | null }>(
          `SELECT seq, kind, receipt->>'phase' AS phase, receipt->>'connection' AS connection
             FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 AND source='bridge' ORDER BY seq`,
          [exchangeId],
        ),
      )
    ).rows.map((r) => [r.seq, r.phase === null ? r.kind : `provider:${r.phase}`, r.connection && Number(r.connection)])

  /** Polls the kept receipts until `check` holds; past `ms`, fails with what is kept. */
  async function untilKept(
    exchangeId: string,
    what: string,
    check: (kept: Array<Array<number | string | null>>) => boolean,
    ms = 8000,
  ) {
    const deadline = Date.now() + ms
    for (;;) {
      const kept = await keptOf(exchangeId)
      if (check(kept)) return kept
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: kept ${JSON.stringify(kept)}`)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  const endedOf = async (exchangeId: string) =>
    (
      await owner((c) =>
        c.query<{ state: string; reason: string | null; connections: number }>(
          `SELECT e.state, q.ended_reason AS reason, q.connections_opened AS connections FROM sophia.room_exchanges e
            JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id WHERE e.id=$1`,
          [exchangeId],
        ),
      )
    ).rows[0]

  it('a lost room replaced on the same exchange opens no connection past the grant’s, and the exchange ends', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 1 })
    const exchangeId = await open(projectId)
    const h = await bridgeOn(exchangeId)
    await h.bridge.apply([h.assigned])
    await until('the first connection', () => h.lives.length === 1)
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await until('the room lost', () => h.bridge.session(exchangeId)?.lost === true)
    await h.bridge.apply([h.assigned])
    await until('the replacement stopped', () => h.stops().length > 0)
    assert.equal(h.roomEvents.length, 2, 'the replacement joined the room')
    assert.equal(h.lives.length, 1, 'and opened no second provider connection')
    assert.deepEqual(h.stops(), ['connections'])
    assert.deepEqual(await endedOf(exchangeId), { state: 'ended', reason: 'connections', connections: 1 })
    await h.bridge.stop()
  })

  it('a bridge process started again on the same exchange opens no connection past the grant’s', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 1 })
    const exchangeId = await open(projectId)
    const first = await bridgeOn(exchangeId)
    await first.bridge.apply([first.assigned])
    await until('the first connection', () => first.lives.length === 1)
    await first.bridge.stop()
    const restarted = await bridgeOn(exchangeId)
    await restarted.bridge.apply([restarted.assigned])
    await until('the restarted process stopped', () => restarted.stops().length > 0)
    assert.equal(restarted.lives.length, 0)
    assert.deepEqual(restarted.stops(), ['connections'])
    assert.deepEqual(await endedOf(exchangeId), { state: 'ended', reason: 'connections', connections: 1 })
    await restarted.bridge.stop()
  })

  it('a replacing session gets no more generations than the exchange has left', async () => {
    const { projectId } = await project()
    await grant(projectId, { turns: 3 })
    const exchangeId = await open(projectId)
    const h = await bridgeOn(exchangeId)
    const speak = () => h.roomEvents.at(-1)?.audio(P, new Int16Array(1600).fill(2000), 16000, 1)
    await h.bridge.apply([h.assigned])
    await until('the first connection', () => h.lives.length === 1)
    h.lives[0]?.setupComplete()
    speak()
    await until('its input went on', () => h.sent[0] === 1)
    h.lives[0]?.turnComplete()
    speak()
    await until('the next turn’s input went on', () => h.sent[0] === 2)
    h.lives[0]?.turnComplete()
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await until('the room lost', () => h.bridge.session(exchangeId)?.lost === true)
    await h.bridge.apply([h.assigned])
    await until('the replacement connected', () => h.lives.length === 2)
    h.lives[1]?.setupComplete()
    speak()
    await until('its one generation', () => h.sent[1] === 1)
    h.lives[1]?.turnComplete()
    speak()
    // At its turns the exchange ends: the guard does it on the replacement's next receipt, or the next reservation is
    // refused, whichever comes first.
    await until('the replacement stopped', () => h.done())
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(h.sent[1], 1, 'the exchange had three generations; the replacement got the one that was left')
    assert.equal((await endedOf(exchangeId))?.reason, 'turns')
    await h.bridge.stop()
  })

  it('a bridge process started again on the same exchange numbers on from the API’s counter: connection 2’s ready is kept beside connection 1’s, and nothing before it changes (Codex P1 r4232908444, root’s sequence)', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 3 })
    const exchangeId = await open(projectId)
    const first = await bridgeOn(exchangeId)
    await first.bridge.apply([first.assigned])
    await until('the first connection', () => first.lives.length === 1)
    first.lives[0]?.setupComplete()
    await untilKept(exchangeId, 'connection 1 ready', (kept) => readies(kept).length === 1)
    await first.bridge.stop()
    const firstKept = await keptOf(exchangeId)
    const restarted = await bridgeOn(exchangeId)
    await restarted.bridge.apply([restarted.assigned])
    await until('the restarted process’s connection', () => restarted.lives.length === 1)
    restarted.lives[0]?.setupComplete()
    const kept = await untilKept(exchangeId, 'connection 2 ready', (k) => readies(k).length === 2)
    await restarted.bridge.stop()
    const allKept = await keptOf(exchangeId)
    assert.deepEqual(readies(kept), [1, 2], 'both connections’ ready')
    assert.deepEqual(allKept.slice(0, firstKept.length), firstKept, 'the first process’s receipts as they were')
    assert.deepEqual(
      allKept.map(([seq]) => seq),
      dense(allKept.length),
      'one number each, from 1, none twice',
    )
    assert.deepEqual([first.dropped(), restarted.dropped()], [[], []], 'nothing dropped, before the restart or after')
    assert.deepEqual(
      restarted.taken.map(([, seq]) => seq),
      dense(allKept.length).slice(firstKept.length),
      'the restarted process took the numbers after the first’s',
    )
  })

  it('a lost room replaced in the same process keeps connection 1’s ready and connection 2’s (control)', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 3 })
    const exchangeId = await open(projectId)
    const h = await bridgeOn(exchangeId)
    await h.bridge.apply([h.assigned])
    await until('the first connection', () => h.lives.length === 1)
    h.lives[0]?.setupComplete()
    await untilKept(exchangeId, 'connection 1 ready', (kept) => readies(kept).length === 1)
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await until('the room lost', () => h.bridge.session(exchangeId)?.lost === true)
    await h.bridge.apply([h.assigned])
    await until('the replacement connected', () => h.lives.length === 2)
    h.lives[1]?.setupComplete()
    await untilKept(exchangeId, 'connection 2 ready', (kept) => readies(kept).length === 2)
    await h.bridge.stop()
    const kept = await keptOf(exchangeId)
    assert.deepEqual(readies(kept), [1, 2])
    assert.deepEqual(
      kept.map(([seq]) => seq),
      dense(kept.length),
    )
    assert.deepEqual(h.dropped(), [])
  })

  it('two processes on one exchange at once (a deploy’s overlap), their inputs reserving beside each other’s receipts: every receipt kept, one number each, in the order the API took them, no deadlock', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 3 })
    const exchangeId = await open(projectId)
    const [a, b] = [await bridgeOn(exchangeId), await bridgeOn(exchangeId)]
    await Promise.all([a.bridge.apply([a.assigned]), b.bridge.apply([b.assigned])])
    await until('both connected', () => a.lives.length === 1 && b.lives.length === 1)
    a.lives[0]?.setupComplete()
    b.lives[0]?.setupComplete()
    for (let turn = 1; turn <= 3; turn += 1) {
      a.speak()
      b.speak()
      await until(`turn ${String(turn)}’s inputs went on`, () => a.sent[0] === turn && b.sent[0] === turn)
      a.lives[0]?.turnComplete()
      b.lives[0]?.turnComplete()
    }
    await Promise.all([a.bridge.stop(), b.bridge.stop()])
    const kept = await keptOf(exchangeId)
    assert.deepEqual(
      kept.map(([seq]) => seq),
      dense(kept.length),
      'one number each, from 1, none twice',
    )
    assert.deepEqual([a.dropped(), b.dropped()], [[], []], 'nothing refused or dropped')
    assert.equal(a.taken.length + b.taken.length, kept.length, 'every receipt either process sent is kept')
    assert.deepEqual(
      [...a.taken, ...b.taken].map(([, seq]) => seq).toSorted((x, y) => x - y),
      dense(kept.length),
    )
    for (const { taken } of [a, b])
      assert.ok(
        taken.every(([, seq], i) => i === 0 || seq > (taken[i - 1]?.[1] ?? 0)),
        'each process’s own numbers increase',
      )
    assert.deepEqual(
      readies(kept).toSorted((x, y) => Number(x) - Number(y)),
      [1, 2],
    )
    assert.equal(kept.filter(([, kind]) => kind === 'input_window').length, 6, 'each process’s three inputs')
  })

  it('the real bridge, its first receipt’s answer lost on the way: sent again under the same identity, answered with its own number, kept once (Codex P1 r4232908444)', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 3 })
    const exchangeId = await open(projectId)
    const api = await baseUrl()
    // A relay in front of the real API: every request goes through; the first receipt's answer is held back, as a lost
    // answer is (it committed). Every write's identity and the API's answer to it are kept in the order they came.
    const writes: Array<[string, string]> = []
    let held: http.ServerResponse | null = null
    const relay = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
      req.on('end', () => {
        void fetch(`${api}${req.url ?? ''}`, {
          method: req.method ?? 'GET',
          headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
          ...(req.method === 'POST' ? { body } : {}),
        }).then(async (answered) => {
          const text = await answered.text()
          if (req.url === '/v1/media/evidence-writes') {
            writes.push([(JSON.parse(body) as MediaEvidenceWrite).writeId, text])
            if (writes.length === 1) {
              held = res
              return
            }
          }
          res.writeHead(answered.status, { 'content-type': 'application/json' })
          res.end(text)
        })
      })
    })
    await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve))
    const address = relay.address()
    assert.ok(address !== null && typeof address === 'object')
    const h = await bridgeOn(exchangeId, `http://127.0.0.1:${String(address.port)}`)
    try {
      await h.bridge.apply([h.assigned])
      await until('the first connection', () => h.lives.length === 1)
      h.lives[0]?.setupComplete()
      await untilKept(exchangeId, 'connection 1 ready', (kept) => readies(kept).length === 1, 15_000)
      await h.bridge.stop()
      const kept = await keptOf(exchangeId)
      const [first, again] = writes
      assert.ok(first && again)
      assert.equal(again[0], first[0], 'the same identity again, after its answer was lost')
      assert.deepEqual(JSON.parse(first[1]), { seq: 1, replayed: false, ended: false, reason: null }, 'it committed')
      assert.deepEqual(JSON.parse(again[1]), { seq: 1, replayed: true, ended: false, reason: null })
      assert.equal(kept.filter(([, kind]) => kind === 'provider:setup').length, 1, 'kept once')
      assert.deepEqual(
        kept.map(([seq]) => seq),
        dense(kept.length),
      )
      assert.deepEqual(h.taken[0], [first[0], 1])
      assert.deepEqual(h.dropped(), [])
    } finally {
      ;(held as http.ServerResponse | null)?.destroy()
      relay.closeAllConnections()
      await new Promise((resolve) => relay.close(resolve))
    }
  })

  it('a process whose first connection is refused: its session_closed is kept at the exchange’s next number', async () => {
    const { projectId } = await project()
    await grant(projectId, { connections: 1 })
    const exchangeId = await open(projectId)
    const first = await bridgeOn(exchangeId)
    await first.bridge.apply([first.assigned])
    await until('the first connection', () => first.lives.length === 1)
    first.lives[0]?.setupComplete()
    await untilKept(exchangeId, 'connection 1 ready', (kept) => readies(kept).length === 1)
    await first.bridge.stop()
    const firstKept = await keptOf(exchangeId)
    const restarted = await bridgeOn(exchangeId)
    await restarted.bridge.apply([restarted.assigned])
    await until('the restarted process stopped', () => restarted.stops().length > 0)
    await restarted.bridge.stop()
    const allKept = await keptOf(exchangeId)
    assert.equal(restarted.lives.length, 0, 'no connection')
    assert.deepEqual(allKept.slice(0, firstKept.length), firstKept)
    assert.deepEqual(allKept.slice(firstKept.length), [[firstKept.length + 1, 'session_closed', null]])
    assert.deepEqual(restarted.dropped(), [])
  })
})

describe('a receipt sent again after its answer was lost gets the same answer from the API (Codex r4235355799)', () => {
  it('the first attempt commits, its answer is held back and the bridge gives it up; the same identity and body again: its own number, replayed, one receipt kept', async () => {
    const { projectId } = await project()
    const grantId = await grant(projectId)
    const exchangeId = await open(projectId)
    const api = await baseUrl()
    // A relay in front of the real API: the first write goes through (it commits) and its answer is held back, as a
    // lost answer is; every later request is relayed as it is.
    const acks: string[] = []
    let held: http.ServerResponse | null = null
    const relay = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
      req.on('end', () => {
        void fetch(`${api}${req.url ?? ''}`, {
          method: req.method ?? 'POST',
          headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
          body,
        }).then(async (answered) => {
          const text = await answered.text()
          acks.push(text)
          if (acks.length === 1) {
            held = res
            return
          }
          res.writeHead(answered.status, { 'content-type': 'application/json' })
          res.end(text)
        })
      })
    })
    await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve))
    const address = relay.address()
    assert.ok(address !== null && typeof address === 'object')
    const service = httpMediaService(`http://127.0.0.1:${String(address.port)}`, MEDIA_TOKEN)
    const evidence: MediaEvidenceWrite = {
      exchangeId,
      grantId,
      writeId: randomUUID(),
      receipt: {
        kind: 'session_closed',
        schema: 'sophia.bridge.voice_qualification.v1',
        grantId,
        runBindingSha256: RUN,
        atMs: Date.now(),
        providerClosed: true,
        windows: 0,
        turns: 0,
        replies: 0,
        toolCalls: 0,
        typedMessages: 0,
        transcriptRetained: false,
        reason: 'ended',
      },
    }
    try {
      // The bridge's attempt, bounded as EvidenceSender bounds it: given up, never answered.
      const attempt = new AbortController()
      const timer = setTimeout(() => attempt.abort(new Error('no answer in time')), 1000)
      const first = await Promise.race([
        service.recordEvidence(evidence, attempt.signal).then(
          () => 'answered',
          () => 'given up',
        ),
        new Promise<'stuck'>((resolve) => setTimeout(() => resolve('stuck'), 5000)),
      ])
      clearTimeout(timer)
      assert.equal(first, 'given up', 'the bridge gave the first attempt up')
      assert.equal(acks.length, 1, 'the API answered it: it committed')
      const again = await service.recordEvidence(evidence)
      assert.deepEqual(
        again,
        { ...(JSON.parse(acks[0] ?? 'null') as object), replayed: true },
        'the first’s ack, said to be a repeat',
      )
      assert.deepEqual(again, { seq: 1, replayed: true, ended: false, reason: null })
      const next = await service.recordEvidence({ ...evidence, writeId: randomUUID() })
      assert.equal(next.seq, 2, 'the next write the next number: the repeat spent none')
      const kept = await owner((c) =>
        c.query<{ receipt: unknown }>(
          `SELECT receipt FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 AND source='bridge' AND seq=1`,
          [exchangeId],
        ),
      )
      assert.equal(kept.rows.length, 1, 'kept once')
      assert.deepEqual(kept.rows[0]?.receipt, evidence.receipt, 'as it was sent')
      const writes = await owner((c) =>
        c.query<{ seq: number }>(`SELECT seq FROM sophia.voice_evidence_writes WHERE exchange_id=$1 AND write_id=$2`, [
          exchangeId,
          evidence.writeId,
        ]),
      )
      assert.deepEqual(
        writes.rows.map((r) => r.seq),
        [1],
        'its identity, once',
      )
    } finally {
      ;(held as http.ServerResponse | null)?.destroy()
      relay.closeAllConnections()
      await new Promise((resolve) => relay.close(resolve))
    }
  })
})
