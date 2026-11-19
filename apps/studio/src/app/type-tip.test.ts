import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { KEYS_TIP_KEY, onceTip, SHOWINGS } from './keys-tip.ts'
import { roomBar, startedByTyping, TYPE_TIP_KEY, TYPE_TIP_LINE, typeTipShows, type TypeTipMoment } from './type-tip.ts'

/** A store as the browser's: what was set is read back. */
const memory = () => {
  const kept = new Map<string, string>()
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) }
}

const blocked = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

/** The room with its panel open, the keys' tip had, nothing in the way: the moment the line is true. */
const clear: TypeTipMoment = {
  keysTipSeen: true,
  touch: false,
  barTakesTyping: true,
  fieldFocused: false,
  modal: false,
  coversControl: false,
}

/** An element as the page has it, matching the room's bar or not. */
const field = (isRoomBar: boolean) => ({ matches: (selector: string) => isRoomBar && selector === '[data-chat-entry]' })

describe('the typing tip says what is true (type-anywhere-tip.md)', () => {
  it('says Luis’s line, verbatim', () => {
    assert.equal(TYPE_TIP_LINE, 'Tip: just start typing to message the room.')
  })
  it('shows where the room’s bar takes stray typing and nothing is in the way', () => {
    assert.equal(typeTipShows(clear), true)
  })
  it('waits for the keys’ tip to have had its turn: never both, the keys first', () => {
    assert.equal(typeTipShows({ ...clear, keysTipSeen: false }), false)
  })
  it('waits while the bar is off screen, a field has the caret, a sheet is up, or its box meets a control', () => {
    assert.equal(typeTipShows({ ...clear, barTakesTyping: false }), false)
    assert.equal(typeTipShows({ ...clear, fieldFocused: true }), false)
    assert.equal(typeTipShows({ ...clear, modal: true }), false)
    assert.equal(typeTipShows({ ...clear, coversControl: true }), false)
  })
  it('never shows on a touch screen', () => {
    assert.equal(typeTipShows({ ...clear, touch: true }), false)
  })
})

describe('the typing tip, once per browser (onceTip)', () => {
  it('is unseen on an empty store; Dismiss keeps it seen under its own key, the keys’ tip untouched', () => {
    const store = memory()
    const tip = onceTip(TYPE_TIP_KEY, () => store)
    assert.equal(tip.seenNow(), false)
    tip.end()
    assert.equal(tip.seenNow(), true)
    assert.equal(store.getItem(TYPE_TIP_KEY), 'seen')
    assert.equal(store.getItem(KEYS_TIP_KEY), null)
    assert.equal(onceTip(TYPE_TIP_KEY, () => store).seenNow(), true, 'after a reload')
  })
  it('let be, it ends on its own after the last visit that showed it', () => {
    const store = memory()
    for (let visit = 1; visit <= SHOWINGS; visit += 1) {
      const tip = onceTip(TYPE_TIP_KEY, () => store)
      assert.equal(tip.seenNow(), false, `visit ${String(visit)}`)
      tip.countShowing()
      tip.countShowing()
    }
    assert.equal(onceTip(TYPE_TIP_KEY, () => store).seenNow(), true)
  })
  it('reads a blocked store as seen, and ends without throwing: not shown, no error', () => {
    const tip = onceTip(TYPE_TIP_KEY, () => blocked)
    assert.equal(tip.seenNow(), true)
    assert.doesNotThrow(() => tip.end())
    assert.doesNotThrow(() => tip.countShowing())
    assert.equal(onceTip(TYPE_TIP_KEY, () => null).seenNow(), true)
  })
  it('a store that reads but won’t keep: ended for this page all the same', () => {
    const half = { getItem: () => null, setItem: blocked.setItem }
    const tip = onceTip(TYPE_TIP_KEY, () => half)
    assert.equal(tip.seenNow(), false)
    assert.doesNotThrow(() => tip.end())
    assert.equal(tip.seenNow(), true)
  })
})

describe('seen by use: a message started by typing (type-anywhere-tip.md)', () => {
  it('names the room’s bar, and nothing else, as the field typing went to', () => {
    assert.equal(roomBar(field(true)), true)
    assert.equal(roomBar(field(false)), false)
    assert.equal(roomBar(null), false)
  })
  it('keeps the tip seen once stray typing lands in the room’s bar', () => {
    const store = memory()
    const tip = onceTip(TYPE_TIP_KEY, () => store)
    startedByTyping(field(true), tip)
    assert.equal(tip.seenNow(), true)
    assert.equal(store.getItem(TYPE_TIP_KEY), 'seen')
  })
  it('stray typing into another field (Personal’s composer), or none, leaves it unseen', () => {
    const store = memory()
    const tip = onceTip(TYPE_TIP_KEY, () => store)
    startedByTyping(field(false), tip)
    startedByTyping(null, tip)
    assert.equal(tip.seenNow(), false)
    assert.equal(store.getItem(TYPE_TIP_KEY), null)
  })
})
