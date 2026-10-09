// Voice qualification evidence through the API (A15, migration 0046; docs/plans/voice-qualification-g7.md), level:
// sql-run. The bridge's receipts, the principal's read, the grant on the assignment and the room token, and the guard
// on the presence and assignment paths. LiveKit is unreachable here: room tokens are signed locally. The last case
// runs the media bridge's own session (RoomSession, its HTTP client) against this API, with LABELLED FAKES for LiveKit
// and Gemini Live: it proves the bridge's receipts cross the real contract, not that a model or a room heard anything.
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { MediaEvidenceWrite } from '@sophia/contracts'
import {
  DECLARED_NAMES,
  httpMediaService,
  loadMissionGuide,
  RoomSession,
  type LiveEvents,
  type LiveLink,
  type RoomEvents,
  type RoomLink,
} from '@sophia/media-bridge'
import {
  admitNativeTask,
  createPool,
  liveCallAdmits,
  readSnapshot,
  recordLiveCall,
  startExchange,
  submitContribution,
  withActor,
  withService,
} from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
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
    await owner((c) =>
      c.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId]),
    )
    const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A })
    const headers = {
      authorization: `Bearer ${rt.token}`,
      'x-sophia-runtime-unit': rt.runtimeUnitId,
      'x-sophia-bridge-instance': randomUUID(),
      'x-sophia-bridge-protocol': '1',
    }
    const roles = [{ id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }]
    const hello = await app.inject({
      method: 'POST',
      url: '/v1/runtime/hello',
      headers,
      payload: { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles },
    })
    assert.equal(hello.statusCode, 200, hello.body)
    const ready = await app.inject({
      method: 'POST',
      url: '/v1/runtime/ready',
      headers,
      payload: { state: 'ready', reason: null, unrecovered: [] },
    })
    assert.equal(ready.statusCode, 204, ready.body)
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
    const base = await app.listen({ host: '127.0.0.1', port: 0 })
    const service = httpMediaService(base, MEDIA_TOKEN)
    const batch = await service.assignments(null, 0, new AbortController().signal)
    const assignment = batch.assignments.find((a) => a.exchangeId === exchangeId)
    assert.ok(assignment?.qualification, 'the assignment names the grant')
    assert.equal(assignment.inputActorId, P, 'the principal opened it, and holds the floor')
    let roomEvents: RoomEvents | undefined
    let liveEvents: LiveEvents | undefined
    let closed = 0
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
          sendAudio: () => undefined,
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
