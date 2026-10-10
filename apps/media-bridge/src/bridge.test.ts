// The assignment loop against LABELLED FAKES (no LiveKit, no Google): one session per live exchange.
import type { MediaAssignment, MediaEvidenceWrite } from '@sophia/contracts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MediaBridge } from './bridge.ts'
import { loadMissionGuide } from './guide.ts'
import type { LiveLink } from './live-session.ts'
import type { RoomEvents, RoomLink } from './rtc.ts'
import type { MediaService } from './service.ts'
import { DECLARED_NAMES } from './tools.ts'

const assignment = (exchangeId: string, over: Partial<MediaAssignment> = {}): MediaAssignment => ({
  exchangeId,
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  state: 'open',
  pauseReason: null,
  inputEpoch: 1,
  inputActorId: null,
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
  ...over,
})

const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const E2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

/** A room's people and how its chat answers; by default nobody, and no chat. */
interface RoomFake {
  people?: { identity: string; standing: 'editor' }[]
  sendChat?: RoomLink['sendChat']
  /** Leaving the room never finishes (LiveKit's disconnect hangs). */
  leaveHangs?: boolean
  /** The bridge's stop deadline, when a test bounds it. */
  stopDeadlineMs?: number
}

/**
 * With `evidence`, SOPHIA_VOICE_EVIDENCE is on and the receipts the API takes are kept there, in the order it took them;
 * it numbers them as 0051 does, per exchange, a repeated write identity its own number again.
 */
function harness(fake: RoomFake = {}, evidence?: MediaEvidenceWrite[]) {
  const log: string[] = []
  const roomEvents: RoomEvents[] = []
  const ordinals = new Map<string, number>()
  const service: MediaService = {
    assignments: () => Promise.reject(new Error('unused')),
    presence: () => Promise.resolve(),
    ackQuiesce: () => Promise.resolve(),
    holder: () => Promise.resolve(),
    announced: () => Promise.resolve(),
    toolCall: () => Promise.reject(new Error('unused')),
    toolSurface: () => Promise.resolve({ names: [...DECLARED_NAMES] }),
    recordEvidence: (write) => {
      if (!evidence) return Promise.reject(new Error('unused'))
      const own = evidence.findIndex((w) => w.writeId === write.writeId)
      if (own < 0) evidence.push(write)
      const numbered = evidence.filter((w) => w.exchangeId === write.exchangeId)
      const seq = numbered.findIndex((w) => w.writeId === write.writeId) + 1
      return Promise.resolve({ seq, replayed: own >= 0, ended: false, reason: null })
    },
    // The API's durable bound, as a FAKE that grants everything: bridge-bound.test.ts holds it to a grant.
    reserveQualification: (reserve) => {
      if (reserve.kind === 'connection') ordinals.set(reserve.exchangeId, (ordinals.get(reserve.exchangeId) ?? 0) + 1)
      const ordinal =
        reserve.kind === 'connection' ? (ordinals.get(reserve.exchangeId) ?? 1) : (reserve.ordinal ?? null)
      return Promise.resolve({ ok: true, ordinal, stop: null, ended: false })
    },
  }
  const bridge = new MediaBridge({
    service,
    joinRoom: async (_access, events) => {
      await Promise.resolve()
      roomEvents.push(events)
      log.push('join')
      const room: RoomLink = {
        people: () => fake.people ?? [],
        ...(fake.sendChat ? { sendChat: fake.sendChat } : {}),
        play: () => Promise.resolve(),
        clearPlayback: () => undefined,
        watch: () => undefined,
        setState: () => Promise.resolve(),
        close: async () => {
          await Promise.resolve()
          if (fake.leaveHangs) await new Promise(() => undefined)
          log.push('leave')
        },
      }
      return room
    },
    connectLive: async () => {
      await Promise.resolve()
      const live: LiveLink = {
        sendAudio: () => undefined,
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
    bridgeInstanceId: 'bridge-test',
    now: Date.now,
    log: (event) => log.push(event),
    every: () => () => undefined,
    ...(evidence ? { voiceEvidence: true } : {}),
    ...(fake.stopDeadlineMs === undefined ? {} : { stopDeadlineMs: fake.stopDeadlineMs }),
  })
  return { bridge, log, roomEvents }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('media bridge assignment loop', () => {
  it('a stop is bounded: a session whose close never finishes is left at the deadline, and logged (Codex r4234233106)', async () => {
    const { bridge, log } = harness({ leaveHangs: true, stopDeadlineMs: 100 })
    await bridge.apply([assignment(E1)])
    await settle()
    const started = Date.now()
    await bridge.stop()
    assert.ok(Date.now() - started < 1000, 'within its deadline')
    assert.deepEqual(
      log.filter((l) => l === 'bridge.stop_deadline'),
      ['bridge.stop_deadline'],
    )
  })

  it('a stop whose sessions close in time logs no deadline (control)', async () => {
    const { bridge, log } = harness({ stopDeadlineMs: 5000 })
    await bridge.apply([assignment(E1)])
    await settle()
    const started = Date.now()
    await bridge.stop()
    assert.ok(Date.now() - started < 1000)
    assert.ok(!log.includes('bridge.stop_deadline'))
    assert.ok(log.includes('leave'))
  })

  it('keeps one session per live exchange, updates it, and closes an ended one before the room’s next joins', async () => {
    const { bridge, log } = harness()
    await bridge.apply([assignment(E1)])
    await settle()
    assert.ok(bridge.session(E1))
    await bridge.apply([assignment(E1, { playbackEpoch: 2 })])
    assert.equal(log.filter((l) => l === 'join').length, 1, 'an update does not rejoin')
    await bridge.apply([assignment(E2)])
    await settle()
    assert.equal(bridge.session(E1), undefined)
    assert.ok(bridge.session(E2))
    assert.deepEqual(
      log.filter((l) => l === 'join' || l === 'leave'),
      ['join', 'leave', 'join'],
    )
    await bridge.stop()
  })

  it('replaces a session whose room LiveKit gave up on', async () => {
    const { bridge, roomEvents, log } = harness()
    await bridge.apply([assignment(E1)])
    await settle()
    roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    assert.ok(log.includes('session.lost'))
    await bridge.apply([assignment(E1)])
    await settle()
    assert.equal(log.filter((l) => l === 'join').length, 2)
    await bridge.stop()
  })

  it('hands what a lost session still owes its room to the session that replaces it', async () => {
    const reader = '11111111-1111-4111-8111-111111111111'
    const result = { taskId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', resultRevision: 1, kind: 'research' as const }
    // The one member reads Sophia, and their notice does not get through.
    const { bridge, roomEvents } = harness({
      people: [{ identity: reader, standing: 'editor' }],
      sendChat: () => Promise.resolve(false),
    })
    await bridge.apply([assignment(E1, { results: [result] })])
    await settle()
    roomEvents[0]?.textMode?.(reader, true)
    bridge.session(E1)?.tick()
    await settle()
    const owed = {
      owed: [{ result, attempts: 1, told: [], delivered: 0, heard: false }],
      unrecorded: [],
      done: [],
      shown: [result],
    }
    assert.deepEqual(bridge.session(E1)?.handover(), owed)
    roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await bridge.apply([assignment(E1, { results: [] })])
    await settle()
    assert.equal(roomEvents.length, 2, 'joined again')
    assert.deepEqual(bridge.session(E1)?.handover(), owed, 'the replacement owes it, with the attempt it used')
    await bridge.stop()
  })

  it('updates the live rooms without waiting for what an ended session still owes', async () => {
    const reader = '11111111-1111-4111-8111-111111111111'
    const result = { taskId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', resultRevision: 1, kind: 'research' as const }
    // The reader's notice never gets an answer: the ended session waits up to its bound for it.
    const { bridge, roomEvents } = harness({
      people: [{ identity: reader, standing: 'editor' }],
      sendChat: () => new Promise<boolean>(() => undefined),
    })
    await bridge.apply([assignment(E1, { results: [result] }), assignment(E2)])
    await settle()
    roomEvents[0]?.textMode?.(reader, true)
    bridge.session(E1)?.tick()
    await settle()
    const started = Date.now()
    await bridge.apply([assignment(E2, { inputEpoch: 2 })])
    assert.ok(Date.now() - started < 1000, 'not held by the ended session')
    assert.equal(bridge.session(E2)?.observed().inputEpoch, 2)
    await bridge.stop()
  })

  it('an exchange’s receipts, across the sessions that replace one another on it, each carry their own identity and no number: the service numbers them (A15, 0051)', async () => {
    const principal = '11111111-1111-4111-8111-111111111111'
    const qualification = {
      grantId: '77777777-7777-4777-8777-777777777777',
      runBindingSha256: 'ab'.repeat(32),
      principalActorId: principal,
      deadline: new Date(Date.now() + 900_000).toISOString(),
      maxProviderConnections: 3,
      maxTurns: 20,
      maxOutputTokensPerTurn: 1000,
      maxUsageTokens: 200_000,
    }
    const evidence: MediaEvidenceWrite[] = []
    const { bridge, roomEvents } = harness({ people: [{ identity: principal, standing: 'editor' }] }, evidence)
    const assigned = [assignment(E1, { inputActorId: principal, qualification }), assignment(E2, { qualification })]
    await bridge.apply(assigned)
    await settle()
    roomEvents[0]?.connection('disconnected', 'livekit: 1')
    await settle()
    await bridge.apply(assigned)
    await settle()
    assert.equal(roomEvents.length, 3, 'E1 joined again')
    const e1 = evidence.filter((w) => w.exchangeId === E1)
    assert.equal(new Set(e1.map((w) => w.writeId)).size, e1.length, 'each receipt its own identity')
    assert.equal(
      e1.some((w) => 'seq' in w),
      false,
      'the bridge numbers nothing',
    )
    const kinds = e1.map((w, i) => [i + 1, w.receipt.kind === 'provider' ? w.receipt.phase : w.receipt.kind])
    assert.deepEqual(kinds, [
      [1, 'setup'],
      [2, 'closed'],
      [3, 'session_closed'],
      [4, 'setup'],
    ])
    assert.equal(
      evidence.some((w) => w.exchangeId === E2),
      false,
      'nobody holds E2’s floor: nothing is recorded there',
    )
    await bridge.stop()
  })
})
