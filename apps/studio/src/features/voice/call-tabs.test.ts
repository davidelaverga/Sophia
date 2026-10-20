import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callTabs, type TabChannel } from './call-tabs.ts'

/** One browser's channel between tabs, in the check's hands: what each tab posts reaches every other tab. */
function browser() {
  const tabs: { heard: ((e: { data: unknown }) => void)[]; leave: (() => void)[] }[] = []
  const tab = (withChannel = true) => {
    const me = { heard: [] as ((e: { data: unknown }) => void)[], leave: [] as (() => void)[] }
    tabs.push(me)
    const channel: TabChannel = {
      postMessage: (data) => {
        for (const other of tabs) if (other !== me) for (const fn of other.heard) fn({ data })
      },
      addEventListener: (_type, fn) => {
        me.heard.push(fn)
      },
    }
    const calls = callTabs({ open: () => (withChannel ? channel : null), onLeave: (fn) => me.leave.push(fn) })
    return {
      calls,
      leaves: () => me.leave.forEach((fn) => fn()),
      hear: (data: unknown) => me.heard.forEach((fn) => fn({ data })),
    }
  }
  return { tab }
}

const ROOM = 'room-1:actor-1'

describe('which calls the other tabs of this browser hold (call-tabs.ts)', () => {
  it('a tab holding this room for this person is heard by another, joining or in, until it says it is out', () => {
    const b = browser()
    const a = b.tab()
    const other = b.tab()
    assert.equal(a.calls.held(ROOM), false)
    other.calls.say('room-a', ROOM, 'joining')
    assert.equal(a.calls.held(ROOM), true, 'joining counts: it may land at any moment')
    other.calls.say('room-a', ROOM, 'in')
    assert.equal(a.calls.held(ROOM), true)
    other.calls.say('room-a', ROOM, null)
    assert.equal(a.calls.held(ROOM), false)
  })

  it('another project’s call, or another person’s in this browser (a guest), never blocks', () => {
    const b = browser()
    const a = b.tab()
    const other = b.tab()
    other.calls.say('room-a', 'room-2:actor-1', 'in')
    other.calls.say('room-b', 'room-1:guest-9', 'in')
    assert.equal(a.calls.held(ROOM), false)
  })

  it('a tab that opens later asks, and the tabs in a call answer', () => {
    const b = browser()
    const other = b.tab()
    other.calls.say('room-a', ROOM, 'in')
    const late = b.tab()
    assert.equal(late.calls.held(ROOM), true)
  })

  it('a tab going away says its calls are over', () => {
    const b = browser()
    const a = b.tab()
    const other = b.tab()
    other.calls.say('room-a', ROOM, 'in')
    assert.equal(a.calls.held(ROOM), true)
    other.leaves()
    assert.equal(a.calls.held(ROOM), false)
  })

  it('its own claims are never another tab’s', () => {
    const b = browser()
    const a = b.tab()
    a.calls.say('room-a', ROOM, 'in')
    assert.equal(a.calls.held(ROOM), false)
  })

  it('ignores what isn’t a claim', () => {
    const b = browser()
    const a = b.tab()
    for (const data of [
      null,
      'in',
      42,
      {},
      { room: 'x' },
      { room: 'x', scope: ROOM, state: 'maybe' },
      { room: 1, scope: ROOM, state: 'in' },
    ]) {
      a.hear(data)
    }
    assert.equal(a.calls.held(ROOM), false)
  })

  it('without a channel, no other tab is ever heard of, and saying is harmless', () => {
    const b = browser()
    const a = b.tab(false)
    a.calls.say('room-a', ROOM, 'in')
    assert.equal(a.calls.held(ROOM), false)
  })
})
