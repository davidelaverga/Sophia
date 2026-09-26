// RoomSession against LABELLED FAKES: FakeRoom stands in for LiveKit, FakeLive for Gemini Live, FakeService
// for the API. This is bridge-logic evidence only (S1-05A cases A06, A09–A14 and §7 holder departure); it is not a live model or media
// test and does not count toward A04/A05 acceptance.
import type { FunctionResponse } from '@google/genai'
import type { MediaAssignment, MediaToolCall, MediaToolResult } from '@sophia/contracts'
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { OUTPUT_FRAME, pcmToBase64 } from './audio.ts'
import { SETTLE_MS } from './exchange-state.ts'
import type { LiveEvents, LiveLink, LiveOptions } from './live-session.ts'
import { HOLDER_ARRIVAL_MS, HOLDER_GRACE_MS, HOLDER_RETRY_MS, PRESENCE_EVERY_MS, RoomSession } from './room-session.ts'
import type { LookTarget, RoomEvents, RoomLink, RoomPerson } from './rtc.ts'
import type { MediaService } from './service.ts'

const LUIS = '11111111-1111-4111-8111-111111111111'
const DAVIDE = '22222222-2222-4222-8222-222222222222'
const EXCHANGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TASK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const REQUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

const assignment = (over: Partial<MediaAssignment> = {}): MediaAssignment => ({
  exchangeId: EXCHANGE,
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  state: 'open',
  pauseReason: null,
  inputEpoch: 1,
  inputActorId: LUIS,
  playbackEpoch: 1,
  observationEpoch: 1,
  allowVision: true,
  looking: null,
  roomRevision: 1,
  quiesceRequestId: null,
  roomToken: { serverUrl: 'ws://fake-livekit', token: 'fake-token', expiresAt: '2026-09-25T00:10:00Z' },
  results: [],
  ...over,
})

const member = (identity: string): RoomPerson => ({ identity, standing: 'editor' })

/** FAKE LiveKit room: records what the session asks of it. */
class FakeRoom implements RoomLink {
  events: RoomEvents
  present: RoomPerson[]
  played: Int16Array[] = []
  clears = 0
  watched: Array<LookTarget | null> = []
  attributes: Array<Record<string, string>> = []
  closed = false

  constructor(events: RoomEvents, present: RoomPerson[]) {
    this.events = events
    this.present = present
  }

  people = () => this.present
  /** When set, each frame waits until the test releases it: the AudioSource's 200 ms queue is full. */
  holding = false
  private readonly held: Array<() => void> = []
  play = async (samples: Int16Array) => {
    if (this.holding) await new Promise<void>((resolve) => this.held.push(resolve))
    else await Promise.resolve()
    this.played.push(samples)
  }

  /** The room plays `n` held frames, one after the other, as real time passes. */
  async release(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      this.held.shift()?.()
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
  clearPlayback = () => {
    this.clears += 1
  }
  watch = (target: LookTarget | null) => {
    this.watched.push(target)
  }
  setState = async (attributes: Record<string, string>) => {
    await Promise.resolve()
    this.attributes.push(attributes)
  }
  close = async () => {
    await Promise.resolve()
    this.closed = true
  }

  join(people: RoomPerson[]): void {
    this.present = people
    this.events.people(people)
  }
}

/** FAKE Gemini Live connection. */
class FakeLive implements LiveLink {
  readonly options: LiveOptions
  readonly events: LiveEvents
  audio = 0
  streamEnds = 0
  frames = 0
  responses: FunctionResponse[] = []
  notices: string[] = []
  closed = false

  constructor(options: LiveOptions, events: LiveEvents) {
    this.options = options
    this.events = events
  }

  sendAudio = () => {
    this.audio += 1
  }
  sendAudioStreamEnd = () => {
    this.streamEnds += 1
  }
  sendFrame = () => {
    this.frames += 1
  }
  sendToolResponses = (r: FunctionResponse[]) => {
    this.responses.push(...r)
  }
  sendNotice = (text: string) => {
    this.notices.push(text)
  }
  close = () => {
    this.closed = true
  }
}

/** FAKE API: records media calls; tool results are scripted. */
class FakeService implements MediaService {
  presences: Array<Parameters<MediaService['presence']>[0]> = []
  acks: string[] = []
  holders: Array<Parameters<MediaService['holder']>[0]> = []
  announcedEvents: Array<Parameters<MediaService['announced']>[0]> = []
  calls: MediaToolCall[] = []
  result: MediaToolResult = { status: 'admitted', output: { workId: TASK } }

  assignments = () => Promise.reject(new Error('not used'))
  presence = async (r: Parameters<MediaService['presence']>[0]) => {
    await Promise.resolve()
    this.presences.push(r)
  }
  ackQuiesce = async (a: Parameters<MediaService['ackQuiesce']>[0]) => {
    await Promise.resolve()
    this.acks.push(a.requestId)
  }
  /** How many holder events fail before one is recorded (the API unreachable for a moment). */
  holderFailures = 0
  holder = async (e: Parameters<MediaService['holder']>[0]) => {
    await Promise.resolve()
    if (this.holderFailures > 0) {
      this.holderFailures -= 1
      throw new Error('API unreachable')
    }
    this.holders.push(e)
  }
  announced = async (e: Parameters<MediaService['announced']>[0]) => {
    await Promise.resolve()
    this.announcedEvents.push(e)
  }
  toolCall = async (c: MediaToolCall) => {
    await Promise.resolve()
    this.calls.push(c)
    return this.result
  }
}

const statusOf = (r: FunctionResponse | undefined): unknown => {
  const output: unknown = r?.response?.output
  return typeof output === 'object' && output !== null && 'status' in output ? output.status : undefined
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
/** 100 ms of the holder's microphone, just under the audible floor: a quiet room. */
const pcm16k = (n = 1600) => new Int16Array(n).fill(100)
/** 100 ms of the holder saying something. */
const voice16k = (n = 1600) => new Int16Array(n).fill(2000)
const speech = (frames = 2) => pcmToBase64(new Int16Array(OUTPUT_FRAME * frames).fill(300))
const OUT = 'audio/pcm;rate=24000'
/** `frames` 20 ms frames of Sophia's speech; frame k carries the value first + k + 1, so order and gaps show. */
const marked = (first: number, frames: number) =>
  pcmToBase64(Int16Array.from({ length: OUTPUT_FRAME * frames }, (_, j) => first + Math.floor(j / OUTPUT_FRAME) + 1))
const replyLog = () => logs.find(([event]) => event === 'audio.reply')?.[1]
const replyEnds = () => logs.filter(([event]) => event === 'audio.reply').map(([, fields]) => fields.ended)
const pick = (fields: Record<string, unknown> | undefined, ...keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, fields?.[k]]))

let clock: number
let service: FakeService
let rooms: FakeRoom[]
let lives: FakeLive[]
let order: string[]
/** Joins that fail before one succeeds (a LiveKit outage), and the tokens joins were attempted with. */
let joinFailures: number
let joinTokens: string[]
/** What the session logged: event names and fields, never content. */
let logs: Array<[string, Record<string, unknown>]>

function newSession(over: Partial<MediaAssignment>, people: RoomPerson[]) {
  return new RoomSession(assignment(over), {
    service,
    joinRoom: async (access, events) => {
      await Promise.resolve()
      joinTokens.push(access.token)
      if (joinFailures > 0) {
        joinFailures -= 1
        throw new Error('could not establish signal connection')
      }
      order.push('room')
      const room = new FakeRoom(events, people)
      rooms.push(room)
      return room
    },
    connectLive: async (options, events) => {
      await Promise.resolve()
      order.push('live')
      const live = new FakeLive(options, events)
      lives.push(live)
      return live
    },
    apiKey: 'fake-key',
    model: 'fake-model',
    bridgeInstanceId: 'bridge-test',
    now: () => clock,
    log: (event, fields) => logs.push([event, fields ?? {}]),
    every: () => () => undefined,
  })
}

async function open(over: Partial<MediaAssignment> = {}, people = [member(LUIS), member(DAVIDE)]) {
  const s = newSession(over, people)
  await s.start()
  const room = rooms.at(-1)
  const live = lives.at(-1)
  assert.ok(room && live)
  return { session: s, room, live }
}

async function ready(over: Partial<MediaAssignment> = {}, people?: RoomPerson[]) {
  const s = await open(over, people)
  s.live.events.setupComplete()
  return s
}

beforeEach(() => {
  clock = 1_000_000
  service = new FakeService()
  rooms = []
  lives = []
  order = []
  joinFailures = 0
  joinTokens = []
  logs = []
})

describe('room session: who Google hears (cases A10, A11)', () => {
  it('joins the room before connecting Google, and forwards nothing until the provider is ready', async () => {
    const { session, room, live } = await open()
    assert.deepEqual(order, ['room', 'live'])
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 0)
    assert.equal(session.observed().input, 'closed')
    live.events.setupComplete()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 1)
    assert.equal(session.observed().input, 'admitted')
  })

  it('forwards only the holder’s microphone', async () => {
    const { room, live } = await ready()
    room.events.audio(DAVIDE, pcm16k(), 16000, 1)
    assert.equal(live.audio, 0)
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 1)
  })

  it('a handoff ends the old holder’s stream, settles, and keeps the old speaker on a late tool call', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    session.update(assignment({ inputEpoch: 2, inputActorId: DAVIDE }))
    assert.equal(live.streamEnds, 1)
    room.events.audio(DAVIDE, pcm16k(), 16000, 1)
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 1, 'nobody is heard while the old turn settles')
    live.events.toolCalls([{ id: 'late-1', name: 'start_brief', args: { instruction: 'Draft it' } }])
    await flush()
    assert.equal(service.calls[0]?.actorId, LUIS)
    assert.equal(service.calls[0]?.inputEpoch, 1)
    live.events.turnComplete()
    room.events.audio(DAVIDE, pcm16k(), 16000, 1)
    assert.equal(live.audio, 2)
  })

  it('a settle that times out while the old turn still speaks cancels that turn’s output', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.audio(speech(), OUT)
    session.update(assignment({ inputEpoch: 2, inputActorId: DAVIDE }))
    session.tick()
    clock += SETTLE_MS
    const clears = room.clears
    session.tick()
    assert.equal(room.clears, clears + 1)
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(session.observed().output, 'playing', 'only what was queued before the cut played')
    const played = room.played.length
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(room.played.length, played, 'the rest of the cancelled turn is dropped')
  })

  it('a handoff cuts what is still playing of the old holder’s finished reply once it settles', async () => {
    const { session, room, live } = await ready()
    room.holding = true
    // Google streamed the whole 10 s reply and ended its turn: nothing is pending, but most of it is still to play.
    for (let i = 0; i < 500; i += 2) live.events.audio(marked(i, 2), OUT)
    live.events.turnComplete()
    await room.release(10)
    session.update(assignment({ inputEpoch: 2, inputActorId: DAVIDE }))
    session.tick()
    const clears = room.clears
    clock += SETTLE_MS - 1
    session.tick()
    assert.equal(room.clears, clears, 'it plays on while the handoff settles')
    clock += 1
    session.tick()
    assert.equal(room.clears, clears + 1, 'and not over the new holder')
    await room.release(20)
    assert.ok(room.played.length <= 11, 'at most the frame already handed to the room plays after the cut')
    assert.deepEqual(pick(replyLog(), 'ended', 'playedMs', 'clearedMs'), {
      ended: 'stopped',
      playedMs: 200,
      clearedMs: (500 - 10 - 1) * 20,
    })
  })

  it('a handoff whose old turn ends before the next tick still cuts what of it is left to play', async () => {
    const { session, room, live } = await ready()
    room.holding = true
    for (let i = 0; i < 500; i += 2) live.events.audio(marked(i, 2), OUT)
    await room.release(10)
    session.update(assignment({ inputEpoch: 2, inputActorId: DAVIDE }))
    live.events.turnComplete()
    const clears = room.clears
    session.tick()
    assert.equal(room.clears, clears + 1)
  })
})

describe('room session: Sophia’s output (case A09)', () => {
  it('a long reply that arrives faster than it plays is heard whole and in order (CX-0045)', async () => {
    const { room, live } = await ready()
    room.holding = true
    const frames = 10 * 50
    // Google's burst: 10 s of speech in 40 ms chunks, all before the room has played a frame; then its turn ends.
    for (let i = 0; i < frames; i += 2) live.events.audio(marked(i, 2), OUT)
    live.events.turnComplete()
    await flush()
    assert.equal(replyLog(), undefined, 'not logged while the reply is still playing')
    await room.release(frames)
    assert.equal(room.played.length, frames)
    assert.deepEqual(
      room.played.map((f) => f[0]),
      Array.from({ length: frames }, (_, i) => i + 1),
      'every frame played once, in order',
    )
    const figures = replyLog()
    assert.ok(figures)
    assert.deepEqual(
      { ...figures, maxQueuedMs: Number(figures.maxQueuedMs) >= 9900 },
      {
        exchangeId: EXCHANGE,
        ended: 'played',
        turns: 1,
        receivedMs: 10_000,
        arrivalMs: 0,
        playedMs: 10_000,
        droppedMs: 0,
        clearedMs: 0,
        maxQueuedMs: true,
      },
    )
  })

  it('Stop Speaking in the middle of a long reply still silences it at once, and the log says what was cut', async () => {
    const { session, room, live } = await ready()
    room.holding = true
    for (let i = 0; i < 500; i += 2) live.events.audio(marked(i, 2), OUT)
    await room.release(10)
    session.update(assignment({ playbackEpoch: 2 }))
    await room.release(20)
    assert.ok(room.played.length <= 11, 'at most the frame already handed to the room plays after the stop')
    assert.deepEqual(replyLog(), {
      exchangeId: EXCHANGE,
      ended: 'stopped',
      turns: 1,
      receivedMs: 10_000,
      arrivalMs: 0,
      playedMs: 200,
      droppedMs: 0,
      clearedMs: (500 - 10 - 1) * 20,
      maxQueuedMs: (500 - 1) * 20,
    })
  })

  it('the holder talking over a finished reply that is still playing cuts the rest of it, as barge-in would', async () => {
    const { room, live } = await ready()
    room.holding = true
    for (let i = 0; i < 500; i += 2) live.events.audio(marked(i, 2), OUT)
    live.events.turnComplete()
    await room.release(10)
    const clears = room.clears
    room.events.audio(LUIS, voice16k(), 16000, 1)
    assert.equal(room.clears, clears, 'sound alone does not cut her')
    live.events.inputTranscript('wait, one thing', false)
    assert.equal(room.clears, clears + 1, 'words over her reply cut it at once: Google sends no interrupted now')
    await room.release(20)
    assert.ok(room.played.length <= 11)
    assert.deepEqual(pick(replyLog(), 'ended', 'playedMs'), { ended: 'interrupted', playedMs: 200 })
    room.holding = false
    const played = room.played.length
    live.events.audio(speech(2), OUT)
    await flush()
    await flush()
    assert.equal(room.played.length, played + 2, 'the answer to what they said plays')
  })

  it('a transcript that arrives after the turn ended, with no sound from the holder since, cuts nothing', async () => {
    const { room, live } = await ready()
    room.events.audio(LUIS, voice16k(), 16000, 1)
    room.holding = true
    for (let i = 0; i < 50; i += 2) live.events.audio(marked(i, 2), OUT)
    live.events.turnComplete()
    const clears = room.clears
    live.events.inputTranscript('what is the status', true)
    await room.release(50)
    assert.equal(room.clears, clears)
    assert.equal(room.played.length, 50)
    assert.equal(replyLog()?.ended, 'played')
  })

  it('a turn that starts before the last one played out is logged with it, once both have played', async () => {
    const { room, live } = await ready()
    room.holding = true
    live.events.audio(marked(0, 4), OUT)
    live.events.turnComplete()
    live.events.audio(marked(4, 2), OUT)
    await room.release(6)
    assert.deepEqual(
      room.played.map((f) => f[0]),
      [1, 2, 3, 4, 5, 6],
    )
    assert.equal(replyLog(), undefined, 'the second turn has not ended: nothing is logged early')
    live.events.turnComplete()
    assert.deepEqual(replyLog(), {
      exchangeId: EXCHANGE,
      ended: 'played',
      turns: 2,
      receivedMs: 120,
      arrivalMs: 0,
      playedMs: 120,
      droppedMs: 0,
      clearedMs: 0,
      maxQueuedMs: 100,
    })
  })

  it('a reply’s last partial frame plays, padded with silence, and nothing of it reaches the next reply', async () => {
    const { room, live } = await ready()
    live.events.audio(pcmToBase64(new Int16Array(OUTPUT_FRAME * 2 + 240).fill(300)), OUT)
    live.events.turnComplete()
    await flush()
    await flush()
    assert.equal(room.played.length, 3)
    assert.deepEqual([room.played[2]?.[239], room.played[2]?.[240]], [300, 0])
    assert.deepEqual(pick(replyLog(), 'ended', 'receivedMs', 'playedMs'), {
      ended: 'played',
      receivedMs: 50,
      playedMs: 60,
    })
    live.events.audio(marked(100, 1), OUT)
    await flush()
    await flush()
    assert.deepEqual(
      [room.played.length, room.played[3]?.[0]],
      [4, 101],
      'the next reply starts with its own first sample',
    )
  })

  it('closing the session mid-reply logs what was cut', async () => {
    const { session, room, live } = await ready()
    room.holding = true
    live.events.audio(marked(0, 10), OUT)
    await room.release(2)
    await session.close()
    assert.deepEqual(pick(replyLog(), 'ended', 'playedMs', 'clearedMs'), {
      ended: 'closed',
      playedMs: 40,
      clearedMs: 140,
    })
  })

  it('plays at 24 kHz and reports playing only once frames reached the room', async () => {
    const { session, room, live } = await ready()
    live.events.audio(speech(2), OUT)
    assert.equal(session.observed().output, 'responding')
    await flush()
    await flush()
    assert.equal(room.played.length, 2)
    assert.equal(session.observed().output, 'playing')
    clock += 1000
    live.events.turnComplete()
    assert.equal(session.observed().output, 'idle')
  })

  it('refuses output that is not 24 kHz PCM rather than relabelling it', async () => {
    const { session, room, live } = await ready()
    live.events.audio(speech(), 'audio/pcm;rate=16000')
    live.events.audio(speech(), 'audio/webm')
    await flush()
    assert.equal(room.played.length, 0)
    assert.equal(session.observed().output, 'idle')
  })

  it('Stop Speaking before the first audio chunk still silences the reply on its way', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.inputTranscript('what is the status', true)
    session.update(assignment({ playbackEpoch: 2 }))
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(room.played.length, 0, 'the stopped reply is dropped even though it had not started')
    live.events.turnComplete()
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > 0, 'the next reply plays')
  })

  it('Stop Speaking after the holder spoke, before Google transcribed a word, still silences the reply', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, voice16k(), 16000, 1)
    session.update(assignment({ playbackEpoch: 2 }))
    live.events.inputTranscript('what is the status', true)
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(room.played.length, 0, 'the reply to what was said before the stop is dropped')
    assert.deepEqual(
      logs.filter(([event]) => event === 'audio.reply_fenced').map(([, fields]) => fields.because),
      ['sound'],
      'the fence says why it was set',
    )
    live.events.turnComplete()
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > 0, 'the next reply plays')
  })

  it('Stop Speaking with no reply pending does not silence the next one', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    session.update(assignment({ playbackEpoch: 2 }))
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > 0, 'a quiet microphone asked nothing')
  })

  it('a stop while a finished reply is still playing does not fence the next one', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, voice16k(), 16000, 1)
    live.events.audio(speech(), OUT)
    await flush()
    live.events.turnComplete()
    session.update(assignment({ playbackEpoch: 2 }))
    await flush()
    const played = room.played.length
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > played, 'what was said had been answered in full')
  })

  it('sound the holder made long before the stop, never answered, does not fence the next reply', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, voice16k(), 16000, 1)
    clock += 8001
    session.update(assignment({ playbackEpoch: 2 }))
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > 0)
  })

  it('a stopped reply stays silenced however long the provider stalls, until its turn ends', async () => {
    const { session, room, live } = await ready()
    live.events.audio(speech(), OUT)
    await flush()
    session.update(assignment({ playbackEpoch: 2 }))
    const played = room.played.length
    clock += 20_000
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(room.played.length, played, 'the rest of the stopped reply, 20 s later, is still dropped')
    live.events.turnComplete()
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > played, 'the next reply plays')
  })

  it('a reply that begins within the wait after a stop is dropped to its end, even across a stall', async () => {
    const { session, room, live } = await ready()
    live.events.inputTranscript('what is the status', true)
    session.update(assignment({ playbackEpoch: 2 }))
    clock += 7000
    live.events.audio(speech(), OUT)
    clock += 5000
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(room.played.length, 0)
  })

  it('the fence lapses when the stopped reply never comes', async () => {
    const { session, room, live } = await ready()
    live.events.inputTranscript('hello?', true)
    session.update(assignment({ playbackEpoch: 2 }))
    clock += 8001
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > 0, 'a later reply is not swallowed by an old stop')
  })

  it('Stop Speaking clears the source and drops the rest of the turn, without touching work', async () => {
    const { session, room, live } = await ready()
    live.events.audio(speech(), OUT)
    await flush()
    const clears = room.clears
    session.update(assignment({ playbackEpoch: 2 }))
    assert.equal(room.clears, clears + 1)
    const played = room.played.length
    live.events.audio(speech(), OUT)
    await flush()
    assert.equal(room.played.length, played, 'late audio of the stopped turn is not played')
    live.events.turnComplete()
    live.events.audio(speech(), OUT)
    await flush()
    assert.ok(room.played.length > played, 'the next turn plays')
    assert.equal(service.calls.length, 0, 'no work control was issued')
  })

  it('provider barge-in clears queued output', async () => {
    const { room, live } = await ready()
    live.events.audio(speech(), OUT)
    const clears = room.clears
    live.events.interrupted()
    assert.equal(room.clears, clears + 1)
  })
})

describe('room session: tools (cases A10, A13)', () => {
  it('runs an attributed call for the holder and answers with a real work id at once', async () => {
    const { room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.toolCalls([{ id: 'call-1', name: 'start_brief', args: { instruction: 'Draft the brief' } }])
    await flush()
    assert.equal(service.calls.length, 1)
    assert.equal(service.calls[0]?.actorId, LUIS)
    assert.equal(service.calls[0]?.callId, 'call-1')
    assert.deepEqual(live.responses[0]?.response, { output: { status: 'admitted', workId: TASK } })
    assert.equal(live.responses[0]?.willContinue, false)
    const answered = logs.find(([event]) => event === 'tool.answered')?.[1]
    assert.deepEqual(
      [answered?.name, answered?.status, answered?.workId],
      ['start_brief', 'admitted', TASK],
      'the log ties the call to the work it started, without its text',
    )
    assert.equal(JSON.stringify(logs).includes('Draft the brief'), false)
  })

  it('an unattributed call is a question, never an action', async () => {
    const { live } = await ready()
    live.events.toolCalls([{ id: 'call-2', name: 'start_brief', args: { instruction: 'x' } }])
    await flush()
    assert.equal(service.calls.length, 0)
    assert.equal(statusOf(live.responses[0]), 'clarify')
  })

  it('an unknown tool is refused without reaching the API', async () => {
    const { room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.toolCalls([{ id: 'call-3', name: 'start_image_job', args: {} }])
    await flush()
    assert.equal(service.calls.length, 0)
    assert.equal(statusOf(live.responses[0]), 'error')
  })

  it('a cancelled call, or one from a replaced connection, is not answered', async () => {
    const { room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.toolCalls([{ id: 'call-4', name: 'project_status', args: {} }])
    live.events.toolCancellations(['call-4'])
    await flush()
    assert.equal(live.responses.length, 0)
    live.events.toolCalls([{ id: 'call-5', name: 'project_status', args: {} }])
    live.events.goAway('5s')
    await flush()
    assert.equal(live.responses.length, 0, 'the old connection is gone; its call is never answered on a new one')
  })
})

describe('room session: provider recovery (case A14)', () => {
  it('a slow result for a call of the old connection is never answered on the new one', async () => {
    const { session, room, live } = await ready()
    let release: ((r: MediaToolResult) => void) | undefined
    service.toolCall = async (c) => {
      service.calls.push(c)
      return new Promise<MediaToolResult>((resolve) => {
        release = resolve
      })
    }
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.toolCalls([{ id: 'slow-1', name: 'start_brief', args: { instruction: 'Draft it' } }])
    await flush()
    live.events.goAway('1s')
    clock += 1000
    session.tick()
    await flush()
    const next = lives.at(-1)
    assert.ok(next && next !== live)
    next.events.setupComplete()
    release?.({ status: 'admitted', output: { workId: TASK } })
    await flush()
    assert.equal(next.responses.length, 0)
    assert.equal(live.responses.length, 0)
  })

  it('on GoAway: stale output stops, audio waits for the new connection, which resumes with the latest handle', async () => {
    const { session, room, live } = await ready()
    live.events.resumption('handle-2', true)
    live.events.audio(speech(), OUT)
    live.events.goAway('10s')
    assert.equal(live.closed, true)
    assert.equal(session.observed().voice, 'recovering')
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 0)
    clock += 1000
    session.tick()
    await flush()
    const next = lives.at(-1)
    assert.ok(next && next !== live)
    assert.equal(next.options.resumptionHandle, 'handle-2')
    assert.doesNotMatch(next.options.systemInstruction, /restored without/)
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(next.audio, 0, 'not before the new connection is ready')
    next.events.setupComplete()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(next.audio, 1)
    live.events.audio(speech(), OUT)
    live.events.toolCalls([{ id: 'stale', name: 'project_status', args: {} }])
    await flush()
    assert.equal(service.calls.length, 0, 'events of the old connection are ignored')
  })

  it('a reconnect lets a reply Google finished play out, and cuts one it was still sending', async () => {
    const { session, room, live } = await ready()
    room.holding = true
    for (let i = 0; i < 100; i += 2) live.events.audio(marked(i, 2), OUT)
    live.events.turnComplete()
    await room.release(10)
    const clears = room.clears
    live.events.goAway('10s')
    assert.equal(room.clears, clears, 'the finished reply is already here')
    await room.release(100)
    assert.equal(room.played.length, 100)
    clock += 1000
    session.tick()
    await flush()
    const next = lives.at(-1)
    assert.ok(next && next !== live)
    next.events.setupComplete()
    next.events.audio(speech(4), OUT)
    next.events.goAway('10s')
    assert.equal(room.clears, clears + 1, 'a reply cut off mid-turn stops')
    assert.deepEqual(replyEnds(), ['played', 'recovered'])
  })

  it('a call Google repeats on a resumed connection keeps its identity, so the API admits it once', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.resumption('handle-2', true)
    live.events.toolCalls([{ id: 'call-1', name: 'start_brief', args: { instruction: 'Draft it' } }])
    await flush()
    live.events.goAway('5s')
    clock += 1000
    session.tick()
    await flush()
    const resumed = lives.at(-1)
    assert.ok(resumed && resumed !== live)
    assert.equal(resumed.options.resumptionHandle, 'handle-2')
    resumed.events.setupComplete()
    resumed.events.toolCalls([{ id: 'call-1', name: 'start_brief', args: { instruction: 'Draft it' } }])
    await flush()
    assert.equal(service.calls.length, 2)
    const [first, repeated] = service.calls
    assert.deepEqual(
      [repeated?.callId, repeated?.connectionGeneration],
      [first?.callId, first?.connectionGeneration],
      'the same call, the same identity',
    )
  })

  it('a cold start is a new Google session: its calls cannot collide with the old one’s', async () => {
    const { session, room, live } = await ready()
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.toolCalls([{ id: 'call-1', name: 'project_status', args: {} }])
    await flush()
    live.events.closed('network lost')
    clock += 1000
    session.tick()
    await flush()
    const cold = lives.at(-1)
    assert.ok(cold && cold !== live)
    assert.equal(cold.options.resumptionHandle, null)
    cold.events.setupComplete()
    cold.events.toolCalls([{ id: 'call-1', name: 'project_status', args: {} }])
    await flush()
    const [first, second] = service.calls
    assert.notEqual(second?.connectionGeneration, first?.connectionGeneration)
  })

  it('a handle that keeps failing is dropped and the next connection starts cold, saying so', async () => {
    const { session, live } = await ready()
    live.events.resumption('bad-handle', true)
    live.events.closed('error: 1011')
    clock += 1000
    session.tick()
    await flush()
    lives.at(-1)?.events.closed('error: resumption failed')
    clock += 2000
    session.tick()
    await flush()
    const cold = lives.at(-1)
    assert.equal(cold?.options.resumptionHandle, null)
    assert.match(cold?.options.systemInstruction ?? '', /restored without the earlier conversation/)
  })

  it('reports unavailable after repeated failures', async () => {
    const { session } = await ready()
    for (let i = 0; i < 6; i += 1) {
      lives.at(-1)?.events.closed('error')
      clock += 10_000
      session.tick()
      await flush()
    }
    assert.equal(session.observed().voice, 'unavailable')
  })
})

describe('room session: joining the room', () => {
  it('retries a failed first join with backoff and the latest token, then connects Google', async () => {
    joinFailures = 1
    const s = newSession({}, [member(LUIS)])
    await s.start()
    assert.equal(rooms.length, 0)
    assert.equal(lives.length, 0, 'Google waits for the room')
    assert.equal(s.observed().voice, 'unavailable')
    s.update(
      assignment({ roomRevision: 2, roomToken: { serverUrl: 'ws://fake-livekit', token: 'fresh', expiresAt: 'x' } }),
    )
    clock += 999
    s.tick()
    await flush()
    assert.equal(joinTokens.length, 1, 'not before the backoff')
    clock += 1
    s.tick()
    await flush()
    await flush()
    assert.deepEqual(joinTokens, ['fake-token', 'fresh'], 'the retry uses the newest token')
    assert.equal(rooms.length, 1)
    assert.equal(lives.length, 1)
    lives[0]?.events.setupComplete()
    assert.equal(s.observed().voice, 'ready')
  })

  it('a session closed while its join is in flight leaves the room at once', async () => {
    const s = newSession({}, [member(LUIS)])
    const started = s.start()
    await s.close()
    await started
    assert.equal(rooms.at(-1)?.closed ?? true, true)
    assert.equal(lives.length, 0)
  })
})

describe('room session: guests (case A12)', () => {
  it('a guest joining pauses input and clears output at once, before the API pause arrives', async () => {
    const { session, room, live } = await ready()
    live.events.audio(speech(), OUT)
    const clears = room.clears
    room.join([member(LUIS), { identity: 'guest-1', standing: 'guest' }])
    assert.equal(session.observed().input, 'paused')
    assert.equal(room.clears, clears + 1)
    assert.equal(live.streamEnds, 1)
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 0)
    session.tick()
    await flush()
    assert.deepEqual(service.presences.at(-1)?.participants, [member(LUIS), { identity: 'guest-1', standing: 'guest' }])
  })

  it('a participant of unsigned standing counts as a guest', async () => {
    const { session, room } = await ready()
    room.join([member(LUIS), { identity: 'who', standing: 'unknown' }])
    assert.equal(session.observed().input, 'paused')
  })

  it('acknowledges a quiesce request only once input is closed and output cleared', async () => {
    const { session } = await ready()
    session.update(assignment({ state: 'paused', pauseReason: 'guest', quiesceRequestId: REQUEST }))
    await flush()
    assert.deepEqual(service.acks, [REQUEST])
    session.update(assignment({ state: 'paused', pauseReason: 'guest', quiesceRequestId: REQUEST, roomRevision: 2 }))
    await flush()
    assert.deepEqual(service.acks, [REQUEST], 'acknowledged once')
  })

  it('never acknowledges a quiesce request while the exchange is open', async () => {
    const { session } = await ready()
    session.update(assignment({ quiesceRequestId: REQUEST, roomRevision: 2 }))
    await flush()
    assert.deepEqual(service.acks, [])
  })

  it('a fresh session for a paused exchange acknowledges once it joined the room, before it even joins Google', async () => {
    await open({ state: 'paused', pauseReason: 'guest', quiesceRequestId: REQUEST })
    await flush()
    assert.deepEqual(service.acks, [REQUEST])
  })

  it('acknowledges only from inside the room: not after a failed join, and once a retry joins', async () => {
    joinFailures = 1
    const s = newSession({ state: 'paused', pauseReason: 'guest', quiesceRequestId: REQUEST }, [member(LUIS)])
    await s.start()
    await flush()
    assert.deepEqual(service.acks, [], 'not in the room, so it cannot speak for it')
    clock += 1000
    s.tick()
    await flush()
    await flush()
    assert.equal(rooms.length, 1)
    assert.deepEqual(service.acks, [REQUEST])
  })

  it('a bridge reconnecting to the room acknowledges once it is connected again', async () => {
    const { session, room } = await ready()
    room.events.connection('reconnecting', null)
    session.update(assignment({ state: 'paused', pauseReason: 'guest', quiesceRequestId: REQUEST, roomRevision: 2 }))
    await flush()
    assert.deepEqual(service.acks, [], 'not while its room connection is down')
    room.events.connection('connected', null)
    await flush()
    assert.deepEqual(service.acks, [REQUEST])
  })

  it('a room reconnect closes input locally and reports nothing until presence is known again', async () => {
    const { session, room } = await ready()
    session.tick()
    await flush()
    const reports = service.presences.length
    room.events.connection('reconnecting', null)
    assert.equal(session.observed().input, 'paused')
    clock += PRESENCE_EVERY_MS
    session.tick()
    await flush()
    assert.equal(service.presences.length, reports)
    room.events.connection('connected', null)
    assert.equal(session.observed().input, 'admitted')
  })
})

describe('room session: holder departure (S1-05A §7)', () => {
  it('reports left at once and gone after the grace; the floor is cleared by compare-and-set in the API', async () => {
    const { session, room, live } = await ready()
    room.join([member(DAVIDE)])
    await flush()
    assert.deepEqual(
      service.holders.map((h) => [h.event, h.actorId, h.inputEpoch]),
      [['left', LUIS, 1]],
    )
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    assert.equal(live.audio, 0, 'forwarding stopped immediately')
    clock += HOLDER_GRACE_MS - 1
    session.tick()
    await flush()
    assert.equal(service.holders.length, 1)
    clock += 1
    session.tick()
    session.tick()
    await flush()
    assert.deepEqual(
      service.holders.map((h) => h.event),
      ['left', 'gone'],
    )
  })

  it('a holder back within the grace is not cleared (and listening does not silently reopen: the API paused it)', async () => {
    const { session, room } = await ready()
    room.join([member(DAVIDE)])
    clock += 2000
    room.join([member(LUIS), member(DAVIDE)])
    clock += HOLDER_GRACE_MS
    session.tick()
    await flush()
    assert.deepEqual(
      service.holders.map((h) => h.event),
      ['left'],
    )
  })

  it('a holder not in the room when the bridge joins is given time to arrive, not reported as leaving (CX-0044)', async () => {
    const { session, room } = await ready({}, [member(DAVIDE)])
    await flush()
    assert.deepEqual(service.holders, [], 'no left the moment the bridge joins')
    clock += HOLDER_ARRIVAL_MS - 1
    session.tick()
    await flush()
    assert.deepEqual(service.holders, [])
    room.join([member(LUIS), member(DAVIDE)])
    clock += HOLDER_ARRIVAL_MS + HOLDER_GRACE_MS
    session.tick()
    await flush()
    assert.deepEqual(service.holders, [], 'arrived in time: never paused')
  })

  it('a holder who never arrives is reported left after the arrival grace, then gone, and the log says so', async () => {
    const { session } = await ready({}, [member(DAVIDE)])
    clock += HOLDER_ARRIVAL_MS
    session.tick()
    await flush()
    assert.deepEqual(
      service.holders.map((h) => [h.event, h.actorId, h.inputEpoch]),
      [['left', LUIS, 1]],
    )
    assert.deepEqual(logs.find(([event]) => event === 'holder.absent')?.[1], {
      exchangeId: EXCHANGE,
      inputEpoch: 1,
      departed: false,
      people: 1,
    })
    clock += HOLDER_GRACE_MS
    session.tick()
    await flush()
    assert.deepEqual(
      service.holders.map((h) => h.event),
      ['left', 'gone'],
    )
  })

  it('judges no one while its own room link is down; after it, the holder gets the arrival grace', async () => {
    const { session, room } = await ready()
    room.events.connection('reconnecting', null)
    room.join([member(DAVIDE)])
    clock += HOLDER_GRACE_MS
    session.tick()
    await flush()
    assert.deepEqual(service.holders, [], 'nothing reported while the bridge itself was reconnecting')
    room.events.connection('connected', null)
    session.tick()
    await flush()
    assert.deepEqual(service.holders, [], 'back, but the holder not listed yet: an arrival, not a departure')
    room.join([member(LUIS), member(DAVIDE)])
    clock += HOLDER_ARRIVAL_MS
    session.tick()
    await flush()
    assert.deepEqual(service.holders, [])
  })

  it('a left the API did not record is sent again after a wait, once', async () => {
    const { session, room } = await ready()
    service.holderFailures = 1
    room.join([member(DAVIDE)])
    await flush()
    assert.equal(service.holders.length, 0, 'the first attempt failed')
    clock += HOLDER_RETRY_MS - 1
    session.tick()
    await flush()
    assert.equal(service.holders.length, 0, 'not again on every tick')
    clock += 1
    session.tick()
    await flush()
    session.tick()
    await flush()
    assert.deepEqual(
      service.holders.map((h) => h.event),
      ['left'],
    )
  })

  it('a flapping room link neither repeats a reported left nor puts off the gone', async () => {
    const { session, room } = await ready()
    room.join([member(DAVIDE)])
    for (let i = 0; i < 5; i += 1) {
      room.events.connection('reconnecting', null)
      clock += 500
      session.tick()
      room.events.connection('connected', null)
      clock += 500
      session.tick()
    }
    await flush()
    assert.deepEqual(
      service.holders.map((h) => h.event),
      ['left', 'gone'],
    )
  })

  it('a holder still awaited when the link blips is not judged on the time the bridge could not see', async () => {
    const { session, room } = await ready({}, [member(DAVIDE)])
    clock += HOLDER_ARRIVAL_MS - 1000
    room.events.connection('reconnecting', null)
    clock += 500
    room.events.connection('connected', null)
    clock += 999
    session.tick()
    await flush()
    assert.equal(service.holders.length, 0, 'the half second the link was down does not count')
    clock += 1
    session.tick()
    await flush()
    assert.deepEqual(
      service.holders.map((h) => h.event),
      ['left'],
      'but a flapping link does not put it off for good',
    )
  })

  it('a new holder in the room at the handoff who then leaves is paused at once, not waited for', async () => {
    const { session, room } = await ready()
    session.update(assignment({ inputEpoch: 2, inputActorId: DAVIDE }))
    room.join([member(LUIS)])
    await flush()
    assert.deepEqual(
      service.holders.map((h) => [h.event, h.actorId, h.inputEpoch]),
      [['left', DAVIDE, 2]],
    )
  })
})

describe('room session: vision (case A11)', () => {
  it('sends only the selected source, at most once a second, and nothing after Stop Looking', async () => {
    const looking = { participantIdentity: LUIS, source: 'screen' as const }
    const { session, room, live } = await ready({ looking, observationEpoch: 2 })
    assert.deepEqual(room.watched.at(-1), looking)
    const img = { rgba: new Uint8Array(16).fill(1), width: 2, height: 2 }
    room.events.frame(DAVIDE, 'screen', img, clock)
    room.events.frame(LUIS, 'camera', img, clock)
    session.tick()
    assert.equal(live.frames, 0)
    room.events.frame(LUIS, 'screen', img, clock)
    session.tick()
    assert.equal(live.frames, 1)
    room.events.frame(LUIS, 'screen', img, clock)
    session.tick()
    assert.equal(live.frames, 1, 'not twice in a second')
    session.update(assignment({ looking: null, observationEpoch: 3 }))
    assert.equal(room.watched.at(-1), null)
    clock += 2000
    room.events.frame(LUIS, 'screen', img, clock)
    session.tick()
    assert.equal(live.frames, 1)
  })
})

describe('room session: finished work (case A06)', () => {
  it('announces a finished brief once, when Sophia is idle, as an unattributed turn', async () => {
    const results = [{ taskId: TASK, resultRevision: 1, kind: 'draft_brief' as const }]
    const { session, room, live } = await ready({ results })
    room.events.audio(LUIS, pcm16k(), 16000, 1)
    live.events.audio(speech(), OUT)
    session.tick()
    assert.equal(live.notices.length, 0, 'not while Sophia is responding')
    live.events.turnComplete()
    session.tick()
    assert.equal(live.notices.length, 0, 'not while her last reply is still to play')
    await flush()
    await flush()
    clock += 1000
    session.tick()
    assert.equal(live.notices.length, 1)
    assert.match(live.notices[0] ?? '', new RegExp(TASK))
    assert.deepEqual(service.announcedEvents, [], 'sent is not heard')
    live.events.audio(speech(), OUT)
    await flush()
    await flush()
    assert.deepEqual(service.announcedEvents, [{ exchangeId: EXCHANGE, taskId: TASK, resultRevision: 1 }])
    live.events.toolCalls([{ id: 'after-notice', name: 'control_work', args: { taskId: TASK, action: 'stop' } }])
    await flush()
    assert.equal(service.calls.length, 0, 'a tool call in the notice turn is not attributed to anyone')
    live.events.turnComplete()
    session.update(assignment({ results, roomRevision: 2 }))
    clock += 1000
    session.tick()
    assert.equal(live.notices.length, 1, 'announced once')
  })

  it('a notice lost with the provider before anyone heard it is sent again, and recorded once heard', async () => {
    const results = [{ taskId: TASK, resultRevision: 1, kind: 'draft_brief' as const }]
    const { session, live } = await ready({ results })
    session.tick()
    assert.equal(live.notices.length, 1)
    live.events.closed('network lost')
    assert.deepEqual(service.announcedEvents, [], 'nobody heard it')
    clock += 1000
    session.tick()
    await flush()
    const next = lives.at(-1)
    assert.ok(next && next !== live)
    next.events.setupComplete()
    session.tick()
    assert.equal(next.notices.length, 1, 'sent again on the new connection')
    next.events.audio(speech(), OUT)
    await flush()
    await flush()
    assert.deepEqual(service.announcedEvents, [{ exchangeId: EXCHANGE, taskId: TASK, resultRevision: 1 }])
  })

  it('a heard notice whose receipt failed is recorded again later, and is not announced twice', async () => {
    const results = [{ taskId: TASK, resultRevision: 1, kind: 'draft_brief' as const }]
    const { session, live } = await ready({ results })
    let failures = 1
    service.announced = async (e) => {
      await Promise.resolve()
      if (failures > 0) {
        failures -= 1
        throw new Error('503 from the API')
      }
      service.announcedEvents.push(e)
    }
    session.tick()
    live.events.audio(speech(), OUT)
    await flush()
    await flush()
    assert.deepEqual(service.announcedEvents, [], 'the first receipt failed')
    live.events.turnComplete()
    clock += 5000
    session.tick()
    await flush()
    assert.deepEqual(service.announcedEvents, [{ exchangeId: EXCHANGE, taskId: TASK, resultRevision: 1 }])
    assert.equal(live.notices.length, 1, 'recorded again, not announced again')
  })

  it('a notice answered with silence three times is left for a later session, unrecorded', async () => {
    const results = [{ taskId: TASK, resultRevision: 1, kind: 'draft_brief' as const }]
    const { session, live } = await ready({ results })
    for (let i = 0; i < 4; i += 1) {
      session.tick()
      live.events.turnComplete()
    }
    assert.equal(live.notices.length, 3)
    assert.deepEqual(service.announcedEvents, [])
  })

  it('does not announce while paused for a guest', async () => {
    const results = [{ taskId: TASK, resultRevision: 1, kind: 'draft_brief' as const }]
    const { session, room, live } = await ready({ results })
    room.join([member(LUIS), { identity: 'guest-1', standing: 'guest' }])
    session.tick()
    assert.equal(live.notices.length, 0)
  })
})

describe('room session: what the room is told', () => {
  it('publishes observed state as attributes, without content, and reports presence', async () => {
    const { session, room } = await ready()
    session.tick()
    await flush()
    assert.deepEqual(room.attributes.at(-1), {
      'sophia.voice': 'ready',
      'sophia.input': 'admitted',
      'sophia.output': 'idle',
      'sophia.inputEpoch': '1',
    })
    const report = service.presences.at(-1)
    assert.equal(report?.voice, 'ready')
    assert.equal(report?.bridgeInstanceId, 'bridge-test')
  })

  it('closing the session leaves the room and closes Google, and touches no work', async () => {
    const { session, room, live } = await ready()
    await session.close()
    assert.equal(room.closed, true)
    assert.equal(live.closed, true)
    assert.equal(service.calls.length, 0)
  })
})
