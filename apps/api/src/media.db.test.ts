// S1-05A crossing (level: sql-run): the media bridge's real logic (MediaBridge, RoomSession, its HTTP client)
// against the real API and PostgreSQL. LiveKit and Gemini Live are LABELLED FAKES here (FakeRoom, FakeLive):
// this proves the bridge↔API contract, speaker binding, roles, guest quiescence and holder departure. It is
// not a live model or media test and does not count toward A04/A05 acceptance.
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Snapshot } from '@sophia/contracts'
import {
  parseContributionReceipt,
  parseInvitation,
  parseLobbyEntry,
  parseRoomToken,
  parseSnapshot,
} from '@sophia/contracts/validate'
import {
  httpMediaService,
  MediaBridge,
  type LiveEvents,
  type LiveLink,
  type RoomEvents,
  type RoomLink,
  type RoomPerson,
} from '@sophia/media-bridge'
import { createPool } from '@sophia/persistence'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  type SeededProject,
  type TestDatabase,
} from '@sophia/test-support'
import { reconcileRemovalsOnce } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-tests-0123456789'
const INVITES = { secret: 'invite-test-secret-at-least-32-characters!!', studioUrl: 'https://studio.test' }
/** A LiveKit server nobody runs: presence cannot be read, so every presence-dependent path must fail closed. */
const UNREACHABLE_LIVEKIT = {
  url: 'ws://127.0.0.1:9',
  apiKey: 'devkey',
  apiSecret: 'livekit-test-secret-at-least-32-bytes!!',
}
const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer

let db: TestDatabase
let pool: pg.Pool
/** The migration owner, to read what the bridge reported (RLS hides it from a caller with no actor). */
let owner: pg.Pool
/** No LiveKit configured: exchanges open without a presence check (there is no room to hold a guest). */
let app: FastifyInstance
/** LiveKit configured but unreachable: room tokens are signed locally; presence reads fail. */
let voiced: FastifyInstance
/** An API whose LiveKit server answers: the room is member-only (a fake of the room service's participant list). */
let present: FastifyInstance
let presence: Server
let base: string
let voicedBase: string
let presentBase: string
let seed: SeededProject

const token = (sub: string, claims: Record<string, unknown> = {}) =>
  new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any
type FunctionResponse = Parameters<LiveLink['sendToolResponses']>[0][number]

async function call(
  path: string,
  init: { method?: string; bearer?: string; body?: unknown; key?: boolean; at?: string } = {},
) {
  const res = await fetch(`${init.at ?? base}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': randomUUID() } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

const snapshot = async (actor = A): Promise<Snapshot> =>
  parseSnapshot((await call(`/api/v1/projects/${seed.projectId}/snapshot`, { bearer: await token(actor) })).json)

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** FAKE LiveKit room: people are whoever the test says; everything Sophia would publish is recorded. */
class FakeRoom implements RoomLink {
  events: RoomEvents
  present: RoomPerson[] = [
    { identity: E, standing: 'editor' },
    { identity: V, standing: 'viewer' },
  ]
  clears = 0
  constructor(events: RoomEvents) {
    this.events = events
  }
  people = () => this.present
  play = () => Promise.resolve()
  clearPlayback = () => {
    this.clears += 1
  }
  watch = () => undefined
  setState = () => Promise.resolve()
  close = () => Promise.resolve()
  set(people: RoomPerson[]): void {
    this.present = people
    this.events.people(people)
  }
}

/** FAKE Gemini Live connection. */
class FakeLive implements LiveLink {
  events: LiveEvents
  audio = 0
  responses: FunctionResponse[] = []
  constructor(events: LiveEvents) {
    this.events = events
  }
  sendAudio = () => {
    this.audio += 1
  }
  sendAudioStreamEnd = () => undefined
  sendFrame = () => undefined
  sendToolResponses = (r: FunctionResponse[]) => {
    this.responses.push(...r)
  }
  sendNotice = () => undefined
  close = () => undefined
}

let offset = 0
const rooms: FakeRoom[] = []
const lives: FakeLive[] = []
let bridge: MediaBridge
let running: Promise<void>

const outputOf = (r: FunctionResponse | undefined): Record<string, unknown> => {
  const output: unknown = r?.response?.output
  return typeof output === 'object' && output !== null ? { ...output } : {}
}

async function ask(live: FakeLive, id: string, name: string, args: Record<string, unknown>) {
  live.events.toolCalls([{ id, name, args }])
  await until(`an answer to ${id}`, () => live.responses.some((r) => r.id === id))
  return outputOf(live.responses.find((r) => r.id === id))
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 8 })
  owner = createPool(db.ownerUrl, { max: 2 })
  seed = await seedProject(db.ownerUrl, { title: 'Founders', admin: A, editors: [E], viewers: [V] })
  await registerRuntime(db.ownerUrl, { projectId: seed.projectId, admin: A })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, invites: INVITES })
  voiced = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, invites: INVITES, livekit: UNREACHABLE_LIVEKIT })
  presence = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(req.url?.endsWith('/ListParticipants') ? JSON.stringify({ participants: [] }) : '{}')
    })
  })
  await new Promise<void>((resolve) => presence.listen(0, '127.0.0.1', resolve))
  const livekit = { ...UNREACHABLE_LIVEKIT, url: `ws://127.0.0.1:${(presence.address() as AddressInfo).port}` }
  present = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, invites: INVITES, livekit })
  await app.listen({ port: 0, host: '127.0.0.1' })
  await voiced.listen({ port: 0, host: '127.0.0.1' })
  await present.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  voicedBase = `http://127.0.0.1:${(voiced.server.address() as AddressInfo).port}`
  presentBase = `http://127.0.0.1:${(present.server.address() as AddressInfo).port}`
})

after(async () => {
  await bridge?.stop()
  await running
  await app?.close()
  await voiced?.close()
  await present?.close()
  await new Promise((resolve) => presence?.close(resolve))
  await pool?.end()
  await owner?.end()
  await db?.drop()
})

describe('media routes: the bridge capability and nothing else (amendment A06)', () => {
  it('refuse no bearer, a member’s token and a wrong capability; a member route refuses the capability', async () => {
    const path = '/v1/media/assignments?waitMs=0'
    assert.equal((await call(path)).status, 401)
    assert.equal((await call(path, { bearer: await token(A) })).json.code, 'media_capability_required')
    assert.equal((await call(path, { bearer: 'x'.repeat(48) })).status, 401)
    assert.equal((await call(path, { bearer: MEDIA_TOKEN })).status, 200)
    assert.equal((await call(`/api/v1/projects/${seed.projectId}/snapshot`, { bearer: MEDIA_TOKEN })).status, 401)
  })

  it('an exchange does not open when the room’s trusted presence cannot be read, or the room service is not set up', async () => {
    const snap = await snapshot()
    const open = async (at: string) =>
      call(`/api/v1/rooms/${snap.room.id}/exchanges`, {
        at,
        bearer: await token(E),
        key: true,
        body: { expectedRoomRevision: snap.room.revision, allowVision: false },
      })
    assert.equal((await open(voicedBase)).status, 503, 'LiveKit unreachable')
    assert.equal((await open(base)).status, 503, 'no LiveKit configured: nobody can say who is listening')
  })
})

describe('the bridge against the real API (fake LiveKit and Google)', () => {
  let exchangeId: string
  let room: FakeRoom
  let live: FakeLive
  let contributionId: string

  it('opens an exchange; the bridge joins, and the snapshot shows what the bridge observes', async () => {
    const said = await call(`/api/v1/projects/${seed.projectId}/contributions`, {
      bearer: await token(E),
      key: true,
      body: { source: null, text: 'Start with the room.', threadId: null, artifactVersionId: null, intent: 'discuss' },
    })
    contributionId = parseContributionReceipt(said.json).contributionId
    const snap = await snapshot()
    assert.equal(snap.room.sophia.voice, 'not_connected')
    const opened = await call(`/api/v1/rooms/${snap.room.id}/exchanges`, {
      at: presentBase,
      bearer: await token(E),
      key: true,
      body: { expectedRoomRevision: snap.room.revision, allowVision: true },
    })
    assert.equal(opened.status, 201)
    exchangeId = opened.json.exchangeId

    bridge = new MediaBridge({
      // The bridge polls the voiced API: its assignments carry signed room tokens.
      service: httpMediaService(voicedBase, MEDIA_TOKEN),
      joinRoom: async (_access, events) => {
        await Promise.resolve()
        const r = new FakeRoom(events)
        rooms.push(r)
        return r
      },
      connectLive: async (_options, events) => {
        await Promise.resolve()
        const l = new FakeLive(events)
        lives.push(l)
        return l
      },
      apiKey: 'fake',
      model: 'fake',
      bridgeInstanceId: 'bridge-crossing',
      now: () => Date.now() + offset,
      log: () => undefined,
    })
    running = bridge.run()
    await until('the bridge joined and connected', () => rooms.length === 1 && lives.length === 1)
    room = rooms[0] as FakeRoom
    live = lives[0] as FakeLive
    assert.equal((await snapshot()).room.sophia.voice !== 'ready', true, 'not ready before Google is')
    live.events.setupComplete()
    await until('voice ready in the snapshot', async () => (await snapshot()).room.sophia.voice === 'ready')
    const sophia = (await snapshot(V)).room.sophia
    assert.deepEqual([sophia.exchange, sophia.inputActorId, sophia.allowVision], ['open', E, true])
  })

  it('the holder is heard and a spoken brief request is admitted once, for the holder', async () => {
    room.events.audio(E, new Int16Array(1600), 16000, 1)
    room.events.audio(V, new Int16Array(1600), 16000, 1)
    assert.equal(live.audio, 1, 'only the holder’s audio reached Google')
    const out = await ask(live, 'call-brief-1', 'start_brief', {
      instruction: 'Draft the brief from what we agreed.',
      contributionIds: [contributionId],
    })
    assert.equal(out.status, 'admitted')
    const work = (await snapshot()).work
    assert.equal(work.length, 1)
    assert.equal(work[0]?.id, out.workId)
    assert.equal(work[0]?.actorId, E, 'attributed to the speaker the epoch binds')
    const again = await httpMediaService(base, MEDIA_TOKEN).toolCall({
      exchangeId,
      connectionGeneration: 1,
      callId: 'replayed',
      name: 'start_brief',
      args: { instruction: 'Draft it', contributionIds: [contributionId] },
      inputEpoch: 1,
      actorId: E,
    })
    const replay = await httpMediaService(base, MEDIA_TOKEN).toolCall({
      exchangeId,
      connectionGeneration: 1,
      callId: 'replayed',
      name: 'start_brief',
      args: { instruction: 'Draft it', contributionIds: [contributionId] },
      inputEpoch: 1,
      actorId: E,
    })
    assert.deepEqual(replay, again, 'a provider retry of the same call admits nothing new')
  })

  it('a speaker the epoch does not bind is asked, never acted for', async () => {
    const out = await httpMediaService(base, MEDIA_TOKEN).toolCall({
      exchangeId,
      connectionGeneration: 1,
      callId: 'unbound',
      name: 'start_brief',
      args: { instruction: 'Draft another' },
      inputEpoch: 1,
      actorId: V,
    })
    assert.equal(out.status, 'clarify')
  })

  it('Stop Speaking over HTTP reaches the bridge through the assignment poll and clears Sophia’s output', async () => {
    const clears = room.clears
    const res = await call(`/api/v1/exchanges/${exchangeId}/stop-speaking`, { bearer: await token(V), body: {} })
    assert.equal(res.status, 200)
    await until('the bridge cleared output', () => room.clears > clears)
    assert.equal((await snapshot()).work[0]?.phase !== 'stopped', true, 'work is untouched')
  })

  it('a viewer can take the floor and talk with Sophia, but cannot start work by voice', async () => {
    const snap = await snapshot()
    const moved = await call(`/api/v1/rooms/${snap.room.id}/input-floor`, {
      bearer: await token(E),
      key: true,
      body: { nextActorId: V, expectedRoomRevision: snap.room.revision },
    })
    assert.equal(moved.status, 200)
    await until('the handoff reached the bridge', () => bridge.session(exchangeId)?.observed().inputEpoch === 2)
    live.events.turnComplete()
    room.events.audio(V, new Int16Array(1600), 16000, 1)
    const status = await ask(live, 'viewer-status', 'project_status', {})
    assert.equal(status.status, 'ok')
    const admittedBefore = (await snapshot()).work.length
    const refused = await ask(live, 'viewer-brief', 'start_brief', { instruction: 'Draft one more' })
    assert.equal(refused.status, 'refused')
    assert.equal((await snapshot()).work.length, admittedBefore)
  })

  it('a guest gets a token only after the bridge confirms Sophia stopped listening and speaking (case A12)', async () => {
    const inv = parseInvitation(
      (
        await call(`/api/v1/projects/${seed.projectId}/invitations`, {
          bearer: await token(E),
          key: true,
          body: { kind: 'guest' },
        })
      ).json,
    )
    const link = { token: inv.url.split('#')[1] ?? '' }
    const G = randomUUID()
    const guest = await token(G, { is_anonymous: true })
    const entry = parseLobbyEntry(
      (await call('/api/v1/join/knock', { bearer: guest, body: { ...link, displayName: 'Ana' } })).json,
    )
    await call(`/api/v1/lobby/${entry.id}/decision`, { bearer: await token(E), body: { decision: 'admit' } })
    const clears = room.clears
    const issued = await call(`/api/v1/lobby/${entry.id}/room-token`, { at: voicedBase, bearer: guest, body: {} })
    assert.equal(issued.status, 200)
    parseRoomToken(issued.json)
    assert.ok(room.clears > clears, 'output was cleared before the token was issued')
    assert.equal(bridge.session(exchangeId)?.observed().input, 'paused')
    const sophia = (await snapshot()).room.sophia
    assert.deepEqual([sophia.exchange, sophia.pauseReason], ['paused', 'guest'])

    room.set([...room.present, { identity: G, standing: 'guest' }])
    await until('the guest reported', async () => {
      const r = await owner.query<{ g: boolean }>('SELECT guests_present AS g FROM sophia.room_ai_presence')
      return r.rows[0]?.g === true
    })
    const refused = await call(`/api/v1/exchanges/${exchangeId}/resume`, {
      at: presentBase,
      bearer: await token(E),
      body: {},
    })
    assert.equal(refused.status, 409, 'Sophia does not resume while the guest is in the room')
    room.set(room.present.filter((p) => p.identity !== G))
    await until('member-only reported', async () => {
      const r = await owner.query<{ g: boolean }>('SELECT guests_present AS g FROM sophia.room_ai_presence')
      return r.rows[0]?.g === false
    })
    // Changed by migration 0015: a token asked for in the last two minutes may still be connecting, so the room
    // reading member-only is not enough yet.
    const early = await call(`/api/v1/exchanges/${exchangeId}/resume`, {
      at: presentBase,
      bearer: await token(E),
      body: {},
    })
    assert.equal(early.status, 409, 'not while a guest who just asked for a token may still connect')
    await owner.query(
      `UPDATE sophia.room_lobby SET token_requested_at = token_requested_at - interval '121 seconds' WHERE id = $1`,
      [entry.id],
    )
    const resumed = await call(`/api/v1/exchanges/${exchangeId}/resume`, {
      at: presentBase,
      bearer: await token(E),
      body: {},
    })
    assert.equal(resumed.status, 200, 'resumed by an explicit member action')
  })

  it('without the bridge’s confirmation and with presence unreadable, a guest waits (503) instead of joining', async () => {
    await bridge.stop()
    await running
    const inv = parseInvitation(
      (
        await call(`/api/v1/projects/${seed.projectId}/invitations`, {
          bearer: await token(E),
          key: true,
          body: { kind: 'guest' },
        })
      ).json,
    )
    const guest = await token(randomUUID(), { is_anonymous: true })
    const entry = parseLobbyEntry(
      (
        await call('/api/v1/join/knock', {
          bearer: guest,
          body: { token: inv.url.split('#')[1] ?? '', displayName: 'Beto' },
        })
      ).json,
    )
    await call(`/api/v1/lobby/${entry.id}/decision`, { bearer: await token(E), body: { decision: 'admit' } })
    const res = await call(`/api/v1/lobby/${entry.id}/room-token`, { at: voicedBase, bearer: guest, body: {} })
    assert.equal(res.status, 503)
  })

  it('a guest declined while Sophia is being paused gets no token, even once she confirms', async () => {
    // The bridge stopped in the test above, so nothing acknowledges until this test does, as that bridge.
    const inv = parseInvitation(
      (
        await call(`/api/v1/projects/${seed.projectId}/invitations`, {
          bearer: await token(E),
          key: true,
          body: { kind: 'guest' },
        })
      ).json,
    )
    const guest = await token(randomUUID(), { is_anonymous: true })
    const entry = parseLobbyEntry(
      (
        await call('/api/v1/join/knock', {
          bearer: guest,
          body: { token: inv.url.split('#')[1] ?? '', displayName: 'Dora' },
        })
      ).json,
    )
    await call(`/api/v1/lobby/${entry.id}/decision`, { bearer: await token(E), body: { decision: 'admit' } })
    const waiting = call(`/api/v1/lobby/${entry.id}/room-token`, { at: voicedBase, bearer: guest, body: {} })
    let requestId = ''
    await until('the quiesce request', async () => {
      const r = await owner.query<{ id: string }>(
        'SELECT id FROM sophia.room_quiesce_requests WHERE lobby_entry_id = $1',
        [entry.id],
      )
      requestId = r.rows[0]?.id ?? ''
      return requestId !== ''
    })
    const declined = await call(`/api/v1/lobby/${entry.id}/decision`, {
      at: voicedBase,
      bearer: await token(E),
      body: { decision: 'deny' },
    })
    assert.equal(declined.status, 200)
    await httpMediaService(voicedBase, MEDIA_TOKEN).ackQuiesce({
      requestId,
      bridgeInstanceId: 'bridge-crossing',
      inputClosed: true,
      outputCleared: true,
    })
    const res = await waiting
    assert.equal(res.status, 409, 'the decision made during the wait holds')
  })
})

describe('holder departure through the real API (S1-05A §7)', () => {
  it('pauses at once when the holder leaves and clears the floor by compare-and-set after the grace', async () => {
    const snap = await snapshot()
    const exchangeId = snap.room.sophia.exchangeId
    assert.ok(exchangeId)
    // Changed by migration 0015: the guests of the tests above asked for tokens seconds ago; let that pass first.
    await owner.query(`UPDATE sophia.room_lobby SET token_requested_at = token_requested_at - interval '121 seconds'`)
    const resumed = await call(`/api/v1/exchanges/${exchangeId}/resume`, {
      at: presentBase,
      bearer: await token(E),
      body: {},
    })
    assert.equal(resumed.status, 200)
    rooms.length = 0
    lives.length = 0
    bridge = new MediaBridge({
      service: httpMediaService(voicedBase, MEDIA_TOKEN),
      joinRoom: async (_access, events) => {
        await Promise.resolve()
        const r = new FakeRoom(events)
        rooms.push(r)
        return r
      },
      connectLive: async (_options, events) => {
        await Promise.resolve()
        const l = new FakeLive(events)
        lives.push(l)
        return l
      },
      apiKey: 'fake',
      model: 'fake',
      bridgeInstanceId: 'bridge-crossing-2',
      now: () => Date.now() + offset,
      log: () => undefined,
    })
    running = bridge.run()
    await until('the bridge joined', () => rooms.length === 1 && lives.length === 1)
    const room = rooms[0] as FakeRoom
    lives[0]?.events.setupComplete()
    const holder = (await snapshot()).room.inputActorId
    assert.equal(holder, V)
    room.set(room.present.filter((p) => p.identity !== V))
    await until(
      'paused for the departed holder',
      async () => (await snapshot()).room.sophia.pauseReason === 'holder_left',
    )
    assert.equal((await snapshot()).room.inputActorId, V, 'not cleared during the grace')
    offset += 5000
    await until('the floor cleared after the grace', async () => (await snapshot()).room.inputActorId === null)
    const sophia = (await snapshot()).room.sophia
    assert.equal(sophia.exchange, 'open')
    assert.equal(sophia.inputActorId, null)
  })
})

describe('taking a declined guest out of the call (amendment A07)', () => {
  it('a failed removal is pending in the decision’s reply and the snapshot, and the worker settles it on evidence', async () => {
    const inv = parseInvitation(
      (
        await call(`/api/v1/projects/${seed.projectId}/invitations`, {
          bearer: await token(E),
          key: true,
          body: { kind: 'guest' },
        })
      ).json,
    )
    const guestId = randomUUID()
    const guest = await token(guestId, { is_anonymous: true })
    const knock = { token: inv.url.split('#')[1] ?? '', displayName: 'Cora' }
    const entry = parseLobbyEntry((await call('/api/v1/join/knock', { bearer: guest, body: knock })).json)
    await call(`/api/v1/lobby/${entry.id}/decision`, { bearer: await token(E), body: { decision: 'admit' } })
    // The API tries once at once; its LiveKit server is unreachable, so the removal is not done.
    const denied = await call(`/api/v1/lobby/${entry.id}/decision`, {
      at: voicedBase,
      bearer: await token(E),
      body: { decision: 'deny' },
    })
    assert.equal(denied.status, 200)
    const reply = parseLobbyEntry(denied.json)
    assert.equal(reply.removal?.state, 'pending')
    assert.equal(reply.removal?.attempts, 1)
    assert.ok(reply.removal?.lastError)
    assert.equal((await snapshot()).lobby.find((e) => e.id === entry.id)?.removal?.state, 'pending')
    const again = await call(`/api/v1/lobby/${entry.id}/room-token`, { at: voicedBase, bearer: guest, body: {} })
    assert.equal(again.status, 409, 'no new token after the decision')

    // The worker retries once the backoff passes, and only the server's evidence settles it.
    await owner.query(`UPDATE sophia.room_removals SET next_attempt_at = now() WHERE lobby_entry_id = $1`, [entry.id])
    const workerPool = createPool(db.workerUrl, { max: 1 })
    try {
      const asked: string[] = []
      const pass = await reconcileRemovalsOnce(
        workerPool,
        async (_roomId, identity) => {
          await Promise.resolve()
          asked.push(identity)
          return { outcome: 'removed' }
        },
        'worker-test',
      )
      assert.deepEqual(asked, [guestId])
      assert.equal(pass.settled[0]?.state, 'removed')
    } finally {
      await workerPool.end()
    }
    assert.equal((await snapshot()).lobby.find((e) => e.id === entry.id)?.removal?.state, 'removed')
  })
})
