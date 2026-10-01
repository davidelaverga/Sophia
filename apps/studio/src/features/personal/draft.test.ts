import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { forgetDrafts, restoredDraft } from './draft.ts'

/** A store holding these keys, as a browser's localStorage lists them. */
function store(keys: string[]) {
  const held = [...keys]
  return {
    held,
    get length() {
      return held.length
    },
    key: (i: number) => held[i] ?? null,
    removeItem: (key: string) => {
      held.splice(held.indexOf(key), 1)
    },
  }
}

describe('drafts on this device', () => {
  it('are all forgotten when someone signs out, and nothing else is', () => {
    const s = store([
      'sophia.personal.draft.v1.ana@sophia.test',
      'sophia.mic.v1',
      'sophia.personal.draft.v1.luis@sophia.test',
      'sophia.personal.lock.v1.ana@sophia.test',
    ])
    forgetDrafts(s)
    assert.deepEqual(s.held, ['sophia.mic.v1', 'sophia.personal.lock.v1.ana@sophia.test'])
  })
})

describe('words that didn’t go', () => {
  it('come back ahead of anything written meanwhile, so nothing typed is lost', () => {
    assert.equal(restoredDraft('First thought', ''), 'First thought')
    assert.equal(restoredDraft('First thought', '  '), 'First thought')
    assert.equal(restoredDraft('First thought', 'and a second'), 'First thought\nand a second')
  })
})
