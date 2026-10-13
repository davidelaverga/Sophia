import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { forgetRecent, keptAfter, readRecent, RECENT_KEY, recentFor } from './palette-recent.ts'

describe('what the palette ran last', () => {
  it('is kept newest first, a command once, five at most', () => {
    assert.deepEqual(keptAfter([], 'a'), ['a'])
    assert.deepEqual(keptAfter(['a', 'b'], 'b'), ['b', 'a'])
    assert.deepEqual(keptAfter(['a', 'b', 'c', 'd', 'e'], 'f'), ['f', 'a', 'b', 'c', 'd'])
  })
  it('reads as none when the storage is blocked or holds something else', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    assert.deepEqual(readRecent(blocked), [])
    assert.deepEqual(readRecent({ getItem: () => 'not json' }), [])
    assert.deepEqual(readRecent({ getItem: () => '{"a":1}' }), [])
    assert.deepEqual(readRecent({ getItem: () => '["a", 3, "b"]' }), ['a', 'b'])
    assert.deepEqual(readRecent({ getItem: (k: string) => (k === RECENT_KEY ? '["x"]' : null) }), ['x'])
  })
})

describe('Recent, one person’s (Codex P2 on #264)', () => {
  it('is forgotten when another comes in: the store keeps nothing of it', () => {
    const kept = new Map<string, string>([[RECENT_KEY, '["view-tasks"]']])
    forgetRecent({ removeItem: (k: string) => void kept.delete(k) })
    assert.equal(kept.has(RECENT_KEY), false)
    // A blocked store: nothing kept, nothing broken.
    assert.doesNotThrow(() => forgetRecent(null))
  })
})

describe('Recent, kept with whose it is (Codex on #283)', () => {
  it('is forgotten for another account, however the last one left, and kept for the same one', () => {
    const kept = new Map<string, string>([[RECENT_KEY, '["view-tasks"]']])
    const store = {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
      removeItem: (k: string) => void kept.delete(k),
    }
    // No owner noted (kept before this): another account's, so forgotten; the owner noted now.
    recentFor('b', store)
    assert.equal(kept.has(RECENT_KEY), false)
    kept.set(RECENT_KEY, '["view-tasks"]')
    recentFor('b', store)
    assert.equal(kept.get(RECENT_KEY), '["view-tasks"]')
    // A cold load signed out, then another account in: still forgotten.
    recentFor('a', store)
    assert.equal(kept.has(RECENT_KEY), false)
  })
})
