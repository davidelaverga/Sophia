// The grant's bound is the exchange's, not a bridge session's (A15, 0046): the real MediaBridge, with LABELLED FAKES for
// LiveKit and Gemini Live, against a FAKE of the API's durable reservations (FakeLedger, the rules media_voice_reserve
// holds; voice-qualification.db.test.ts runs the same against the real API and PostgreSQL). A lost room replaced on the
// same exchange, or a bridge process started again, reserves against what the exchange already spent; and what a process
// sent was paid for on the API before it was sent, so one that dies leaves no spend unpaid (Codex P1 on PR #190).
import type {
  MediaAssignment,
  MediaEvidenceWrite,
  MediaToolCall,
  MediaQualificationReservation,
  MediaQualificationReserve,
  VoiceQualification,
} from '@sophia/contracts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MediaBridge } from './bridge.ts'
import { loadMissionGuide } from './guide.ts'
import type { LiveEvents, LiveLink } from './live-session.ts'
import { SessionQualification } from './qualification.ts'
import { ASSUMED_RATES } from './qualification-reserve.ts'
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
const assignment = (qualification: VoiceQualification, over: Partial<MediaAssignment> = {}): MediaAssignment => ({
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
  ...over,
})

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve))
}
/** `ms` of real time. */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Until `check` holds, with the timers running: a close's settling and a handover take real time. */
async function until(what: string, check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const chunk = () => new Int16Array(1600).fill(2000)
/** 20 ms of Sophia's audio as the provider sends it: 24 kHz PCM, base64. */
const out = () => Buffer.from(new Int16Array(480).fill(1000).buffer).toString('base64')
const OUT = 'audio/pcm;rate=24000'

type Stop = NonNullable<MediaQualificationReservation['stop']>

interface Durable {
  connections: number
  /** Generations counted (reserved, or started unasked): a top-up counts none. */
  turns: number
  /** What the exchange may have cost: every charge (no usage is reported here). */
  charged: number
  /** Why the exchange ended: a refused reservation's reason, or a bridge's stop (endsOnStop). */
  ended: Stop | 'bridge' | null
}

/**
 * A FAKE of the API's durable bound for one grant: connections and generations counted per exchange, each generation
 * and each top-up of a connection's input allowance (spend) charged, a reservation that does not fit refused and the
 * exchange ended; an ended exchange is refused (409). No prompt size is reported here, so the budget's rule sees none.
 */
class FakeLedger {
  readonly grant: VoiceQualification
  readonly asked: MediaQualificationReserve[] = []
  /** Exchanges a bridge's own stop ended (reason bridge). */
  readonly stopped = new Set<string>()
  readonly exchanges = new Map<string, Durable>()
  /** While set, a reservation of this kind waits until `until` resolves (the API is slow). */
  held: { kind: MediaQualificationReserve['kind']; until: Promise<void> } | null = null
  /** When set, a bridge's stop ends the exchange, as the real API does (0046): what comes after is refused (409). */
  endsOnStop = false
  /**
   * When set, each request waits for what it returns before it is answered: given the request and how many of its kind
   * came before it (0 for the first), so a test holds one request in a chain and not another.
   */
  gate: ((r: MediaQualificationReserve, before: number) => Promise<void> | undefined) | null = null

  constructor(qualification: VoiceQualification) {
    this.grant = qualification
  }

  /** A request held (`held`) or gated (`gate`) waits for its release before it is answered. */
  async #waitFor(r: MediaQualificationReserve, before: number): Promise<void> {
    if (this.held?.kind === r.kind) await this.held.until
    const gated = this.gate?.(r, before)
    if (gated) await gated
  }

  /** What the exchange may have cost, as the API holds it now. */
  committed(exchangeId: string): number {
    return this.exchanges.get(exchangeId)?.charged ?? 0
  }

  reserve = async (r: MediaQualificationReserve): Promise<MediaQualificationReservation> => {
    await Promise.resolve()
    const before = this.asked.filter((a) => a.kind === r.kind).length
    this.asked.push(r)
    await this.#waitFor(r, before)
    const x = this.exchanges.get(r.exchangeId) ?? { connections: 0, turns: 0, charged: 0, ended: null }
    this.exchanges.set(r.exchangeId, x)
    if (r.kind === 'stop') {
      this.stopped.add(r.exchangeId)
      if (this.endsOnStop) x.ended ??= 'bridge'
      return { ok: true, ordinal: null, stop: null, ended: true }
    }
    if (x.ended) throw new ServiceError(409, 'POST /v1/media/qualification-reserve: 409 invalid_state')
    const stop = this.#stop(x, r)
    if (stop) {
      x.ended = stop
      return { ok: false, ordinal: null, stop, ended: true }
    }
    this.#count(x, r)
    return {
      ok: true,
      ordinal: r.kind === 'connection' ? x.connections : (r.ordinal ?? null),
      stop: null,
      ended: false,
    }
  }

  /** A reservation that fits: a connection numbered, a generation counted, a charge added. */
  #count(x: Durable, r: MediaQualificationReserve): void {
    if (r.kind === 'connection') x.connections += 1
    // An unasked generation was counted and charged as it was asked (#stop).
    else if (r.kind !== 'unasked') {
      if (r.kind === 'generation') x.turns += 1
      x.charged += r.charge ?? 0
    }
  }

  /**
   * media_voice_reserve's rules (0046): what the guard would end the exchange at (voice_limit_reached: past the turns or
   * connections, or the next turn could reach the budget), then the reservation's own: a connection past the grant's,
   * a generation past its turns, or a generation or a top-up whose charge would let the next turn reach the budget.
   */
  #stop(x: Durable, r: MediaQualificationReserve): Stop | null {
    const g = this.grant
    const charge = r.charge ?? 0
    const reached = (committed: number) => committed + g.maxOutputTokensPerTurn >= g.maxUsageTokens
    if (r.kind === 'unasked') {
      x.turns += 1
      x.charged += charge
    }
    if (x.connections > g.maxProviderConnections) return 'connections'
    if (x.turns > g.maxTurns) return 'turns'
    if (reached(x.charged)) return 'usage'
    if (r.kind === 'connection') return x.connections + 1 > g.maxProviderConnections ? 'connections' : null
    if (r.kind === 'generation' && x.turns + 1 > g.maxTurns) return 'turns'
    return r.kind !== 'unasked' && reached(x.charged + charge) ? 'usage' : null
  }
}

/** One generation's worst case under grant(): the context again and its output twice (25,000 + 2 × 1000). */
const GENERATION = ASSUMED_RATES.context + 2 * 1000
/** A 100 ms chunk of 16 kHz audio and a video frame, at the assumed rates. */
const CHUNK_TOKENS = 0.1 * ASSUMED_RATES.audioInPerSecond
const FRAME_TOKENS = ASSUMED_RATES.perFrame

/**
 * What every process sent the provider for E1, at the assumed rates: each generation the API counted at its worst case,
 * and each chunk and frame as it was sent. At each send it checks the invariant charge ahead promises: what was sent
 * never exceeds what the API had committed at that instant.
 */
class Meter {
  readonly ledger: FakeLedger
  chunks = 0
  frames = 0
  readonly unpaid: string[] = []

  constructor(ledger: FakeLedger) {
    this.ledger = ledger
  }

  get spent(): number {
    const turns = this.ledger.exchanges.get(E1)?.turns ?? 0
    return turns * GENERATION + this.chunks * CHUNK_TOKENS + this.frames * FRAME_TOKENS
  }

  sent(what: 'chunk' | 'frame', lifetime: number): void {
    if (what === 'chunk') this.chunks += 1
    else this.frames += 1
    const committed = this.ledger.committed(E1)
    if (this.spent > committed)
      this.unpaid.push(
        `lifetime ${String(lifetime)}: a ${what} sent with ${this.spent.toFixed(1)} spent, ${committed} committed`,
      )
  }
}

interface Options {
  now?: () => number
  meter?: Meter
  lifetime?: number
  /** Each reservation attempt's time limit, when a test bounds it (a close's settling is bounded by it). */
  reserveTimeoutMs?: number
}

/** One bridge process: LiveKit and Gemini Live are labelled fakes; the API is the ledger, and keeps the receipts. */
function harness(ledger: FakeLedger, { now = Date.now, meter, lifetime = 1, reserveTimeoutMs }: Options = {}) {
  const evidence: MediaEvidenceWrite[] = []
  const roomEvents: RoomEvents[] = []
  const lives: Array<{ events: LiveEvents; audio: number; frames: number }> = []
  const logs: Array<[string, Record<string, unknown>]> = []
  /** Each tool call's handler that ran (the API executed it), with the reservations the API had counted by then. */
  const calls: Array<{ call: MediaToolCall; counted: string[] }> = []
  const service: MediaService = {
    assignments: () => Promise.reject(new Error('unused')),
    presence: () => Promise.resolve(),
    ackQuiesce: () => Promise.resolve(),
    holder: () => Promise.resolve(),
    announced: () => Promise.resolve(),
    toolCall: (call) => {
      calls.push({ call, counted: ledger.asked.map((r) => r.kind) })
      return Promise.resolve({ status: 'ok', output: {} })
    },
    toolSurface: () => Promise.resolve({ names: [...DECLARED_NAMES] }),
    recordEvidence: (write) => {
      evidence.push(write)
      return Promise.resolve({ seq: evidence.length, replayed: false, ended: false, reason: null })
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
      const entry = { events, audio: 0, frames: 0 }
      lives.push(entry)
      const live: LiveLink = {
        sendAudio: () => {
          entry.audio += 1
          meter?.sent('chunk', lifetime)
        },
        sendAudioStreamEnd: () => undefined,
        sendFrame: () => {
          entry.frames += 1
          meter?.sent('frame', lifetime)
        },
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
    now,
    log: (event, detail) => logs.push([event, detail ?? {}]),
    every: () => () => undefined,
    voiceEvidence: true,
    evidenceRetryMs: [0, 0],
    reserveRetryMs: [0, 0],
    ...(reserveTimeoutMs === undefined ? {} : { reserveTimeoutMs }),
  })
  const stops = () => logs.filter(([event]) => event === 'qualification.stopped').map(([, d]) => d.why)
  return { bridge, evidence, roomEvents, lives, stops, calls, logs }
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

describe('what a process sends is paid for on the API before it is sent (charge ahead; Codex P1 on PR #190)', () => {
  const img = { rgba: new Uint8Array(16).fill(1), width: 2, height: 2 }
  const looking = { participantIdentity: LUIS, source: 'camera' as const }
  /** Root's control: a budget of 100,000, two connections, and in each lifetime 200 s of speech and 200 frames. */
  const control = () => new FakeLedger(grant({ maxUsageTokens: 100_000, maxProviderConnections: 2 }))

  /** The principal speaks for `seconds` in one generation that never ends, with a camera frame each second. */
  async function longTurn(h: ReturnType<typeof harness>, clock: { now: number }, seconds: number): Promise<void> {
    for (let second = 0; second < seconds; second += 1) {
      for (let i = 0; i < 10; i += 1) h.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
      await settle()
      clock.now += 1000
      h.roomEvents.at(-1)?.frame(LUIS, 'camera', img, clock.now)
      h.bridge.session(E1)?.tick()
      await settle()
    }
  }

  it('a bridge process that dies after a long turn’s input and frames left nothing unpaid; its restart gets what is left', async () => {
    const ledger = control()
    const meter = new Meter(ledger)
    const clock = { now: Date.now() }
    const assigned = assignment(ledger.grant, { allowVision: true, looking })
    const processes: Array<ReturnType<typeof harness>> = []
    try {
      for (const lifetime of [1, 2]) {
        const h = harness(ledger, { now: () => clock.now, meter, lifetime })
        processes.push(h)
        await h.bridge.apply([assigned])
        await settle()
        h.lives[0]?.events.setupComplete()
        await longTurn(h, clock, 200)
        // The process dies here: nothing of it is closed, flushed or told to the API.
      }
      assert.deepEqual(meter.unpaid.slice(0, 1), [], 'nothing was sent before the API had committed it')
      assert.ok(meter.spent <= ledger.committed(E1), 'across both lifetimes, everything sent was paid for')
      assert.ok(ledger.committed(E1) < 100_000, 'and the API never committed past the budget')
      assert.equal(ledger.exchanges.get(E1)?.ended, 'usage', 'the restart’s generation did not fit: the exchange ended')
      assert.equal(processes[1]?.lives[0]?.audio, 0, 'the restarted process sent nothing it could not pay for')
    } finally {
      for (const h of processes) await h.bridge.stop()
    }
  })

  /** The real SessionQualification of one process, against the shared durable fake. */
  function bound(ledger: FakeLedger, stops: string[]): SessionQualification {
    let numbered = 0
    return new SessionQualification({
      exchangeId: E1,
      grant: ledger.grant,
      model: 'fake-model',
      instructionSha256: 'ef'.repeat(32),
      bridgeCommit: null,
      record: () => Promise.resolve({ seq: (numbered += 1), replayed: false, ended: false, reason: null }),
      retryMs: [],
      now: Date.now,
      attribution: () => ({ actorId: LUIS, inputEpoch: 1 }),
      ended: () => undefined,
      stop: (why) => void stops.push(why),
      reserve: (r) => ledger.reserve(r),
      reserveRetryMs: [],
      reserveTimeoutMs: 1000,
      log: () => undefined,
    })
  }

  /** One chunk, as RoomSession sends it: held while a reservation is in flight, sent once it is granted. */
  async function sendChunk(q: SessionQualification, meter: Meter, lifetime: number): Promise<boolean> {
    const speech = chunk()
    let verdict = q.input(1, LUIS, speech, 0, 1)
    while (verdict === 'hold') {
      if (await q.granted(1)) return false
      verdict = q.input(1, LUIS, speech, 0, 1)
    }
    if (verdict) return false
    meter.sent('chunk', lifetime)
    return true
  }

  /** Ten chunks and a frame each second, in one generation; false once the bound stopped the session. */
  async function speakAndShow(q: SessionQualification, meter: Meter, lifetime: number): Promise<void> {
    for (let second = 0; second < 200; second += 1) {
      for (let i = 0; i < 10; i += 1) if (!(await sendChunk(q, meter, lifetime))) return
      const frame = q.frame(1)
      if (frame === null) meter.sent('frame', lifetime)
      else if (frame !== 'drop') return
    }
  }

  it('the real SessionQualification, made again with each process on a shared durable fake: each lifetime paid first', async () => {
    const ledger = control()
    const meter = new Meter(ledger)
    const stops: string[] = []
    for (const lifetime of [1, 2]) {
      const q = bound(ledger, stops)
      if ((await q.connecting(1, false)) === null) await speakAndShow(q, meter, lifetime)
      // The process dies here, and its SessionQualification with it.
    }
    assert.deepEqual(meter.unpaid.slice(0, 1), [], 'nothing was sent before the API had committed it')
    assert.ok(meter.spent <= ledger.committed(E1))
    assert.ok(ledger.committed(E1) < 100_000)
    assert.deepEqual(stops, [], 'a refusal awaited by input is the caller’s to act on, as RoomSession does')
  })
})

describe('a function call runs only once the exchange counted its generation, across bridge processes (Codex r4232975798)', () => {
  /**
   * A bridge process started again on E1 after the first spent two generations: its session-local counters start empty.
   * Luis speaks (the exchange's third generation, asked for), the provider's connection is replaced mid-turn (his turn
   * stands, A14), and the resumed connection sends a call nobody reserved there.
   */
  async function restartedCall(maxTurns: number) {
    const ledger = new FakeLedger(grant({ maxTurns }))
    const clock = { now: Date.now() }
    const assigned = assignment(ledger.grant)
    const first = harness(ledger, { now: () => clock.now })
    await first.bridge.apply([assigned])
    await settle()
    first.lives[0]?.events.setupComplete()
    await turn(first, 0)
    await turn(first, 0)
    await first.bridge.stop()
    const h = harness(ledger, { now: () => clock.now, lifetime: 2 })
    await h.bridge.apply([assigned])
    await settle()
    h.lives[0]?.events.setupComplete()
    h.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    assert.equal(h.lives[0]?.audio, 1, 'Luis’s words went under their generation')
    h.lives[0]?.events.goAway('1s')
    clock.now += 1000
    h.bridge.session(E1)?.tick()
    await settle()
    h.lives[1]?.events.setupComplete()
    await settle()
    h.lives[1]?.events.toolCalls([{ id: 'call-r', name: 'project_status', args: {} }])
    await settle()
    return { ledger, h }
  }

  it('at the exchange’s turn limit: the API refuses its generation, no handler runs, and the session stops (turns)', async () => {
    const { ledger, h } = await restartedCall(3)
    assert.deepEqual(h.calls, [], 'nothing executed, nothing admitted')
    assert.deepEqual(h.stops(), ['turns'])
    assert.equal(ledger.exchanges.get(E1)?.ended, 'turns')
    await h.bridge.stop()
  })

  it('within its limits: the call runs once, after the exchange counted its generation', async () => {
    const { ledger, h } = await restartedCall(20)
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0]?.call.actorId, LUIS)
    assert.ok(h.calls[0]?.counted.includes('unasked'), 'the API had counted its generation before the handler ran')
    assert.equal(
      ledger.exchanges.get(E1)?.turns,
      5,
      'three asked by Luis’s words, the call’s own (unasked), and the one its response asks for',
    )
    assert.deepEqual(h.stops(), [])
    await h.bridge.stop()
  })
})

describe('each turn end retires the one generation that ended, against the durable ledger (Codex r4233559261)', () => {
  it('two tool responses reserved on one connection before either continuation ended: both run, no false turns stop', async () => {
    // Luis's words are the exchange's first generation; the provider's turn ends with two calls; each handler's
    // response reserves its continuation (the second and the third), both before the first continuation ends.
    const ledger = new FakeLedger(grant({ maxTurns: 3 }))
    const h = harness(ledger)
    await h.bridge.apply([assignment(ledger.grant)])
    await settle()
    const live = h.lives[0]
    live?.events.setupComplete()
    h.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    live?.events.toolCalls([
      { id: 'call-1', name: 'project_status', args: {} },
      { id: 'call-2', name: 'project_status', args: {} },
    ])
    live?.events.turnComplete()
    await settle()
    assert.equal(h.calls.length, 2, 'both handlers ran')
    assert.equal(ledger.exchanges.get(E1)?.turns, 3, 'the API counted Luis’s generation and both continuations')
    for (const n of [1, 2]) {
      live?.events.audio(out(), OUT)
      await settle()
      assert.deepEqual(h.stops(), [], `continuation ${String(n)} runs`)
      live?.events.turnComplete()
      await settle()
    }
    assert.equal(ledger.exchanges.get(E1)?.turns, 3, 'nothing counted twice: the session’s three are the API’s three')
    assert.equal(ledger.exchanges.get(E1)?.ended, null)
    live?.events.audio(out(), OUT) // a fourth generation nobody reserved
    await settle()
    assert.deepEqual(h.stops(), ['turns'], 'past the grant’s three, here as on the API')
    await h.bridge.stop()
  })
})

describe('a generation nobody reserved and cut at its first output is in the exchange’s ledger (Codex r4233954386)', () => {
  it('its turn and its charge count across a restart: the restarted process gets no generation past them', async () => {
    // The FakeLedger keeps the exchange open after a bridge's stop (the real API ends it), so a restart reads its counts.
    const ledger = new FakeLedger(grant({ maxTurns: 2, maxOutputTokensPerTurn: 64 }))
    const first = harness(ledger)
    await first.bridge.apply([assignment(ledger.grant)])
    await settle()
    first.lives[0]?.events.setupComplete()
    await turn(first, 0) // Luis's words: the exchange's first generation, asked for
    first.lives[0]?.events.outputTranscript('x'.repeat(300), false) // a second nobody reserved, past the cap at once
    await settle()
    assert.deepEqual(first.stops(), ['output'])
    assert.deepEqual(
      ledger.asked.map((r) => r.kind),
      ['connection', 'generation', 'unasked', 'stop'],
    )
    assert.equal(ledger.exchanges.get(E1)?.turns, 2, 'the cut generation is counted')
    assert.equal(
      ledger.committed(E1),
      25_000 + 2 * 64 + 4000 + (25_000 + 2 * 64),
      'and charged: Luis’s at its worst case with his allowance, and the cut one at its worst case',
    )
    await first.bridge.stop()
    const second = harness(ledger, { lifetime: 2 })
    await second.bridge.apply([assignment(ledger.grant)])
    await settle()
    second.lives[0]?.events.setupComplete()
    second.roomEvents.at(-1)?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    assert.equal(second.lives[0]?.audio, 0, 'Luis’s next words would be a third generation: never sent')
    assert.deepEqual(second.stops(), ['turns'])
    await second.bridge.stop()
  })
})

describe('a bridge process shut down while what it spent is being charged settles it before it exits (Codex r4234233106)', () => {
  it('the charge and the stop are answered before stop() resolves; the ended exchange then refuses a restart', async () => {
    const ledger = new FakeLedger(grant({ maxOutputTokensPerTurn: 64 }))
    ledger.endsOnStop = true
    let release: (() => void) | undefined
    ledger.held = { kind: 'unasked', until: new Promise<void>((resolve) => (release = resolve)) }
    const first = harness(ledger)
    await first.bridge.apply([assignment(ledger.grant)])
    await settle()
    first.lives[0]?.events.setupComplete()
    await turn(first, 0) // Luis's words: the exchange's first generation, asked for
    first.lives[0]?.events.outputTranscript('x'.repeat(300), false) // one nobody reserved, cut at once; charge held
    await settle()
    assert.deepEqual(first.stops(), ['output'])
    let exited = false
    // SIGINT or SIGTERM: server.ts exits once the bridge's stop resolves.
    const exiting = first.bridge.stop().then(() => {
      exited = true
    })
    await settle()
    assert.equal(exited, false, 'not while the charge is unanswered')
    release?.()
    await exiting
    assert.deepEqual(
      ledger.asked.map((r) => r.kind),
      ['connection', 'generation', 'unasked', 'stop'],
    )
    const x = ledger.exchanges.get(E1)
    assert.deepEqual([x?.turns, x?.ended], [2, 'bridge'], 'its turn counted, and the exchange ended by the stop')
    assert.equal(ledger.committed(E1), 25_000 + 2 * 64 + 4000 + (25_000 + 2 * 64), 'and its charge')
    const second = harness(ledger, { lifetime: 2 })
    await second.bridge.apply([assignment(ledger.grant)])
    await settle()
    assert.equal(second.lives.length, 0, 'a restarted process opens no connection: nothing of the budget is reused')
    await second.bridge.stop()
  })
})

describe('a session replacing another on its exchange opens nothing until the replaced one’s charges are on the API (Codex r4234649847)', () => {
  /**
   * Root's sequence: the real MediaBridge, maxTurns 1. The first session's provider sends output nobody reserved (its
   * unasked charge held unless `answered`), its room is lost, the same assignment comes again, and the replacement's
   * room hears one input chunk.
   */
  async function replaced(opts: { answered: boolean; reserveTimeoutMs?: number }) {
    const ledger = new FakeLedger(grant({ maxTurns: 1 }))
    let release: (() => void) | undefined
    if (!opts.answered) ledger.held = { kind: 'unasked', until: new Promise<void>((resolve) => (release = resolve)) }
    const h = harness(ledger, opts.reserveTimeoutMs === undefined ? {} : { reserveTimeoutMs: opts.reserveTimeoutMs })
    const assigned = assignment(ledger.grant)
    await h.bridge.apply([assigned])
    await settle()
    h.lives[0]?.events.setupComplete()
    h.lives[0]?.events.audio(out(), OUT) // a generation nobody reserved: charged unasked
    await settle()
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await h.bridge.apply([assigned])
    await settle()
    assert.equal(h.roomEvents.length, 2, 'the replacement joined the room')
    h.roomEvents[1]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    const kinds = () => ledger.asked.map((r) => r.kind)
    return { ledger, h, kinds, release: () => release?.() }
  }

  it('the replaced session’s unasked charge held, then answered: nothing of the replacement before it, then it opens', async () => {
    const x = await replaced({ answered: false })
    try {
      assert.equal(x.h.lives.length, 1, 'no provider connection for the replacement')
      assert.deepEqual(x.kinds(), ['connection', 'unasked'], 'and no reservation of its own')
      x.release()
      await until('the replacement opened', () => x.h.lives.length === 2)
      assert.deepEqual(x.kinds().slice(0, 3), ['connection', 'unasked', 'connection'], 'after the charge it inherited')
      assert.equal(x.h.lives[1]?.audio, 0, 'the chunk heard before it opened was never sent')
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('nothing owed (root’s control: the charge answered before the room is lost): the replacement opens at once, and the spent turn holds', async () => {
    const x = await replaced({ answered: true })
    try {
      await until('the replacement opened', () => x.h.lives.length === 2)
      x.h.lives[1]?.events.setupComplete()
      x.h.roomEvents[1]?.audio(LUIS, chunk(), 16000, 1)
      await settle()
      assert.equal(x.h.lives[1]?.audio, 0, 'its input would start a second generation: refused, never sent')
      assert.deepEqual(x.h.stops(), ['turns'])
    } finally {
      await x.h.bridge.stop()
    }
  })

  it('the replaced session’s charge never answered: past the bound the replacement still opens nothing, and says so', async () => {
    // Three attempts of 50 ms, twice: the replaced session's close stops waiting after 300 ms.
    const x = await replaced({ answered: false, reserveTimeoutMs: 50 })
    try {
      await until('the replacement fails closed', () =>
        x.h.logs.some(([event]) => event === 'qualification.inherited_unsettled'),
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      x.h.roomEvents[1]?.audio(LUIS, chunk(), 16000, 1)
      await settle()
      assert.equal(x.h.lives.length, 1, 'zero provider connections from the replacement')
      assert.deepEqual(x.kinds(), ['connection', 'unasked'], 'zero reservations from it')
      assert.equal(x.h.lives[0]?.audio, 0, 'zero inputs, on any connection')
      assert.deepEqual(
        x.h.logs.filter(([event]) => event === 'qualification.inherited_unsettled').map(([, d]) => d.charges),
        [1],
      )
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  /** The replaced session's charge still unanswered past its close's bound: the replacement has failed closed. */
  async function failedClosed() {
    const x = await replaced({ answered: false, reserveTimeoutMs: 50 })
    const inherited = (event: string) => x.h.logs.some(([e]) => e === event)
    await until('the replacement fails closed', () => inherited('qualification.inherited_unsettled'))
    return { ...x, inherited }
  }

  it('answered after the bound: the replacement opens only once the charge it inherited is on the API', async () => {
    const x = await failedClosed()
    try {
      assert.equal(x.h.lives.length, 1)
      x.release()
      await until('the replacement opened', () => x.h.lives.length === 2)
      assert.deepEqual(x.kinds().slice(0, 3), ['connection', 'unasked', 'connection'], 'after the charge it inherited')
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('refused after the bound: the replacement stays closed for good, and says so', async () => {
    const x = await failedClosed()
    try {
      const durable = x.ledger.exchanges.get(E1)
      assert.ok(durable)
      durable.ended = 'usage' // the API ended the exchange meanwhile: the late charge is refused (409)
      x.release()
      await until('the charge is refused', () => x.inherited('qualification.inherited_lost'))
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(x.h.lives.length, 1, 'zero provider connections from the replacement')
      assert.deepEqual(x.kinds(), ['connection', 'unasked'], 'zero reservations from it')
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('refused before the handover: the replacement never opens', async () => {
    const ledger = new FakeLedger(grant({ maxTurns: 1 }))
    let release: (() => void) | undefined
    ledger.held = { kind: 'unasked', until: new Promise<void>((resolve) => (release = resolve)) }
    const h = harness(ledger)
    try {
      const assigned = assignment(ledger.grant)
      await h.bridge.apply([assigned])
      await settle()
      h.lives[0]?.events.setupComplete()
      h.lives[0]?.events.audio(out(), OUT)
      await settle()
      h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
      await settle()
      await h.bridge.apply([assigned])
      const durable = ledger.exchanges.get(E1)
      assert.ok(durable)
      durable.ended = 'usage'
      release?.()
      const unsettled = () => h.logs.filter(([event]) => event === 'qualification.inherited_unsettled')
      await until('the replacement fails closed', () => unsettled().length > 0)
      assert.deepEqual(
        unsettled().map(([, d]) => [d.charges, d.lost]),
        [[0, true]],
      )
      assert.equal(h.lives.length, 1)
      assert.deepEqual(
        ledger.asked.map((r) => r.kind),
        ['connection', 'unasked'],
      )
    } finally {
      release?.()
      await h.bridge.stop()
    }
  })
})

/** The API ended the exchange (its usage limit): what is charged after is refused (409). */
function endedByTheApi(ledger: FakeLedger): void {
  const durable = ledger.exchanges.get(E1)
  assert.ok(durable)
  durable.ended = 'usage'
}

describe('a chain of replacements waits on every charge the chain owes (Codex r4234949420)', () => {
  /**
   * Root's sequence: the real MediaBridge, maxTurns 1. Session A's provider sends output nobody reserved, its unasked
   * charge held (unless `answered`); A's room is lost and the assignment comes again: B, waiting on A's ledger. With
   * `before: 'failed'`, B has failed closed on A's ledger first (A's close past its bound); with `before: 'refused'`,
   * A's charge was refused (the API ended the exchange) and B knows it. B's room is lost and the assignment comes
   * again, while A's charge is still held: C, whose room hears one input chunk.
   */
  async function chained(opts: { reserveTimeoutMs?: number; before?: 'failed' | 'refused' } = {}) {
    const ledger = new FakeLedger(grant({ maxTurns: 1 }))
    let release: (() => void) | undefined
    const free = () => release?.()
    ledger.held = { kind: 'unasked', until: new Promise<void>((resolve) => (release = resolve)) }
    const h = harness(ledger, opts.reserveTimeoutMs === undefined ? {} : { reserveTimeoutMs: opts.reserveTimeoutMs })
    const logged = (event: string) => h.logs.filter(([e]) => e === event).map(([, d]) => d)
    const assigned = assignment(ledger.grant)
    await h.bridge.apply([assigned])
    await settle()
    h.lives[0]?.events.setupComplete()
    h.lives[0]?.events.audio(out(), OUT) // a generation nobody reserved: charged unasked
    await settle()
    h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await h.bridge.apply([assigned]) // B
    await settle()
    assert.equal(h.roomEvents.length, 2, 'B joined the room')
    if (opts.before === 'refused') {
      endedByTheApi(ledger) // A's charge is refused (409), and its close hands over the loss
      free()
    }
    if (opts.before) await until('B fails closed', () => logged('qualification.inherited_unsettled').length === 1)
    h.roomEvents[1]?.connection('disconnected', 'livekit: 2')
    await settle()
    await h.bridge.apply([assigned]) // C
    await settle()
    assert.equal(h.roomEvents.length, 3, 'C joined the room')
    h.roomEvents[2]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    const kinds = () => ledger.asked.map((r) => r.kind)
    return { ledger, h, kinds, logged, release: free }
  }

  it('root’s sequence: B replaced while it still waits on A’s ledger; C opens nothing while A’s charge is held', async () => {
    const x = await chained()
    try {
      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.equal(x.h.lives.length, 1, 'no provider connection for B or C')
      assert.deepEqual(x.kinds(), ['connection', 'unasked'], 'and no reservation of theirs')
      await until('C fails closed', () => x.logged('qualification.inherited_unsettled').length > 0)
      assert.deepEqual(
        x.logged('qualification.inherited_unsettled').map((d) => [d.charges, d.lost]),
        [[1, false]],
        'C: B’s own handover had not come, one unanswered link',
      )
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('A’s charge landing late: C opens once it is on the API', async () => {
    const x = await chained()
    try {
      await until('C fails closed', () => x.logged('qualification.inherited_unsettled').length > 0)
      assert.equal(x.h.lives.length, 1)
      x.release()
      await until('C opened', () => x.h.lives.length === 2)
      assert.deepEqual(x.kinds().slice(0, 3), ['connection', 'unasked', 'connection'], 'after A’s charge')
      assert.equal(x.h.lives[1]?.audio, 0, 'the chunk heard before it opened was never sent')
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('A’s charge refused: C stays closed for good', async () => {
    const x = await chained()
    try {
      await until('C fails closed', () => x.logged('qualification.inherited_unsettled').length > 0)
      const durable = x.ledger.exchanges.get(E1)
      assert.ok(durable)
      durable.ended = 'usage' // the API ended the exchange meanwhile: A's late charge is refused (409)
      x.release()
      await until('the chain’s loss is seen', () => x.logged('qualification.inherited_lost').length > 0)
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(x.h.lives.length, 1, 'zero provider connections from B or C')
      assert.deepEqual(x.kinds(), ['connection', 'unasked'], 'zero reservations from them')
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('A’s charge refused before B was replaced: the loss is carried, and C never opens', async () => {
    const x = await chained({ before: 'refused' })
    try {
      await until('C fails closed', () => x.logged('qualification.inherited_unsettled').length === 2)
      assert.deepEqual(
        x.logged('qualification.inherited_unsettled').map((d) => [d.charges, d.lost]),
        [
          [0, true],
          [0, true],
        ],
        'B on A’s loss, then C on the same loss',
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(x.h.lives.length, 1)
      assert.deepEqual(x.kinds(), ['connection', 'unasked'])
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('B failed closed on A’s ledger before it was replaced: C still waits on A, then opens', async () => {
    // Three attempts of 50 ms, twice: A's close stops waiting after 300 ms, and hands over its unanswered charge.
    const x = await chained({ reserveTimeoutMs: 50, before: 'failed' })
    try {
      await until('C fails closed', () => x.logged('qualification.inherited_unsettled').length === 2)
      assert.deepEqual(
        x.logged('qualification.inherited_unsettled').map((d) => [d.charges, d.lost]),
        [
          [1, false],
          [1, false],
        ],
        'B on A’s charge, then C on the same charge, carried',
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(x.h.lives.length, 1)
      assert.deepEqual(x.kinds(), ['connection', 'unasked'])
      x.release()
      await until('C opened', () => x.h.lives.length === 2)
      assert.deepEqual(x.kinds().slice(0, 3), ['connection', 'unasked', 'connection'], 'C alone: B was closed')
    } finally {
      x.release()
      await x.h.bridge.stop()
    }
  })

  it('nothing owed along the chain (control): B and C each open at once', async () => {
    const ledger = new FakeLedger(grant())
    const h = harness(ledger)
    try {
      const assigned = assignment(ledger.grant)
      await h.bridge.apply([assigned])
      await settle()
      await until('A opened', () => h.lives.length === 1)
      h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
      await settle()
      await h.bridge.apply([assigned])
      await until('B opened', () => h.lives.length === 2)
      h.roomEvents[1]?.connection('disconnected', 'livekit: 2')
      await settle()
      await h.bridge.apply([assigned])
      await until('C opened', () => h.lives.length === 3)
      assert.deepEqual(
        ledger.asked.map((r) => r.kind),
        ['connection', 'connection', 'connection'],
      )
      assert.deepEqual(
        h.logs.filter(([event]) => event === 'qualification.inherited_unsettled'),
        [],
      )
    } finally {
      await h.bridge.stop()
    }
  })
})

describe('a close waits for the whole chain of what it owes, within its bound (Codex r4235490757)', () => {
  /** One request's bound in these tests: 3 attempts of 100 ms, no waits between them. The close's: 3 of them. */
  const ONCE = 3 * 100
  const BOUND = 3 * ONCE
  /** How late past a bound a close may end: timer and event-loop latency. */
  const MARGIN = 250
  /** Each request in the chain answered just inside its own bound. */
  const INSIDE = 250

  /**
   * Under a cap of 64: the principal's turn reserved, then their audio until its allowance runs out (952 chunks of 4.2
   * tokens: 3,998.4, 1.6 left; the 953rd waits for a top-up of 3,999, in flight); then Sophia's 15,000 characters
   * (5,000 tokens) cut the generation: 4,872 past its reserve, a debt that waits for the top-up (872 once it is
   * credited), then the stop. `owe` instead says only 60 characters (within the cap) after 952 chunks: a debt's top-up
   * and no stop. `cutWithin` cuts with 300 characters (100 tokens, within its reserve): the stop alone.
   */
  async function chain(gate: FakeLedger['gate'], shape: 'debt' | 'owe' | 'cutWithin' = 'debt') {
    const ledger = new FakeLedger(grant({ maxOutputTokensPerTurn: 64, maxTurns: 1 }))
    ledger.gate = gate
    const h = harness(ledger, { reserveTimeoutMs: 100 })
    await h.bridge.apply([assignment(ledger.grant)])
    await settle()
    h.lives[0]?.events.setupComplete()
    const chunks = shape === 'cutWithin' ? 1 : shape === 'owe' ? 952 : 953
    // The first asks for its generation; the rest go once it is granted, each from the allowance.
    h.roomEvents[0]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    for (let i = 1; i < chunks; i += 1) h.roomEvents[0]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    const chars = shape === 'debt' ? 15_000 : shape === 'owe' ? 60 : 300
    h.lives[0]?.events.outputTranscript('x'.repeat(chars), false)
    await settle()
    const kinds = () => ledger.asked.map((r) => r.kind)
    const unsettled = () => h.logs.filter(([event]) => event === 'qualification.charge_unsettled').map(([, d]) => d)
    return { ledger, h, kinds, unsettled }
  }

  it('a top-up in flight, then the debt a cut left, then the stop, each answered inside its own bound: the shutdown waits for all three', async () => {
    const x = await chain((r) => (r.kind === 'spend' || r.kind === 'stop' ? sleep(INSIDE) : undefined))
    const started = Date.now()
    await x.h.bridge.stop()
    const ms = Date.now() - started
    assert.deepEqual(x.kinds(), ['connection', 'generation', 'spend', 'spend', 'stop'])
    assert.ok(ms >= 2 * INSIDE, `it waited for the chain (${String(ms)} ms)`)
    assert.ok(ms < BOUND + MARGIN, `within its bound (${String(ms)} ms)`)
    assert.deepEqual(x.unsettled(), [], 'nothing left unsettled')
    assert.ok(x.ledger.stopped.has(E1), 'the exchange stopped')
    assert.equal(
      x.ledger.committed(E1),
      25_000 + 2 * 64 + 4000 + 3999 + 872,
      'and paid: its generation, the top-up, and the 872 the cut left',
    )
  })

  for (const held of [
    {
      phase: 'the top-up in flight',
      at: (r: MediaQualificationReserve) => r.kind === 'spend',
      phases: ['debt, after what is in flight'],
      stop: 'unsent',
      inherited: 2,
    },
    {
      phase: 'the debt’s spend',
      at: (r: MediaQualificationReserve, before: number) => r.kind === 'spend' && before === 1,
      phases: ['debt'],
      stop: 'unsent',
      inherited: 2,
    },
    {
      phase: 'the stop',
      at: (r: MediaQualificationReserve) => r.kind === 'stop',
      phases: [],
      stop: 'unanswered',
      inherited: 1,
    },
  ]) {
    it(`${held.phase} held past the bound: the close ends at its bound, says which phase, and hands it over unanswered`, async () => {
      let release: (() => void) | undefined
      const never = new Promise<void>((resolve) => (release = resolve))
      const x = await chain((r, before) => (held.at(r, before) ? never : undefined))
      try {
        const started = Date.now()
        x.h.roomEvents[0]?.connection('disconnected', 'livekit: 1') // its room lost: the session closes
        await settle()
        await x.h.bridge.apply([assignment(x.ledger.grant)]) // the replacement, on the closed one's handover
        await until('the replacement weighed what it inherited', () =>
          x.h.logs.some(([event]) => event === 'qualification.inherited_unsettled'),
        )
        const ms = Date.now() - started
        assert.ok(ms >= BOUND - 50 && ms < BOUND + MARGIN, `the close ended at its bound (${String(ms)} ms)`)
        assert.deepEqual(
          x.unsettled().map((d) => [d.phases, d.stop]),
          [[held.phases, held.stop]],
          'charge_unsettled names the phase',
        )
        assert.deepEqual(
          x.h.logs.filter(([event]) => event === 'qualification.inherited_unsettled').map(([, d]) => d.charges),
          [held.inherited],
          'the replacement inherited it unanswered (with the stop, not sent yet, behind a charge)',
        )
        assert.equal(x.h.lives.length, 1, 'and opened nothing')
      } finally {
        release?.()
        await x.h.bridge.stop()
      }
    })
  }

  it('no debt, the stop only (control): the shutdown waits for the stop', async () => {
    const x = await chain((r) => (r.kind === 'stop' ? sleep(INSIDE) : undefined), 'cutWithin')
    const started = Date.now()
    await x.h.bridge.stop()
    const ms = Date.now() - started
    assert.deepEqual(x.kinds(), ['connection', 'generation', 'stop'])
    assert.ok(ms >= INSIDE - 50 && ms < ONCE + MARGIN, `it waited for the stop (${String(ms)} ms)`)
    assert.deepEqual(x.unsettled(), [])
    assert.ok(x.ledger.stopped.has(E1))
  })

  it('no stop, charges only (control): the shutdown waits for the debt’s top-up, and sends no stop', async () => {
    const x = await chain((r) => (r.kind === 'spend' ? sleep(INSIDE) : undefined), 'owe')
    const started = Date.now()
    await x.h.bridge.stop()
    const ms = Date.now() - started
    assert.deepEqual(x.kinds(), ['connection', 'generation', 'spend'])
    assert.ok(ms >= INSIDE - 50 && ms < ONCE + MARGIN, `it waited for the top-up (${String(ms)} ms)`)
    assert.deepEqual(x.unsettled(), [])
    assert.equal(x.ledger.stopped.has(E1), false)
  })
})

describe('the holder’s words past the budget are recorded and charged before the stop, across the handover (Codex r4235620508)', () => {
  /** One request's bound in these tests: 3 attempts of 100 ms. The close's: 3 of them. */
  const ONCE = 3 * 100
  const BOUND = 3 * ONCE
  const MARGIN = 250
  const INSIDE = 250

  /**
   * Root's sequence on the real MediaBridge: a per-turn cap of 64 and a budget of 31,000; the principal's turn reserved
   * (25,000 + 2 × 64 + its 4,000 allowance: 29,128 on the API) and one chunk sent from the allowance (4.2; 3,995.8
   * left); the provider reports 2,000 used on the connection (under the 29,128 charged there, so the API's count stays
   * 29,128, as 0046's greatest(reported, charged) has it; `report` false: none); then 15,000 characters of the holder's
   * words. The bridge counts 2,000 + 25,128 + 3.2 + 5,000 = 32,131.2, past 31,000: 1 from their credit, 3,995.8 from the
   * allowance, 1,003.2 short: 1,004 is charged, and the API takes it (30,132 and the next turn's 64 stay under 31,000).
   * With no report, under a budget of 30,000 (the bridge's 30,131.2 is past it), the API's count is the bridge's: the
   * same 1,004 reaches its budget, and it refuses.
   */
  async function heardPast(opts: { report?: boolean; gate?: FakeLedger['gate']; reserveTimeoutMs?: number } = {}) {
    const maxUsageTokens = opts.report === false ? 30_000 : 31_000
    const ledger = new FakeLedger(grant({ maxOutputTokensPerTurn: 64, maxUsageTokens }))
    ledger.endsOnStop = true
    ledger.gate = opts.gate ?? null
    const h = harness(ledger, opts.reserveTimeoutMs === undefined ? {} : { reserveTimeoutMs: opts.reserveTimeoutMs })
    await h.bridge.apply([assignment(ledger.grant)])
    await settle()
    h.lives[0]?.events.setupComplete()
    h.roomEvents[0]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    assert.equal(h.lives[0]?.audio, 1, 'the chunk went once its generation was granted')
    if (opts.report !== false) h.lives[0]?.events.usage({ totalTokenCount: 2000 })
    h.lives[0]?.events.inputTranscript('x'.repeat(15_000), true)
    await settle()
    assert.deepEqual(h.stops(), ['usage'], 'the same stop as before')
    const kinds = () => ledger.asked.map((r) => r.kind)
    const spends = () => ledger.asked.filter((r) => r.kind === 'spend').map((r) => r.charge)
    const inputTurn = () => h.evidence.map((w) => w.receipt).find((r) => r.kind === 'input_turn')
    const logged = (event: string) => h.logs.filter(([e]) => e === event).map(([, d]) => d)
    return { ledger, h, kinds, spends, inputTurn, logged }
  }

  it('root’s sequence: the receipt counts the 15,000 characters, the 1,004 they leave is charged before the stop, and the API holds it: a restart gets nothing more', async () => {
    const x = await heardPast()
    await until('the stop answered', () => x.ledger.stopped.has(E1))
    assert.deepEqual(x.kinds(), ['connection', 'generation', 'spend', 'stop'], 'the debt before the stop')
    assert.deepEqual(x.spends(), [1004], 'once, the debt alone')
    assert.equal(x.ledger.committed(E1), 29_128 + 1004, 'the API holds it')
    assert.equal(x.ledger.exchanges.get(E1)?.ended, 'bridge')
    await until('the turn recorded', () => x.inputTurn() !== undefined)
    const recorded = x.inputTurn()
    assert.ok(recorded?.kind === 'input_turn')
    assert.deepEqual(
      [recorded.inputTranscriptionObserved, recorded.transcriptChars, recorded.finished],
      [true, 15_000, true],
      'the receipt counts them',
    )
    assert.equal(x.h.lives[0]?.audio, 1, 'nothing more sent')
    await x.h.bridge.stop()
    const restarted = harness(x.ledger, { lifetime: 2 })
    await restarted.bridge.apply([assignment(x.ledger.grant)])
    await settle()
    assert.equal(restarted.lives.length, 0, 'a restarted process opens nothing on the ended exchange')
    await restarted.bridge.stop()
  })

  it('with no usage report the debt reaches the API’s budget: refused, the exchange ends (usage), and the ledger handed over says lost, so a replacement stays closed', async () => {
    const x = await heardPast({ report: false })
    await until('the stop answered', () => x.ledger.stopped.has(E1))
    assert.deepEqual(x.kinds(), ['connection', 'generation', 'spend', 'stop'])
    assert.deepEqual(x.spends(), [1004], 'asked, before the stop')
    assert.equal(x.ledger.exchanges.get(E1)?.ended, 'usage', 'refused: the API ended the exchange at its budget')
    assert.equal(x.ledger.committed(E1), 29_128, 'and does not hold it')
    try {
      x.h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
      await settle()
      await x.h.bridge.apply([assignment(x.ledger.grant)])
      await until(
        'the replacement weighed what it inherited',
        () => x.logged('qualification.inherited_unsettled').length > 0,
      )
      assert.deepEqual(
        x.logged('qualification.inherited_unsettled').map((d) => [d.charges, d.lost]),
        [[0, true]],
        'nothing unanswered, and lost: closed for good',
      )
      assert.equal(x.h.lives.length, 1, 'and opened nothing')
      assert.deepEqual(x.kinds(), ['connection', 'generation', 'spend', 'stop'], 'nor asked anything')
    } finally {
      await x.h.bridge.stop()
    }
  })

  it('a top-up in flight, then the words’ debt, then the stop, each answered inside its own bound: the shutdown waits for all three', async () => {
    // A budget of 34,000, the principal's 952 chunks (3,998.4; 1.6 left, 952 prepaid for their words); the 953rd waits for
    // a top-up of 3,999, in flight; a report of 2,000; then the 15,000 characters: 952 from their credit, 4,046.4 owed,
    // 47.4 short once the top-up is credited: 48. The bridge counts 2,000 + 25,128 + 3,046.4 + 5,000 = 35,174.4, past
    // 34,000; the API holds 33,175 (and the next turn's 64): under it.
    const ledger = new FakeLedger(grant({ maxOutputTokensPerTurn: 64, maxUsageTokens: 34_000 }))
    ledger.endsOnStop = true
    ledger.gate = (r) => (r.kind === 'spend' || r.kind === 'stop' ? sleep(INSIDE) : undefined)
    const h = harness(ledger, { reserveTimeoutMs: 100 })
    await h.bridge.apply([assignment(ledger.grant)])
    await settle()
    h.lives[0]?.events.setupComplete()
    h.roomEvents[0]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    for (let i = 1; i < 953; i += 1) h.roomEvents[0]?.audio(LUIS, chunk(), 16000, 1)
    await settle()
    assert.equal(h.lives[0]?.audio, 952)
    h.lives[0]?.events.usage({ totalTokenCount: 2000 })
    h.lives[0]?.events.inputTranscript('x'.repeat(15_000), true)
    await settle()
    assert.deepEqual(h.stops(), ['usage'])
    const started = Date.now()
    await h.bridge.stop()
    const ms = Date.now() - started
    assert.deepEqual(
      ledger.asked.map((r) => [r.kind, r.charge ?? null]),
      [
        ['connection', null],
        ['generation', 29_128],
        ['spend', 3999],
        ['spend', 48],
        ['stop', null],
      ],
    )
    assert.ok(ms >= 2 * INSIDE, `it waited for the chain (${String(ms)} ms)`)
    assert.ok(ms < BOUND + MARGIN, `within its bound (${String(ms)} ms)`)
    assert.deepEqual(
      h.logs.filter(([event]) => event === 'qualification.charge_unsettled'),
      [],
    )
    assert.equal(ledger.committed(E1), 29_128 + 3999 + 48)
  })

  for (const held of [
    {
      phase: 'the debt’s spend',
      at: (r: MediaQualificationReserve) => r.kind === 'spend',
      phases: ['debt'],
      stop: 'unsent',
      inherited: 2,
      committed: 29_128,
    },
    {
      phase: 'the stop',
      at: (r: MediaQualificationReserve) => r.kind === 'stop',
      phases: [],
      stop: 'unanswered',
      inherited: 1,
      committed: 29_128 + 1004,
    },
  ]) {
    it(`${held.phase} held past the bound: the replacement inherits it unanswered${held.inherited === 1 ? ', the debt having landed' : ''}, and opens nothing`, async () => {
      let release: (() => void) | undefined
      const never = new Promise<void>((resolve) => (release = resolve))
      const x = await heardPast({ gate: (r) => (held.at(r) ? never : undefined), reserveTimeoutMs: 100 })
      try {
        const started = Date.now()
        x.h.roomEvents[0]?.connection('disconnected', 'livekit: 1')
        await settle()
        await x.h.bridge.apply([assignment(x.ledger.grant)])
        await until(
          'the replacement weighed what it inherited',
          () => x.logged('qualification.inherited_unsettled').length > 0,
        )
        const ms = Date.now() - started
        assert.ok(ms >= BOUND - 50 && ms < BOUND + MARGIN, `the close ended at its bound (${String(ms)} ms)`)
        assert.deepEqual(
          x.logged('qualification.charge_unsettled').map((d) => [d.phases, d.stop]),
          [[held.phases, held.stop]],
        )
        assert.deepEqual(
          x.logged('qualification.inherited_unsettled').map((d) => d.charges),
          [held.inherited],
        )
        assert.equal(x.ledger.committed(E1), held.committed)
        assert.deepEqual(x.spends(), [1004])
        assert.equal(x.h.lives.length, 1, 'the replacement opened nothing')
      } finally {
        release?.()
        await x.h.bridge.stop()
      }
    })
  }
})
