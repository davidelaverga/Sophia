import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { forgetViewerDrafts } from './viewer-state.ts'

/** A Storage as the browser's, in memory. */
function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}

describe('signing out forgets the views’ unsent words (Codex P1 on #366)', () => {
  it('drops every project’s drafts, keeps each view’s lens, and touches nothing else', () => {
    const store = memoryStorage({
      'sophia.viewer.v1.ana.p1': JSON.stringify({ lens: 'build', drafts: { explore: 'secret plan', build: 'x' } }),
      'sophia.viewer.v1.bea.p2': JSON.stringify({ lens: 'converse', drafts: {} }),
      'sophia.theme': 'dark',
    })
    forgetViewerDrafts(store)
    assert.deepEqual(JSON.parse(store.getItem('sophia.viewer.v1.ana.p1') ?? ''), { lens: 'build', drafts: {} })
    assert.deepEqual(JSON.parse(store.getItem('sophia.viewer.v1.bea.p2') ?? ''), { lens: 'converse', drafts: {} })
    assert.equal(store.getItem('sophia.theme'), 'dark')
  })

  it('says whether any view held unsent words, so the sign-in says they were cleared only when some were', () => {
    const held = memoryStorage({
      'sophia.viewer.v1.ana.p1': JSON.stringify({ lens: 'build', drafts: { build: 'secret plan' } }),
    })
    assert.equal(forgetViewerDrafts(held), true)
    // Forgotten once, nothing is left to forget.
    assert.equal(forgetViewerDrafts(held), false)
    const empty = memoryStorage({
      'sophia.viewer.v1.bea.p2': JSON.stringify({ lens: 'converse', drafts: {} }),
      'sophia.theme': 'dark',
    })
    assert.equal(forgetViewerDrafts(empty), false)
    assert.deepEqual(JSON.parse(empty.getItem('sophia.viewer.v1.bea.p2') ?? ''), { lens: 'converse', drafts: {} })
  })
})
