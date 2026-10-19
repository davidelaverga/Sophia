import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { heldKey, heldOnlyOf, keepHeld, readHeld, type HeldAt } from './held-in-tab.ts'

/** A tab's session storage: what a reload of the page keeps. */
function tab() {
  const items = new Map<string, string>()
  return {
    items,
    storage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
      key: (i: number) => [...items.keys()][i] ?? null,
      get length() {
        return items.size
      },
    },
  }
}

/** A browser that refuses storage: every call throws. */
const refusing = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
  key: () => {
    throw new Error('SecurityError')
  },
  get length(): number {
    throw new Error('SecurityError')
  },
}

const DAVIDE_TALK: HeldAt = { account: 'davide', part: 'talk', project: 'p1' }
const DAVIDE_ROOM: HeldAt = { account: 'davide', part: 'room', project: 'p1' }
const LUIS_TALK: HeldAt = { account: 'luis', part: 'talk', project: 'p1' }

describe('held writes kept in the tab', () => {
  it('keeps one per account, part and project, read back as kept; null lets it go', () => {
    const { storage, items } = tab()
    keepHeld(DAVIDE_TALK, { c1: { key: 'k1' } }, storage)
    keepHeld(DAVIDE_ROOM, { key: 'k2', text: 'room' }, storage)
    assert.deepEqual(readHeld(DAVIDE_TALK, storage), { c1: { key: 'k1' } })
    assert.deepEqual(readHeld(DAVIDE_ROOM, storage), { key: 'k2', text: 'room' })
    assert.equal(readHeld(LUIS_TALK, storage), null, 'another account’s is none of these')
    assert.equal(items.get(heldKey(DAVIDE_TALK)), JSON.stringify({ c1: { key: 'k1' } }))
    keepHeld(DAVIDE_TALK, null, storage)
    assert.equal(readHeld(DAVIDE_TALK, storage), null)
    assert.equal(items.has(heldKey(DAVIDE_TALK)), false)
  })

  it('names each scope whole, so no two share a key', () => {
    assert.notEqual(
      heldKey({ account: 'a b', part: 'talk', project: 'c' }),
      heldKey({ account: 'a', part: 'talk', project: 'b c' }),
    )
  })

  it('reads an unreadable entry as none', () => {
    const { storage } = tab()
    storage.setItem(heldKey(DAVIDE_TALK), '{not json')
    assert.equal(readHeld(DAVIDE_TALK, storage), null)
  })

  it('keeps only one account’s at a change of who is in, nobody’s at a sign-out, and nothing else of the tab’s', () => {
    const { storage, items } = tab()
    keepHeld(DAVIDE_TALK, { c1: {} }, storage)
    keepHeld(DAVIDE_ROOM, { key: 'k' }, storage)
    keepHeld(LUIS_TALK, { c2: {} }, storage)
    storage.setItem('sophia.review.proposal.v1:["davide","p1","g1"]', '{}')
    heldOnlyOf(undefined, storage)
    assert.equal(items.size, 4, 'while who is in is found out, nothing goes')
    heldOnlyOf('davide', storage)
    assert.deepEqual([...items.keys()].toSorted(), [
      heldKey(DAVIDE_ROOM),
      heldKey(DAVIDE_TALK),
      'sophia.review.proposal.v1:["davide","p1","g1"]',
    ])
    heldOnlyOf(null, storage)
    assert.deepEqual([...items.keys()], ['sophia.review.proposal.v1:["davide","p1","g1"]'])
  })

  it('throws nothing where the browser refuses storage', () => {
    assert.doesNotThrow(() => keepHeld(DAVIDE_TALK, { c1: {} }, refusing))
    assert.equal(readHeld(DAVIDE_TALK, refusing), null)
    assert.doesNotThrow(() => heldOnlyOf(null, refusing))
  })

  it('keeps nothing where there is no storage at all', () => {
    assert.doesNotThrow(() => keepHeld(DAVIDE_TALK, { c1: {} }, null))
    assert.equal(readHeld(DAVIDE_TALK, null), null)
  })
})
