import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linkedId, linkHash, TASK } from './link.ts'
import { DEFAULT_PREFS, prefsKey, readPrefs, savePrefs } from './prefs.ts'

/** A browser's storage, held in a map. */
function memory(throwing = false) {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key: string) => {
      if (throwing) throw new Error('refused')
      return kept.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (throwing) throw new Error('refused')
      kept.set(key, value)
    },
  }
}

describe('what the view remembers', () => {
  it('keeps each viewer’s filter and order apart', () => {
    const store = memory()
    savePrefs('luis', { filter: 'mine', order: 'custom', custom: ['b', 'a'] }, store)
    assert.deepEqual(readPrefs('luis', store), { filter: 'mine', order: 'custom', custom: ['b', 'a'] })
    assert.deepEqual(readPrefs('davide', store), DEFAULT_PREFS)
  })

  it('opens as All, by attention, when nothing was kept, it can’t be read, or it is not a filter and an order', () => {
    const store = memory()
    assert.deepEqual(readPrefs('luis', store), DEFAULT_PREFS)
    store.kept.set(prefsKey('luis'), '{not json')
    assert.deepEqual(readPrefs('luis', store), DEFAULT_PREFS)
    store.kept.set(prefsKey('luis'), JSON.stringify({ filter: 'everything', order: 'tool', custom: ['a', 3] }))
    assert.deepEqual(readPrefs('luis', store), { filter: 'all', order: 'tool', custom: ['a'] })
    assert.deepEqual(readPrefs('luis', memory(true)), DEFAULT_PREFS)
    assert.deepEqual(readPrefs('luis', null), DEFAULT_PREFS)
    assert.doesNotThrow(() => savePrefs('luis', DEFAULT_PREFS, memory(true)))
  })
})

describe('a resource’s address', () => {
  it('names the resource its fragment holds, kept as it is until the resources are read', () => {
    assert.equal(linkHash('davide-codex'), '#resource-davide-codex')
    assert.equal(linkedId('#resource-davide-codex'), 'davide-codex')
    assert.equal(linkedId('#resource-nobody'), 'nobody') // checked against the resources when they arrive
    assert.equal(linkedId('#davide-codex'), null)
    assert.equal(linkedId('#resource-'), null)
    assert.equal(linkedId(''), null)
    assert.equal(linkedId('#resource-%E0%A4%A'), null) // a broken escape names nothing
    // A task's sheet has its own, beside a resource's: neither reads the other's.
    assert.equal(linkHash('work-1', TASK), '#task-work-1')
    assert.equal(linkedId('#task-work-1', TASK), 'work-1')
    assert.equal(linkedId('#task-work-1'), null)
    assert.equal(linkedId('#resource-davide-codex', TASK), null)
  })
})
