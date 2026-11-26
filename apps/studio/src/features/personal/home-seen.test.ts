import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { homeSeenKey, keepHomeSeen, seenHome, welcomes } from './home-seen.ts'

function memory() {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  }
}

const broken = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('Home seen once per account (home-welcome-once.md)', () => {
  it('keeps one key per account', () => {
    assert.equal(homeSeenKey('u-1'), 'sophia.home.seen.u-1')
    assert.notEqual(homeSeenKey('u-1'), homeSeenKey('u-2'))
  })

  it('is unseen until kept, then seen; another account stays unseen', () => {
    const store = memory()
    assert.equal(seenHome(store, 'u-1'), false)
    keepHomeSeen(store, 'u-1')
    assert.equal(seenHome(store, 'u-1'), true)
    assert.equal(seenHome(store, 'u-2'), false)
    assert.equal(store.kept.get('sophia.home.seen.u-1'), '1')
  })

  it('reads a store that cannot be read, or none, as seen', () => {
    assert.equal(seenHome(broken, 'u-1'), true)
    assert.equal(seenHome(null, 'u-1'), true)
    assert.doesNotThrow(() => keepHomeSeen(broken, 'u-1'))
    assert.doesNotThrow(() => keepHomeSeen(null, 'u-1'))
  })

  it('welcomes only a fresh space on an account Home has not seen', () => {
    assert.equal(welcomes({ fresh: true, seenBefore: false }), true)
    assert.equal(welcomes({ fresh: true, seenBefore: true }), false)
    assert.equal(welcomes({ fresh: false, seenBefore: false }), false)
  })
})
