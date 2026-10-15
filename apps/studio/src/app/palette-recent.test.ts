import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { forgetRecent, keptAfter, noteRun, readRecent, RECENT_KEY, recentFor, recentKey } from './palette-recent.ts'

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

describe('Recent, one account’s (Codex on #283)', () => {
  it('is read and written under the account signed in, so another (another tab’s too) never sees it', () => {
    const kept = new Map<string, string>([[RECENT_KEY, '["old"]']])
    const store = {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
      removeItem: (k: string) => void kept.delete(k),
    }
    // Kept before «Recent» was per account: nobody's known, gone.
    recentFor('a', store)
    assert.equal(kept.has(RECENT_KEY), false)
    noteRun('view-tasks', store)
    assert.equal(kept.get(recentKey('a')), '["view-tasks"]')
    // Another account in this tab, or another tab's writes under its own: each reads its own.
    recentFor('b', store)
    assert.deepEqual(readRecent(store), [])
    noteRun('view-goals', store)
    recentFor('a', store)
    assert.deepEqual(readRecent(store), ['view-tasks'])
  })
})
