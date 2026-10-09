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

/** `who`'s input went to the provider: the floor's attribution, and the chunk the recorder is handed as it is forwarded. */
function forward(r: QualificationRecorder, who: Attribution): void {
  attribution = who
  r.input(who.actorId, new Int16Array(1600).fill(800), 0, who.inputEpoch)
}

/** One generation of `samples` 24 kHz samples, played, then its turn's end. */
function generation(r: QualificationRecorder, samples: number, how: 'turn_complete' | 'interrupted' = 'turn_complete') {
  r.responded()
  r.replyReceived(samples)
  r.replyEnded('played')
  r.turnEnded(how)
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
    r.heard(12, false)
    r.heard(9, true)
    r.responded(1)
    clock += 900
    r.turnEnded('turn_complete')
    r.input(OTHER, loud, 0, 1) // another member's audio opens no window
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
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1) // the principal's words start the generation
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
    r.typed({ actorId: OTHER, inputEpoch: 1 })
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

  it('a generation the bridge asked for answers whom it asked for: the next one while idle, the one after one under way', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    emitted.length = 0
    const reply = () => {
      r.responded()
      r.replyReceived(480)
      r.replyEnded('played')
    }
    // Another member's tool response, sent while the provider was idle: the next generation is its continuation, the
    // principal heard before it or not.
    attribution = null
    r.asked({ actorId: OTHER, inputEpoch: 1 })
    forward(r, { actorId: PRINCIPAL, inputEpoch: 2 })
    reply()
    r.turnEnded('turn_complete')
    // A result notice sent while idle: its generation answers no one.
    attribution = null
    r.asked(null)
    forward(r, { actorId: PRINCIPAL, inputEpoch: 2 })
    reply()
    r.turnEnded('turn_complete')
    // The principal's own turn (recorded), with their tool response sent while it is under way: its continuation is the
    // generation after it, theirs, whatever the floor's attribution by then.
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 2)
    reply()
    r.asked({ actorId: PRINCIPAL, inputEpoch: 2 })
    r.turnEnded('turn_complete')
    forward(r, { actorId: OTHER, inputEpoch: 3 })
    reply()
    r.turnEnded('turn_complete')
    // Nothing asked: whoever's input was forwarded to start it.
    forward(r, { actorId: PRINCIPAL, inputEpoch: 4 })
    reply()
    r.turnEnded('turn_complete')
    const replies = emitted.flatMap((e) => (e.kind === 'output_reply' ? [[e.replyOrdinal, e.turnOrdinal]] : []))
    assert.deepEqual(replies, [
      [1, 3],
      [2, 4],
      [3, 5],
    ])
  })

  describe('whom a generation answers when an ask may be more than one (R2 review P2 and P3): fail closed', () => {
    const DAVIDE = { actorId: OTHER, inputEpoch: 1 }
    const LUIS = { actorId: PRINCIPAL, inputEpoch: 2 }
    const recordedReplies = () => emitted.flatMap((e) => (e.kind === 'output_reply' ? [e.samplesReceived] : []))
    const fresh = () => {
      const r = recorder()
      r.floor(PRINCIPAL, GRANT.grantId)
      r.opened(1, false)
      return r
    }

    it('root’s control 1: the principal speaks and is answered: their 960 samples are recorded', () => {
      const r = fresh()
      forward(r, LUIS)
      generation(r, 960)
      assert.deepEqual(recordedReplies(), [960])
    })

    it('root’s control 2: a peer’s ask sent before the principal’s first output: neither generation is the principal’s', () => {
      const r = fresh()
      forward(r, LUIS) // the principal's words were forwarded; nothing produced yet
      r.asked(DAVIDE) // Davide's slow tool response is sent now
      generation(r, 960) // Sophia's answer to Luis, or Davide's continuation: it cannot be told
      forward(r, LUIS) // Luis's open microphone, forwarded again
      generation(r, 1440) // Davide's continuation, or an answer to Luis
      assert.deepEqual(recordedReplies(), [], 'no one’s, rather than a guess: never Davide’s 1440 as Luis’s')
      forward(r, LUIS)
      generation(r, 480)
      assert.deepEqual(recordedReplies(), [480], 'past both, the floor’s again')
    })

    it('root’s control 3: a notice cut before a word leaves no mark: the principal’s next reply is recorded', () => {
      const r = fresh()
      attribution = null
      r.asked(null) // a result notice, sent while idle
      r.turnEnded('interrupted') // talked over before Sophia said a word of it
      forward(r, LUIS)
      generation(r, 960)
      assert.deepEqual(recordedReplies(), [960])
    })

    it('a notice sent while holder input was forwarded: neither of the next two generations is recorded', () => {
      const r = fresh()
      forward(r, LUIS)
      r.asked(null)
      generation(r, 480)
      generation(r, 960)
      assert.deepEqual(recordedReplies(), [], 'the notice may be either')
      forward(r, LUIS)
      generation(r, 720)
      assert.deepEqual(recordedReplies(), [720])
    })

    it('a barge-in may be answered before what was asked: the ask may then be one generation later', () => {
      const r = fresh()
      forward(r, LUIS)
      r.responded() // the principal's generation is under way
      r.asked(DAVIDE) // Davide's tool response, sent meanwhile: the next generation, unless a barge-in comes first
      r.replyReceived(480)
      r.replyEnded('interrupted')
      r.turnEnded('interrupted')
      generation(r, 960) // Luis's answer to his barge-in, or Davide's continuation
      generation(r, 1440)
      assert.deepEqual(recordedReplies(), [480], 'only the principal’s own generation, which began before the ask')
      forward(r, LUIS)
      generation(r, 720)
      assert.deepEqual(recordedReplies(), [480, 720])
    })

    it('the principal’s own ask sent while another member’s input waits: the generation it may be is no one’s', () => {
      const r = fresh()
      forward(r, DAVIDE) // Davide holds the floor now, and his words were forwarded
      r.asked(LUIS) // the principal's tool response from before, sent now
      generation(r, 960) // Sophia's answer to Davide, or the principal's continuation
      assert.deepEqual(recordedReplies(), [], 'never Davide’s answer as the principal’s')
    })

    it('Codex’s order: the principal’s ask queued while another member’s input owns the turn stays theirs too after a handoff', () => {
      const r = fresh()
      forward(r, DAVIDE) // Davide's forwarded words own the turn; nothing produced yet
      r.asked(LUIS) // the principal's delayed tool response is sent now
      forward(r, LUIS) // the handoff settles, and the principal's audio is forwarded before any output
      generation(r, 960) // Sophia's answer to Davide, or the principal's continuation
      assert.deepEqual(recordedReplies(), [], 'never what may answer Davide as the principal’s')
    })

    it('a barge-in’s speaker stays a candidate for what was still asked, however the floor moves after it', () => {
      const r = fresh()
      forward(r, LUIS)
      r.responded() // the principal's own generation is under way
      r.asked(LUIS) // their tool response, sent meanwhile: the next generation
      r.replyReceived(480)
      r.replyEnded('interrupted')
      forward(r, DAVIDE) // Davide (the floor moved to him) talks over it
      r.turnEnded('interrupted')
      forward(r, LUIS) // the floor comes back, and the principal's audio is forwarded before any output
      generation(r, 960) // the answer to Davide's barge-in, or the principal's continuation
      generation(r, 1440)
      assert.deepEqual(recordedReplies(), [480], 'only the generation that began before the ask')
    })

    it('root’s control 5: an interruption that arrives after a handoff away and back: whoever was forwarded before it may be answered', () => {
      const r = fresh()
      forward(r, { actorId: PRINCIPAL, inputEpoch: 1 }) // 1. the principal's input is forwarded
      r.responded() // and the provider responds
      r.asked({ actorId: PRINCIPAL, inputEpoch: 1 }) // 2. their tool response, sent while the generation is under way
      r.replyReceived(480) // 3. 480 samples of the principal's output
      forward(r, { actorId: OTHER, inputEpoch: 2 }) // 4. a peer's input, forwarded at input epoch 2
      forward(r, { actorId: PRINCIPAL, inputEpoch: 3 }) // 5. the floor back to the principal, forwarded at epoch 3
      r.replyEnded('interrupted') // 6. only now does the provider's interruption arrive
      r.turnEnded('interrupted')
      generation(r, 960) // 7. the answer to the peer, or the principal's continuation
      generation(r, 1440)
      assert.deepEqual(recordedReplies(), [480], 'neither the 960 nor the 1440 is the principal’s; the 480 is')
    })

    it('with nothing asked: a late interruption keeps whoever was forwarded before it as a candidate, however the floor moved', () => {
      const r = fresh()
      forward(r, { actorId: PRINCIPAL, inputEpoch: 1 })
      r.responded()
      r.replyReceived(480)
      forward(r, { actorId: OTHER, inputEpoch: 2 }) // the peer's input, forwarded
      forward(r, { actorId: PRINCIPAL, inputEpoch: 3 }) // the floor back to the principal
      r.replyEnded('interrupted')
      r.turnEnded('interrupted') // the provider's interruption, late
      forward(r, { actorId: PRINCIPAL, inputEpoch: 3 }) // the principal's microphone again, after it
      generation(r, 960) // the answer to the peer, or to the principal
      assert.deepEqual(recordedReplies(), [480], 'the 960 may answer the peer: no one’s')
      forward(r, { actorId: PRINCIPAL, inputEpoch: 3 })
      generation(r, 720)
      assert.deepEqual(recordedReplies(), [480, 720], 'after a completed turn, the principal’s own again')
    })

    it('an ask sent just after a barge-in’s turn end is not idle: the barger may be answered first', () => {
      const r = fresh()
      forward(r, LUIS)
      r.responded() // the principal's generation
      forward(r, DAVIDE) // the floor moved: Davide talks over it
      r.turnEnded('interrupted')
      attribution = null // ExchangeState's turn ends with it; Davide's words are still to be answered
      r.asked(LUIS) // the principal's tool response, sent now
      generation(r, 960) // the answer to Davide, or the principal's continuation
      assert.deepEqual(recordedReplies(), [])
    })

    it('a typed message’s speaker is a candidate as it is sent, like a forwarded chunk’s', () => {
      const r = fresh()
      r.typed(DAVIDE) // Davide's typed message went to the provider
      forward(r, LUIS) // then the floor is the principal's, their microphone forwarded
      generation(r, 960) // the answer to Davide's message, or to the principal
      assert.deepEqual(recordedReplies(), [])
    })

    it('a lost connection’s asks are never answered on the next one', () => {
      const r = fresh()
      attribution = null
      r.asked(DAVIDE)
      r.turnEnded('lost')
      forward(r, LUIS)
      generation(r, 960)
      assert.deepEqual(recordedReplies(), [960])
    })
  })

  it('the session’s close: once, with its counts and no transcript; nothing is recorded after it', () => {
    const r = recorder()
    r.floor(PRINCIPAL, GRANT.grantId)
    r.opened(1, false)
    r.input(PRINCIPAL, new Int16Array(1600).fill(800), 0, 1)
    r.responded(2)
    r.typed({ actorId: PRINCIPAL, inputEpoch: 1 })
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
