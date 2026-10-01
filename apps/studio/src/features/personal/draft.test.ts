import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterSent, draftIn, draftKept, draftOf, draftToStore, forgetDrafts, restoredDraft } from './draft.ts'

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
      'sophia.personal.draft.v2.luis@sophia.test',
      'sophia.personal.lock.v1.ana@sophia.test',
    ])
    forgetDrafts(s)
    assert.deepEqual(s.held, ['sophia.mic.v1', 'sophia.personal.lock.v1.ana@sophia.test'])
  })
})

describe('a draft and the erasures since it was written', () => {
  const hello = draftOf('Hello')

  it('shows the words written in the space’s epoch, or in a later one another tab has read, with their key', () => {
    assert.deepEqual(draftIn(draftKept(hello, 3), 3), hello)
    assert.deepEqual(draftIn(draftKept(hello, 4), 3), hello)
  })

  it('shows none written before an erasure, wherever it happened, nor anything it can’t read', () => {
    assert.equal(draftIn(draftKept(hello, 2), 3), null)
    assert.equal(draftIn('Hello', 0), null, 'words kept without their epoch, as before it was kept')
    assert.equal(draftIn('{"text":"Hello","epoch":0}', 0), null, 'nor without the key they go under')
    assert.equal(draftIn(null, 0), null)
  })

  it('keeps nothing for an empty field', () => {
    assert.equal(draftKept(draftOf(''), 1), null)
    assert.equal(draftKept(null, 1), null)
  })

  it('gives each version of the words a key of its own', () => {
    assert.notEqual(draftOf('Hello').key, draftOf('Hello').key)
  })
})

describe('the draft once a message went', () => {
  const sent = draftOf('On its way')

  it('keeps nothing when the device holds just the words that went', () => {
    assert.equal(afterSent(sent, sent), null)
    assert.equal(afterSent(null, sent), null)
  })

  it('keeps what was typed after them, as words of their own (a key of their own)', () => {
    const rest = afterSent(draftOf('On its way\nAnd more'), sent)
    assert.equal(rest?.text, 'And more')
    assert.notEqual(rest?.key, sent.key)
  })

  it('keeps another tab’s words as they are', () => {
    const theirs = draftOf('Written in the other tab')
    assert.equal(afterSent(theirs, sent), theirs)
    const same = draftOf('On its way')
    assert.equal(afterSent(same, sent), same, 'the same words written again are another message')
  })
})

describe('words that didn’t go', () => {
  it('come back ahead of anything written meanwhile, so nothing typed is lost', () => {
    assert.equal(restoredDraft('First thought', ''), 'First thought')
    assert.equal(restoredDraft('First thought', '  '), 'First thought')
    assert.equal(restoredDraft('First thought', 'and a second'), 'First thought\nand a second')
  })
})

describe('the draft while a message is on its way', () => {
  it('keeps the words on their way ahead of anything typed meanwhile, so closing the page loses neither', () => {
    assert.equal(draftToStore(null, 'Typing'), 'Typing')
    assert.equal(draftToStore('On its way', ''), 'On its way')
    assert.equal(draftToStore('On its way', 'More'), 'On its way\nMore')
  })
})

describe('signing out where the browser keeps nothing', () => {
  it('never throws: a page without storage still signs out', () => {
    // Node has no localStorage: reaching it throws, as it does in a browser that blocks storage.
    assert.doesNotThrow(() => forgetDrafts())
  })
})
