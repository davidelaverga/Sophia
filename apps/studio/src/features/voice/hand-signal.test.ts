import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, type Room } from 'livekit-client'
import { HAND_TOPIC, decodeHand, encodeHand, handSignal } from './hand-signal.ts'

const SOPHIA = { identity: 'sophia', metadata: JSON.stringify({ sophia: true }) }
const marco = { identity: 'm', name: 'Marco', metadata: JSON.stringify({ role: 'editor' }) }
const lucia = { identity: 'l', name: 'Lucía', metadata: JSON.stringify({ role: 'viewer' }) }
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

/** A room as the signal uses it: what it listens for, emitted by the check; what it sends, recorded. */
function setup(sends: 'ok' | 'fail' = 'ok') {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
  }
  const emit = (event: RoomEvent, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }
  const sent: { packet: unknown; to: string[] | undefined }[] = []
  let sending: Promise<void> = Promise.resolve()
  const publish = (data: Uint8Array, to?: string[]) => {
    sent.push({ packet: JSON.parse(new TextDecoder().decode(data)), to })
    sending = sends === 'ok' ? Promise.resolve() : Promise.reject(new Error('data channel closed'))
    return sending
  }
  let changes = 0
  const signal = handSignal(room as unknown as Pick<Room, 'on'>, publish, () => (changes += 1))
  const from = (who: object, value: unknown, topic = HAND_TOPIC) =>
    emit(RoomEvent.DataReceived, bytes(value), who, undefined, topic)
  return { signal, emit, from, sent, changes: () => changes, settled: () => sending.catch(() => undefined) }
}

describe('decodeHand', () => {
  it('reads a hand raised or lowered, or an ask; nothing else', () => {
    assert.deepEqual(decodeHand(encodeHand(true)), { hand: true })
    assert.deepEqual(decodeHand(encodeHand(false)), { hand: false })
    assert.deepEqual(decodeHand(bytes({ ask: true })), { ask: true })
    for (const other of [{ hand: 'yes' }, { ask: false }, { emoji: '👍' }, null, 3])
      assert.equal(decodeHand(bytes(other)), undefined)
    assert.equal(decodeHand(new TextEncoder().encode('not json')), undefined)
  })
})

describe('handSignal', () => {
  it('a raise is sent to everyone and kept as mine; lowered, the same', async () => {
    const { signal, sent } = setup()
    await signal.set(true)
    assert.equal(signal.mine(), true)
    await signal.set(true) // no change, nothing sent
    await signal.set(false)
    assert.equal(signal.mine(), false)
    assert.deepEqual(sent, [
      { packet: { hand: true }, to: undefined },
      { packet: { hand: false }, to: undefined },
    ])
  })

  it('another’s packet raises and lowers their hand; from Sophia, on another topic or not a hand, nothing', () => {
    const { signal, from, changes } = setup()
    from(marco, { hand: true })
    assert.equal(signal.raised('m'), true)
    assert.equal(changes(), 1)
    from(SOPHIA, { hand: true })
    from(lucia, { hand: true }, 'sophia.reaction')
    from(lucia, { hand: 'up' })
    assert.equal(signal.raised('sophia'), false)
    assert.equal(signal.raised('l'), false)
    from(marco, { hand: false })
    assert.equal(signal.raised('m'), false)
  })

  it('whoever joins is told, to them alone, only while the hand is raised', async () => {
    const { signal, emit, sent } = setup()
    emit(RoomEvent.ParticipantConnected, lucia)
    assert.deepEqual(sent, [])
    await signal.set(true)
    emit(RoomEvent.ParticipantConnected, lucia)
    emit(RoomEvent.ParticipantConnected, SOPHIA)
    assert.deepEqual(sent.at(-1), { packet: { hand: true }, to: ['l'] })
    assert.equal(sent.length, 2)
  })

  it('an ask is answered only while raised, to the asker alone', async () => {
    const { signal, from, sent } = setup()
    from(marco, { ask: true })
    assert.deepEqual(sent, [])
    await signal.set(true)
    from(marco, { ask: true })
    assert.deepEqual(sent.at(-1), { packet: { hand: true }, to: ['m'] })
  })

  it('someone who leaves is forgotten', () => {
    const { signal, from, emit } = setup()
    from(marco, { hand: true })
    emit(RoomEvent.ParticipantDisconnected, marco)
    assert.equal(signal.raised('m'), false)
  })

  it('back from a drop: mine is lowered and said so, the room is asked, and only what came before is forgotten', async () => {
    const { signal, from, emit, sent, settled } = setup()
    await signal.set(true)
    from(marco, { hand: true })
    emit(RoomEvent.Reconnected)
    assert.equal(signal.mine(), false)
    // An answer heard before the ask settled stays.
    from(lucia, { hand: true })
    await settled()
    assert.deepEqual(sent.slice(1), [
      { packet: { hand: false }, to: undefined },
      { packet: { ask: true }, to: undefined },
    ])
    assert.equal(signal.raised('m'), false)
    assert.equal(signal.raised('l'), true)
  })

  it('an ask that can’t be sent forgets nothing; a raise that can’t be sent goes back down', async () => {
    const { signal, from, emit, settled, changes } = setup('fail')
    from(marco, { hand: true })
    emit(RoomEvent.Reconnected)
    await settled()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(signal.raised('m'), true)
    const before = changes()
    await assert.rejects(signal.set(true))
    assert.equal(signal.mine(), false)
    assert.ok(changes() > before)
  })
})
