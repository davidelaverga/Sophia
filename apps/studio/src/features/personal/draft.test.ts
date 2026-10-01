import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  afterSent,
  draftOf,
  forgetDrafts,
  goingOut,
  keptAs,
  keptIn,
  NOTHING_KEPT,
  onOpening,
  restoredDraft,
} from './draft.ts'

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
    assert.deepEqual(keptIn(keptAs({ draft: hello, sending: null }, 3), 3).draft, hello)
    assert.deepEqual(keptIn(keptAs({ draft: hello, sending: null }, 4), 3).draft, hello)
  })

  it('shows none written before an erasure, wherever it happened, nor anything it can’t read', () => {
    assert.deepEqual(keptIn(keptAs({ draft: hello, sending: null }, 2), 3), NOTHING_KEPT)
    assert.deepEqual(keptIn('Hello', 0), NOTHING_KEPT, 'words kept without their epoch, as before it was kept')
    assert.equal(keptIn('{"text":"Hello","epoch":0}', 0).draft, null, 'nor without the key they go under')
    assert.deepEqual(keptIn(null, 0), NOTHING_KEPT)
  })

  it('keeps nothing for an empty field with nothing on its way', () => {
    assert.equal(keptAs({ draft: draftOf(''), sending: null }, 1), null)
    assert.equal(keptAs(NOTHING_KEPT, 1), null)
  })

  it('gives each version of the words a key of its own', () => {
    assert.notEqual(draftOf('Hello').key, draftOf('Hello').key)
  })
})

describe('the words on their way', () => {
  const words = draftOf('On its way')

  it('leave the draft, and are kept apart from it, so no other tab shows them in its field', () => {
    const out = goingOut(words, 5_000)
    assert.equal(out.draft, null)
    assert.deepEqual(out.sending, { ...words, until: 5_000 })
    const typed = { ...out, draft: draftOf('Typed meanwhile') }
    const read = keptIn(keptAs(typed, 1), 1)
    assert.equal(read.draft?.text, 'Typed meanwhile', 'what another tab’s field shows')
    assert.deepEqual(read.sending, out.sending)
  })

  it('are let go once sent, and only they: the draft stays, and so do another tab’s words on their way', () => {
    const typed = draftOf('Typed meanwhile')
    assert.deepEqual(afterSent({ draft: typed, sending: { ...words, until: 1 } }, words), {
      draft: typed,
      sending: null,
    })
    const theirs = { ...draftOf('Theirs'), until: 1 }
    assert.deepEqual(afterSent({ draft: typed, sending: theirs }, words), { draft: typed, sending: theirs })
  })
})

describe('words on their way that a tab left behind', () => {
  const words = draftOf('On its way')

  it('stay away while the tab sending them may still be waiting for them', () => {
    const kept = { draft: draftOf('Typed'), sending: { ...words, until: 2_000 } }
    assert.deepEqual(onOpening(kept, 1_000), { draft: kept.draft, back: false })
  })

  it('come back once its time is up, under their own key when nothing was typed after them', () => {
    assert.deepEqual(onOpening({ draft: null, sending: { ...words, until: 1_000 } }, 2_000), {
      draft: words,
      back: true,
    })
    const ahead = onOpening({ draft: draftOf('Typed'), sending: { ...words, until: 1_000 } }, 2_000)
    assert.equal(ahead.draft?.text, 'On its way\nTyped')
    assert.notEqual(ahead.draft?.key, words.key, 'with what was typed after them, a message of its own')
    assert.equal(ahead.back, true)
  })
})

describe('words that didn’t go', () => {
  it('come back ahead of anything written meanwhile, so nothing typed is lost', () => {
    assert.equal(restoredDraft('First thought', ''), 'First thought')
    assert.equal(restoredDraft('First thought', '  '), 'First thought')
    assert.equal(restoredDraft('First thought', 'and a second'), 'First thought\nand a second')
  })
})

describe('signing out where the browser keeps nothing', () => {
  it('never throws: a page without storage still signs out', () => {
    // Node has no localStorage: reaching it throws, as it does in a browser that blocks storage.
    assert.doesNotThrow(() => forgetDrafts())
  })
})
