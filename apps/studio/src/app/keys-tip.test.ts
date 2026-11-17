import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { keepSeen, keepShown, KEYS_TIP_KEY, meets, readSeen, SHOWINGS } from './keys-tip.ts'

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

describe('the tip that names the index’s key, once per browser (keys-tip.md)', () => {
  it('is unseen on an empty store, and seen once kept, under its own key', () => {
    const store = memory()
    assert.equal(readSeen(store), false)
    keepSeen(store)
    assert.equal(readSeen(store), true)
    assert.equal(store.getItem(KEYS_TIP_KEY), 'seen')
  })
  it('reads as seen where nothing can be kept: a tip that couldn’t stay closed would come back on every visit', () => {
    assert.equal(readSeen(null), true)
    assert.equal(readSeen(blocked), true)
    assert.doesNotThrow(() => keepSeen(blocked))
    assert.doesNotThrow(() => keepSeen(null))
  })
})

describe('an ignored tip ends on its own (keys-tip.md)', () => {
  it('counts the visits that showed it, and is seen after the last', () => {
    const store = memory()
    for (let visit = 1; visit < SHOWINGS; visit += 1) {
      keepShown(store)
      assert.equal(readSeen(store), false, `after ${String(visit)}`)
    }
    keepShown(store)
    assert.equal(readSeen(store), true)
    assert.equal(store.getItem(KEYS_TIP_KEY), 'seen')
  })
  it('reads anything else kept under its key as seen', () => {
    for (const kept of ['x', '-1', '1.5', String(SHOWINGS)]) {
      assert.equal(readSeen({ getItem: () => kept }), true, kept)
    }
  })
})

describe('the tip’s box against a control’s', () => {
  const tip = { left: 24, top: 600, right: 384, bottom: 646 }
  it('meets one that overlaps it, by any edge', () => {
    assert.equal(meets(tip, { left: 300, top: 620, right: 340, bottom: 660 }), true)
    assert.equal(meets(tip, { left: 0, top: 0, right: 1280, bottom: 800 }), true)
  })
  it('doesn’t meet one beside it, touching edges included', () => {
    assert.equal(meets(tip, { left: 384, top: 600, right: 420, bottom: 646 }), false)
    assert.equal(meets(tip, { left: 24, top: 646, right: 384, bottom: 700 }), false)
    assert.equal(meets(tip, { left: 24, top: 600, right: 24, bottom: 646 }), false)
  })
})
