// The grant's bound is the exchange's, not a bridge session's (A15, 0046): the real MediaBridge, with LABELLED FAKES for
// LiveKit and Gemini Live, against a FAKE of the API's durable reservations (FakeLedger, the rules media_voice_reserve
// holds; voice-qualification.db.test.ts runs the same against the real API and PostgreSQL). A lost room replaced on the
// same exchange, or a bridge process started again, reserves against what the exchange already spent.
import type {
  MediaAssignment,
  MediaEvidenceWrite,
  MediaQualificationReservation,
  MediaQualificationReserve,
  VoiceQualification,
} from '@sophia/contracts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MediaBridge } from './bridge.ts'
import { loadMissionGuide } from './guide.ts'
import type { LiveEvents, LiveLink } from './live-session.ts'
import type { RoomEvents, RoomLink } from './rtc.ts'
import { type MediaService, ServiceError } from './service.ts'
import { DECLARED_NAMES } from './tools.ts'

const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LUIS = '11111111-1111-4111-8111-111111111111'
const grant = (over: Partial<VoiceQualification> = {}): VoiceQualification => ({
  grantId: '77777777-7777-4777-8777-777777777777',
  runBindingSha256: 'ab'.repeat(32),
  principalActorId: LUIS,
  deadline: new Date(Date.now() + 900_000).toISOString(),
  maxProviderConnections: 3,
  maxTurns: 20,
  maxOutputTokensPerTurn: 1000,
  maxUsageTokens: 200_000,
  ...over,
})
const assignment = (qualification: VoiceQualification): MediaAssignment => ({
  exchangeId: E1,
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  state: 'open',
  pauseReason: null,
  inputEpoch: 1,
  inputActorId: LUIS,
  playbackEpoch: 1,
  observationEpoch: 1,
  allowVision: false,
  looking: null,
  roomRevision: 1,
  quiesceRequestId: null,
  roomToken: { serverUrl: 'ws://fake', token: 't', expiresAt: '2026-09-25T00:10:00Z' },
  results: [],
  missionRevision: 1,
  ledgerRevision: 1,
  eligibilityRevision: 1,
  qualification,
})

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve))
}
const chunk = () => new Int16Array(1600).fill(2000)

type Stop = NonNullable<MediaQualificationReservation['stop']>

/**
 * A FAKE of the API's durable bound for one grant: connections and generations counted per exchange, each generation
 * charged, a reservation that does not fit refused and the exchange ended; an ended exchange is refused (409).
 */
class FakeLedger {
  readonly grant: VoiceQualification
  readonly asked: MediaQualificationReserve[] = []
  readonly exchanges = new Map<string, { connections: number; turns: number; charged: number; ended: Stop | null }>()

  constructor(qualification: VoiceQualification) {
    this.grant = qualification
  }

  reserve = async (r: MediaQualificationReserve): Promise<MediaQualificationReservation> => {
    await Promise.resolve()
    this.asked.push(r)
    const x = this.exchanges.get(r.exchangeId) ?? { connections: 0, turns: 0, charged: 0, ended: null }
    this.exchanges.set(r.exchangeId, x)
    if (x.ended) throw new ServiceError(409, 'POST /v1/media/qualification-reserve: 409 invalid_state')
    const stop = this.#stop(x, r)
    if (stop) {
      x.ended = stop
      return { ok: false, ordinal: null, stop, ended: true }
    }
    if (r.kind === 'connection') x.connections += 1
    else {
      x.turns += 1
      x.charged += r.charge ?? 0
    }
    return {
      ok: true,
      ordinal: r.kind === 'connection' ? x.connections : (r.ordinal ?? null),
      stop: null,
      ended: false,
    }
  }

  #stop(x: { connections: number; turns: number; charged: number }, r: MediaQualificationReserve): Stop | null {
    const g = this.grant
    const charge = r.charge ?? 0
    if (r.kind === 'unasked') {
      x.turns += 1
      x.charged += charge
      if (x.turns >= g.maxTurns) return 'turns'
      return x.charged > g.maxUsageTokens ? 'usage' : null
    }
    if (x.turns >= g.maxTurns) return 'turns'
    if (r.kind === 'connection') return x.connections + 1 > g.maxProviderConnections ? 'connections' : null
    return x.charged + charge > g.maxUsageTokens ? 'usage' : null
  }
}

/** One bridge process: LiveKit and Gemini Live are labelled fakes; the API is the ledger, and keeps the receipts. */
function harness(ledger: FakeLedger) {
  const evidence: MediaEvidenceWrite[] = []
  const roomEvents: RoomEvents[] = []
  const lives: Array<{ events: LiveEvents; audio: number }> = []
  const logs: Array<[string, Record<string, unknown>]> = []
  const service: MediaService = {
    assignments: () => Promise.reject(new Error('unused')),
    presence: () => Promise.resolve(),
    ackQuiesce: () => Promise.resolve(),
    holder: () => Promise.resolve(),
    announced: () => Promise.resolve(),
    toolCall: () => Promise.reject(new Error('unused')),
    toolSurface: () => Promise.resolve({ names: [...DECLARED_NAMES] }),
    recordEvidence: (write) => {
      evidence.push(write)
      return Promise.resolve({ ended: false, reason: null })
    },
    reserveQualification: (reserve) => ledger.reserve(reserve),
  }
  const bridge = new MediaBridge({
    service,
    joinRoom: async (_access, events) => {
      await Promise.resolve()
      roomEvents.push(events)
      const room: RoomLink = {
        people: () => [{ identity: LUIS, standing: 'editor' }],
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
      const entry = { events, audio: 0 }
      lives.push(entry)
      const live: LiveLink = {
        sendAudio: () => void (entry.audio += 1),
        sendAudioStreamEnd: () => undefined,
        sendFrame: () => undefined,
        sendToolResponses: () => undefined,
        sendNotice: () => undefined,
        close: () => undefined,
      }
      return live
    },
    apiKey: 'fake',
    model: 'fake',
    guide: loadMissionGuide(DECLARED_NAMES),
    bridgeInstanceId: 'bound',
    now: Date.now,
    log: (event, detail) => logs.push([event, detail ?? {}]),
    every: () => () => undefined,
    voiceEvidence: true,
    evidenceRetryMs: [0, 0],
    reserveRetryMs: [0, 0],
  })
  const stops = () => logs.filter(([event]) => event === 'qualification.stopped').map(([, d]) => d.why)
  return { bridge, evidence, roomEvents, lives, stops }
}

/** The principal speaks and Sophia's turn completes: one generation on the live connection. */
async function turn(h: ReturnType<typeof harness>, live: number): Promise<void> {
  h.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
  await settle()
  h.lives[live]?.events.turnComplete()
  await settle()
}

describe('the grant’s bound is the exchange’s, across sessions and bridge processes (A15, 0046)', () => {
  it('a lost room replaced on the same exchange opens no connection past the grant’s, and the exchange ends', async () => {
    const ledger = new FakeLedger(grant({ maxProviderConnections: 1 }))
    const h = harness(ledger)
    const assigned = assignment(ledger.grant)
    await h.bridge.apply([assigned])
    await settle()
    assert.equal(h.lives.length, 1)
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await h.bridge.apply([assigned])
    await settle()
    assert.equal(h.roomEvents.length, 2, 'the replacement joined the room')
    assert.equal(h.lives.length, 1, 'and opened no second provider connection')
    assert.deepEqual(h.stops(), ['connections'])
    assert.equal(ledger.exchanges.get(E1)?.ended, 'connections', 'the refusal ended the exchange')
    await h.bridge.stop()
  })

  it('a bridge process started again on the same exchange gets no more connections than remain', async () => {
    const ledger = new FakeLedger(grant({ maxProviderConnections: 1 }))
    const first = harness(ledger)
    const assigned = assignment(ledger.grant)
    await first.bridge.apply([assigned])
    await settle()
    assert.equal(first.lives.length, 1)
    await first.bridge.stop()
    const restarted = harness(ledger)
    await restarted.bridge.apply([assigned])
    await settle()
    assert.equal(restarted.lives.length, 0, 'the restarted process opens nothing: the exchange had its one')
    assert.deepEqual(restarted.stops(), ['connections'])
    await restarted.bridge.stop()
  })

  it('a replacing session gets no more generations than the exchange has left', async () => {
    const ledger = new FakeLedger(grant({ maxTurns: 3 }))
    const h = harness(ledger)
    const assigned = assignment(ledger.grant)
    await h.bridge.apply([assigned])
    await settle()
    h.lives[0]?.events.setupComplete()
    await turn(h, 0)
    await turn(h, 0)
    assert.equal(h.lives[0]?.audio, 2)
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await h.bridge.apply([assigned])
    await settle()
    h.lives[1]?.events.setupComplete()
    await turn(h, 1)
    h.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    assert.equal(h.lives[1]?.audio, 1, 'one generation was left, and only one was spent')
    assert.deepEqual(h.stops(), ['turns'])
    assert.equal(ledger.exchanges.get(E1)?.ended, 'turns')
    await h.bridge.stop()
  })

  it('a replacing session gets no more of the budget than the exchange has left', async () => {
    // Each generation is charged about 27,000 (the context again and its output twice): two fit in 60,000, not three.
    const ledger = new FakeLedger(grant({ maxUsageTokens: 60_000 }))
    const h = harness(ledger)
    const assigned = assignment(ledger.grant)
    await h.bridge.apply([assigned])
    await settle()
    h.lives[0]?.events.setupComplete()
    await turn(h, 0)
    await turn(h, 0)
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await h.bridge.apply([assigned])
    await settle()
    h.lives[1]?.events.setupComplete()
    h.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    assert.equal(h.lives[1]?.audio, 0, 'the third generation would pass the budget: none of its input is sent')
    assert.deepEqual(h.stops(), ['usage'])
    assert.equal(ledger.exchanges.get(E1)?.ended, 'usage')
    await h.bridge.stop()
  })
})
