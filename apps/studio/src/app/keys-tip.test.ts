import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { keepSeen, KEYS_TIP_KEY, readSeen } from './keys-tip.ts'

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
