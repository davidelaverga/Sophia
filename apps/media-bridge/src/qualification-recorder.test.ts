// The bridge's voice qualification receipts (qualification-recorder.ts, A15): pure, with a fixed clock and provider
// session id. Each receipt is compared whole, so a field A15 does not declare, or a word, fails the comparison.
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { VoiceQualification } from '@sophia/contracts'
import type { Attribution } from './exchange-state.ts'
import { QualificationRecorder, type Receipt, Sha256Chain } from './qualification-recorder.ts'

const PRINCIPAL = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SESSION = '33333333-3333-4333-8333-333333333333'
const RESUMED_ELSEWHERE = '44444444-4444-4444-8444-444444444444'
const GRANT: VoiceQualification = {
  grantId: '77777777-7777-4777-8777-777777777777',
  runBindingSha256: 'ab'.repeat(32),
  principalActorId: PRINCIPAL,
  deadline: '2026-10-09T12:15:00.000Z',
  maxProviderConnections: 3,
  maxTurns: 20,
  maxOutputTokensPerTurn: 1000,
  maxUsageTokens: 200_000,
}
const INSTRUCTION = 'ef'.repeat(32)
const BASE = {
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId: GRANT.grantId,
  runBindingSha256: GRANT.runBindingSha256,
}

/** The chain written out from its definition, independently of the module: sha256(chain ‖ sha256(frame) ‖ be32(i)). */
function chainOf(frames: Int16Array[]): string {
  let chain = Buffer.alloc(32)
  frames.forEach((frame, k) => {
    const bytes = Buffer.alloc(frame.length * 2)
    frame.forEach((s, j) => bytes.writeInt16LE(s, j * 2))
    const index = Buffer.alloc(4)
    index.writeUInt32BE(k + 1)
    const digest = createHash('sha256').update(bytes).digest()
    chain = createHash('sha256')
      .update(Buffer.concat([chain, digest, index]))
      .digest()
  })
  return chain.toString('hex')
}

let clock: number
let emitted: Receipt[]
let attribution: Attribution | null
let uuids: string[]

function recorder(): QualificationRecorder {
  return new QualificationRecorder({
    grant: GRANT,
    model: 'gemini-3.8-live',
    instructionSha256: INSTRUCTION,
    bridgeCommit: null,
    now: () => clock,
    attribution: () => attribution,
    emit: (receipt) => emitted.push(receipt),
    uuid: () => uuids.shift() ?? 'no-more-uuids',
  })
}

beforeEach(() => {
  clock = 1_800_000_000_000
  emitted = []
  attribution = { actorId: PRINCIPAL, inputEpoch: 1 }
  uuids = [SESSION, RESUMED_ELSEWHERE]
})

describe('sha-256-chain-v1 (the Lab’s algorithm)', () => {
  it('starts from 32 zero bytes and chains each frame with its index, as a hand-computed vector says', () => {
    assert.equal(new Sha256Chain().hex, '0'.repeat(64), 'no frame: the 32 zero bytes')
    const chain = new Sha256Chain()
    const frames = [Int16Array.from([1, -2, 32767]), Int16Array.from([-32768, 0])]
    for (const frame of frames) chain.add(frame)
    // Computed outside this repository (Python hashlib, the frames packed '<h', the index '>I').
    assert.equal(chain.hex, '4f5d3a11258a1e81951f3100a18c264ea00a4cf0255614a7071eb2372a4245f3')
    assert.equal(chain.hex, chainOf(frames))
  })

  it('depends on the order of the frames and on every sample', () => {
    const a = Int16Array.from([5, 6])
    const b = Int16Array.from([7, 8])
    assert.notEqual(chainOf([a, b]), chainOf([b, a]))
    assert.notEqual(chainOf([a]), chainOf([Int16Array.from([5, 7])]))
  })
})

describe('receipts: exactly A15’s fields, while the principal holds the floor', () => {
  it('a window from the principal’s first forwarded chunk to its turn’s end, and the turn: counts, never words', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    const loud = new Int16Array(1600).fill(1000)
    const quiet = new Int16Array(1600)
    quiet[0] = -2000
    r.input(PRINCIPAL, loud, 0, 1)
    clock += 100
    r.input(PRINCIPAL, quiet, 160, 1)
    r.input(OTHER, loud, 0, 1)
    r.heard(12, false)
    r.heard(9, true)
    r.responded(1)
    clock += 900
    r.turnEnded('turn_complete')
    const rms = Math.sqrt((1000 * 1000 * 1600 + 2000 * 2000) / 3200) / 32_768
    assert.deepEqual(emitted, [
      {
        kind: 'provider',
        ...BASE,
        atMs: 1_800_000_000_000,
        phase: 'setup',
        providerSession: SESSION,
        connection: 1,
        resumed: false,
        model: 'gemini-3.8-live',
        instructionSha256: INSTRUCTION,
        bridgeCommit: null,
        connectionsOpened: 1,
        turns: 0,
        usageTokens: null,
        lastPromptTokens: null,
      },
      {
        kind: 'input_window',
        ...BASE,
        atMs: 1_800_000_001_000,
        windowSeq: 1,
        inputEpoch: 1,
        providerSession: SESSION,
        connection: 1,
        startedAtMs: 1_800_000_000_000,
        endedAtMs: 1_800_000_001_000,
        endReason: 'turn_complete',
        chunkCount: 2,
        sampleCount: 3200,
        nonzeroSampleCount: 1601,
        audibleChunkCount: 1,
        rms,
        peak: 2000 / 32_768,
        droppedSamples: 160,
        sampleRate: 16000,
        pcmDigestAlgorithm: 'sha-256-chain-v1',
        pcmSha256Chain: chainOf([loud, quiet]),
        rawAudioExcluded: true,
      },
      {
        kind: 'input_turn',
        ...BASE,
        atMs: 1_800_000_001_000,
        windowSeq: 1,
        turnOrdinal: 1,
        inputTranscriptionObserved: true,
        transcriptChars: 21,
        finished: true,
        attributedToHolder: true,
        modelResponded: true,
        toolCallCount: 1,
        outcome: 'answered',
      },
    ])
  })

  it('a reply: what arrived, the 20 ms frames handed to the room and their chain, and how it ended', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    emitted.length = 0
    r.responded()
    r.replyReceived(1440)
    const frames = [new Int16Array(480).fill(300), new Int16Array(480), Int16Array.from({ length: 480 }, () => -600)]
    clock += 40
    for (const frame of frames) r.replyPlayed(frame)
    clock += 60
    r.replyEnded('interrupted')
    assert.deepEqual(emitted, [
      {
        kind: 'output_reply',
        ...BASE,
        atMs: 1_800_000_000_100,
        replyOrdinal: 1,
        turnOrdinal: 1,
        providerSession: SESSION,
        connection: 1,
        receivedAtMs: 1_800_000_000_000,
        firstPlayedAtMs: 1_800_000_000_040,
        endedAtMs: 1_800_000_000_100,
        terminal: 'interrupted',
        samplesReceived: 1440,
        framesPlayed: 3,
        nonSilentFramesPlayed: 2,
        rms: Math.sqrt((300 * 300 * 480 + 600 * 600 * 480) / 1440) / 32_768,
        peak: 600 / 32_768,
        durationMs: 60,
        playedDigestAlgorithm: 'sha-256-chain-v1',
        playedSha256Chain: chainOf(frames),
      },
    ])
  })

  it('a window ends at a barge-in, a handoff, a pause or a lost connection, each with what the turn showed', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    const chunk = new Int16Array(1600).fill(500)
    const ends: Array<[() => void, boolean]> = [
      [() => r.turnEnded('interrupted'), true],
      [() => r.windowEnded('handoff'), true],
      [() => r.windowEnded('paused'), true],
      [() => r.windowEnded('paused'), false],
      [() => r.turnEnded('lost'), false],
      [() => r.turnEnded('turn_complete'), false],
    ]
    for (const [end, responded] of ends) {
      r.input(PRINCIPAL, chunk, 0, 1)
      if (responded) r.responded()
      end()
    }
    const windows = emitted.filter((e) => e.kind === 'input_window').map((e) => e.endReason)
    const turns = emitted.filter((e) => e.kind === 'input_turn').map((e) => [e.windowSeq, e.outcome])
    assert.deepEqual(windows, ['interrupted', 'handoff', 'paused', 'paused', 'closed', 'turn_complete'])
    assert.deepEqual(turns, [
      [1, 'interrupted'],
      [2, 'answered'],
      [3, 'interrupted'],
      [4, 'no_user_turn_observed'],
      [5, 'connection_lost'],
      [6, 'no_user_turn_observed'],
    ])
  })

  it('records nothing for anyone else: no window for their audio, no reply or lifecycle while they hold the floor', () => {
    const r = recorder()
    r.floor(OTHER, GRANT.grantId)
    r.opened(1, false)
    r.input(OTHER, new Int16Array(1600).fill(800), 0, 1)
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.heard(10, true)
    r.responded(2)
    r.replyReceived(480)
    r.replyPlayed(new Int16Array(480).fill(1))
    r.replyEnded('played')
    r.turnEnded('turn_complete')
    r.typed()
    r.usage(1, 5000, 4000)
    r.closed('ended')
    assert.deepEqual(emitted, [], 'nothing of a session the principal never held the floor in')
  })

  it('an assignment that no longer names the grant, or names another, stops the recording', () => {
    const r = recorder()
    r.floor(PRINCIPAL, null)
    r.opened(1, false)
    r.floor(PRINCIPAL, '88888888-8888-4888-8888-888888888888')
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.turnEnded('turn_complete')
    assert.deepEqual(emitted, [])
  })

  it('what opened under the principal ends with its receipt after the floor moved; nothing new opens', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.replyReceived(480)
    r.floor(OTHER, GRANT.grantId)
    r.windowEnded('handoff')
    r.replyEnded('stopped')
    r.input(OTHER, new Int16Array(1600).fill(800), 0, 2)
    r.replyReceived(480)
    r.replyEnded('played')
    r.provider('ready', 1)
    assert.deepEqual(
      emitted.map((e) => e.kind),
      ['provider', 'input_window', 'input_turn', 'output_reply'],
    )
  })

  it('a reply, a tool call or a response is the principal’s only when the turn it answers is theirs', () => {
    const r = recorder()
    attribution = { actorId: OTHER, inputEpoch: 1 }
    r.floor(OTHER, GRANT.grantId)
    r.opened(1, false)
    r.input(OTHER, new Int16Array(1600).fill(800), 0, 1)
    // Sophia answers the other member; the floor moves to the principal while she does.
    r.replyReceived(480)
    r.floor(PRINCIPAL, GRANT.grantId)
    r.responded(2)
    r.replyReceived(480)
    // The handoff settles and the principal is heard while Sophia still answers the other member: that reply stays
    // unrecorded to its end.
    attribution = { actorId: PRINCIPAL, inputEpoch: 2 }
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 2)
    r.replyReceived(480)
    r.replyPlayed(new Int16Array(480).fill(300))
    r.replyEnded('played')
    r.turnEnded('turn_complete')
    // A turn no one's audio started (a notice, a continuation nobody was heard before): not the principal's either.
    attribution = null
    r.responded(1)
    r.replyReceived(480)
    r.replyEnded('played')
    r.turnEnded('turn_complete')
    // The principal's own turn is recorded.
    attribution = { actorId: PRINCIPAL, inputEpoch: 2 }
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 2)
    r.responded(1)
    r.replyReceived(480)
    r.replyEnded('played')
    r.turnEnded('turn_complete')
    r.closed('ended')
    assert.deepEqual(
      emitted.map((e) => e.kind),
      ['input_window', 'input_turn', 'output_reply', 'input_window', 'input_turn', 'provider', 'session_closed'],
    )
    const reply = emitted.find((e) => e.kind === 'output_reply')
    assert.deepEqual(
      reply?.kind === 'output_reply' && [reply.replyOrdinal, reply.turnOrdinal, reply.samplesReceived],
      [1, 3, 480],
    )
    const close = emitted.at(-1)
    assert.deepEqual(
      close?.kind === 'session_closed' && [close.windows, close.turns, close.replies, close.toolCalls],
      [2, 3, 1, 1],
    )
  })

  it('the session’s close: once, with its counts and no transcript; nothing is recorded after it', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.responded(2)
    r.typed()
    r.turnEnded('turn_complete')
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.replyReceived(480)
    emitted.length = 0
    r.closed('guard')
    r.closed('ended')
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.turnEnded('turn_complete')
    r.provider('ready', 1)
    assert.deepEqual(
      emitted.map((e) => (e.kind === 'provider' ? `provider:${e.phase}` : e.kind)),
      ['input_window', 'input_turn', 'output_reply', 'provider:closed', 'session_closed'],
    )
    const [window, turn, reply, , close] = emitted
    assert.equal(window?.kind === 'input_window' && window.endReason, 'closed')
    assert.equal(turn?.kind === 'input_turn' && turn.outcome, 'connection_lost')
    assert.equal(reply?.kind === 'output_reply' && reply.terminal, 'closed')
    assert.deepEqual(close, {
      kind: 'session_closed',
      ...BASE,
      atMs: clock,
      providerClosed: true,
      windows: 2,
      turns: 1,
      replies: 1,
      toolCalls: 2,
      typedMessages: 1,
      transcriptRetained: false,
      reason: 'guard',
    })
  })
})

describe('the provider’s receipts: a connection’s lifecycle, under its durable ordinal, and its own usage', () => {
  it('usage is each connection’s own highest report, with its newest prompt; recorded when it grows', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    r.usage(1, 28_000, 25_000)
    r.usage(1, 20_000, 18_000)
    r.opened(4, false)
    r.usage(4, 9000, null)
    r.usage(4, 9500, 7000)
    const usage = emitted.filter((e) => e.kind === 'provider' && e.phase === 'usage')
    assert.deepEqual(
      usage.map((e) => e.kind === 'provider' && [e.connection, e.usageTokens, e.lastPromptTokens]),
      [
        [1, 28_000, 25_000],
        [4, 9000, null],
        [4, 9500, 7000],
      ],
      'an older report changes nothing; the API sums the connections, each named by its durable ordinal',
    )
  })

  it('a resumed connection continues its provider session; a cold one starts another; generations are counted', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    r.responded()
    r.turnEnded('turn_complete')
    r.turnEnded('lost')
    r.responded()
    r.turnEnded('lost')
    r.opened(2, true)
    r.opened(3, false)
    const setups = emitted.filter((e) => e.kind === 'provider')
    assert.deepEqual(
      setups.map(
        (e) => e.kind === 'provider' && [e.connection, e.providerSession, e.resumed, e.turns, e.connectionsOpened],
      ),
      [
        [1, SESSION, false, 0, 1],
        [2, SESSION, true, 2, 2],
        [3, RESUMED_ELSEWHERE, false, 2, 3],
      ],
      'a lost connection with nothing generated is no generation',
    )
  })
})
