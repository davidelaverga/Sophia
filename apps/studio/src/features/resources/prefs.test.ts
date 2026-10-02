import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linkedResource, linkHash } from './link.ts'
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
    savePrefs('luis', { filter: 'mine', order: 'tool' }, store)
    assert.deepEqual(readPrefs('luis', store), { filter: 'mine', order: 'tool' })
    assert.deepEqual(readPrefs('davide', store), DEFAULT_PREFS)
  })

  it('opens as All, by attention, when nothing was kept, it can’t be read, or it is not a filter and an order', () => {
    const store = memory()
    assert.deepEqual(readPrefs('luis', store), DEFAULT_PREFS)
    store.kept.set(prefsKey('luis'), '{not json')
    assert.deepEqual(readPrefs('luis', store), DEFAULT_PREFS)
    store.kept.set(prefsKey('luis'), JSON.stringify({ filter: 'everything', order: 'tool' }))
    assert.deepEqual(readPrefs('luis', store), { filter: 'all', order: 'tool' })
    assert.deepEqual(readPrefs('luis', memory(true)), DEFAULT_PREFS)
    assert.deepEqual(readPrefs('luis', null), DEFAULT_PREFS)
    assert.doesNotThrow(() => savePrefs('luis', DEFAULT_PREFS, memory(true)))
  })
})

describe('a resource’s address', () => {
  it('opens the resource it names, and nothing else', () => {
    const ids = ['davide-codex', 'luis-claude']
    assert.equal(linkHash('davide-codex'), '#resource-davide-codex')
    assert.equal(linkedResource('#resource-davide-codex', ids), 'davide-codex')
    assert.equal(linkedResource('#resource-nobody', ids), null)
    assert.equal(linkedResource('#davide-codex', ids), null)
    assert.equal(linkedResource('', ids), null)
    assert.equal(linkedResource('#resource-%E0%A4%A', ids), null) // a broken escape opens nothing
  })
})
