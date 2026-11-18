import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, type Room } from 'livekit-client'
import { HAND_TOPIC, decodeHand, encodeHand, handSignal } from './hand-signal.ts'

const SOPHIA = { identity: 'sophia', metadata: JSON.stringify({ sophia: true }) }
const marco = { identity: 'm', name: 'Marco', metadata: JSON.stringify({ role: 'editor' }) }
const lucia = { identity: 'l', name: 'Lucía', metadata: JSON.stringify({ role: 'viewer' }) }
const guest = { identity: 'g', name: 'Noor', metadata: JSON.stringify({ guest: true }) }
/** The last hand packet taken (asks aside): what others were last told of this person's hand. */
const lastHand = (taken: unknown[]) => taken.findLast((p) => JSON.stringify(p).startsWith('{"hand"')) ?? null
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

/**
 * A room as the signal uses it: what it listens for, emitted by the check; what it sends, recorded. `sends`: every send
 * refused (`fail`), or the first `n` refused and the rest sent. The clock is the check's (`tick`).
 */
function setup(sends: 'ok' | 'fail' | number = 'ok') {
  let refusals = sends === 'fail' ? Infinity : sends === 'ok' ? 0 : sends
  let clock = 0
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
  /** What was sent and taken, in order: a refused send isn't here. */
  const taken: unknown[] = []
  let sending: Promise<void> = Promise.resolve()
  const publish = (data: Uint8Array, to?: string[]) => {
    const packet: unknown = JSON.parse(new TextDecoder().decode(data))
    sent.push({ packet, to })
    const refused = refusals > 0
    refusals -= 1
    if (!refused) taken.push(packet)
    sending = refused ? Promise.reject(new Error('data channel closed')) : Promise.resolve()
    return sending
  }
  let changes = 0
  const options = { retryMs: 5, now: () => clock }
  const signal = handSignal(room as unknown as Pick<Room, 'on'>, publish, () => (changes += 1), options)
  const from = (who: object, value: unknown, topic = HAND_TOPIC) =>
    emit(RoomEvent.DataReceived, bytes(value), who, undefined, topic)
  const tick = (ms: number) => (clock += ms)
  /** The next `n` sends are refused, as a data channel still coming back refuses them. */
  const refuse = (n: number) => (refusals = n)
  return {
    signal,
    emit,
    from,
    sent,
    taken,
    tick,
    refuse,
    changes: () => changes,
    settled: () => sending.catch(() => undefined),
  }
}

describe('decodeHand', () => {
  it('reads a hand raised or lowered, or an ask; nothing else', () => {
    assert.deepEqual(decodeHand(encodeHand(true)), { hand: true })
    assert.deepEqual(decodeHand(encodeHand(false)), { hand: false })
    assert.deepEqual(decodeHand(bytes({ ask: true })), { ask: true })
    for (const other of [{ hand: 'yes' }, { ask: false }, { emoji: '👍' }, null, 3])
      assert.equal(decodeHand(bytes(other)), undefined)
    assert.equal(decodeHand(new TextEncoder().encode('not json')), undefined)
    // An array, or a hand only through a prototype, is not a packet.
    assert.equal(decodeHand(bytes([true])), undefined)
    assert.equal(decodeHand(new TextEncoder().encode('{"__proto__":{"hand":true}}')), undefined)
    assert.equal(decodeHand(new TextEncoder().encode('{"__proto__":{"ask":true}}')), undefined)
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

  it('a packet names nobody but its sender: Marco’s, naming Lucía, raises only Marco’s', () => {
    const { signal, from } = setup()
    from(marco, { hand: true, identity: 'l' })
    assert.equal(signal.raised('m'), true)
    assert.equal(signal.raised('l'), false)
  })

  it('only a member’s hand is heard: a guest’s token can’t send one, so one that says it is let go', () => {
    const { signal, from, sent } = setup()
    from(guest, { hand: true })
    assert.equal(signal.raised('g'), false)
    void signal.set(true)
    from(guest, { ask: true })
    assert.equal(sent.length, 1)
  })

  it('asks are answered at most once a second from each person', async () => {
    const { signal, from, sent, tick } = setup()
    await signal.set(true)
    from(marco, { ask: true })
    from(marco, { ask: true })
    from(lucia, { ask: true })
    assert.deepEqual(
      sent.slice(1).map((s) => s.to),
      [['m'], ['l']],
    )
    tick(1000)
    from(marco, { ask: true })
    assert.deepEqual(sent.at(-1)?.to, ['m'])
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

  it('back from a drop, an ask refused is tried again, and the hands from before go once it is sent (Codex P2 on #523)', async () => {
    const { signal, from, emit, taken, refuse } = setup()
    from(marco, { hand: true })
    refuse(1)
    emit(RoomEvent.Reconnected)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.deepEqual(taken, [{ ask: true }])
    assert.equal(signal.raised('m'), false)
  })

  it('an ask that is never taken (a guest has no data grant) is tried a few times, then let go', async () => {
    const { emit, sent } = setup('fail')
    emit(RoomEvent.Reconnected)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const asks = sent.filter((s) => JSON.stringify(s.packet) === '{"ask":true}').length
    assert.ok(asks > 1 && asks <= 4, `asks: ${String(asks)}`)
  })

  it('back from a drop, a lowering refused is tried again until it is sent', async () => {
    const { signal, emit, taken, refuse } = setup()
    await signal.set(true)
    refuse(1)
    emit(RoomEvent.Reconnected)
    assert.equal(signal.mine(), false)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.deepEqual(taken, [{ hand: true }, { ask: true }, { hand: false }])
  })

  it('a lowering still unsent when the call drops again is sent after that reconnect too (Codex P2 on #523)', async () => {
    const { signal, emit, taken, refuse } = setup()
    await signal.set(true)
    // The first reconnect's lowering and ask are both refused; a second reconnect comes before the retry.
    refuse(2)
    emit(RoomEvent.Reconnected)
    emit(RoomEvent.Reconnected)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(signal.mine(), false)
    assert.deepEqual(lastHand(taken), { hand: false })
  })

  it('a call that ends while a lowering waits sends nothing more', async () => {
    const { signal, emit, taken, refuse } = setup()
    await signal.set(true)
    refuse(2)
    emit(RoomEvent.Reconnected)
    emit(RoomEvent.Disconnected)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.ok(!taken.some((p) => JSON.stringify(p) === '{"hand":false}'))
  })

  it('a raise refused while a lowering waits keeps that lowering going', async () => {
    const { signal, emit, taken, refuse } = setup()
    await signal.set(true)
    refuse(3)
    emit(RoomEvent.Reconnected)
    await assert.rejects(signal.set(true))
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(signal.mine(), false)
    assert.deepEqual(lastHand(taken), { hand: false })
  })

  it('a raise pressed while that lowering waits to be tried again is not overtaken by it', async () => {
    const { signal, emit, taken, refuse } = setup()
    await signal.set(true)
    refuse(1)
    emit(RoomEvent.Reconnected)
    await signal.set(true)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(signal.mine(), true)
    assert.deepEqual(taken, [{ hand: true }, { ask: true }, { hand: true }])
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
