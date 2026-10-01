import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  afterSent,
  draftOf,
  forgetDrafts,
  goingOut,
  keptAs,
  keptEpoch,
  keptIn,
  NOTHING_KEPT,
  onOpening,
  oneAtATime,
  onItsWayNow,
  restoredDraft,
  waitsFor,
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

describe('the epoch the device keeps words in', () => {
  it('is never older than the one it keeps: a tab behind it never makes newer words look erased', () => {
    const kept = keptAs({ draft: draftOf('After the erasure'), sending: null }, 4)
    assert.equal(keptEpoch(kept, 3), 4, 'a tab whose space is behind keeps them in the newer epoch')
    assert.equal(keptEpoch(kept, 5), 5)
    assert.equal(keptEpoch(null, 2), 2)
    assert.equal(keptIn(kept, 3).at, 4, 'and says which it is')
  })
})

describe('the words on their way', () => {
  const words = draftOf('On its way')

  it('leave the draft, and are kept apart from it, so no other tab shows them in its field', () => {
    const out = goingOut({ draft: words, sending: null }, words, 5_000)
    assert.equal(out.draft, null)
    assert.deepEqual(out.sending, { ...words, until: 5_000 })
    const typed = { ...out, draft: draftOf('Typed meanwhile') }
    const read = keptIn(keptAs(typed, 1), 1)
    assert.equal(read.draft?.text, 'Typed meanwhile', 'what another tab’s field shows')
    assert.deepEqual(read.sending, out.sending)
  })

  it('leave another tab’s newer draft where it is, when this tab hadn’t heard of it', () => {
    const theirs = draftOf('Newer, from the other tab')
    assert.deepEqual(goingOut({ draft: theirs, sending: null }, words, 5_000), {
      draft: theirs,
      sending: { ...words, until: 5_000 },
    })
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

describe('one message on its way per device', () => {
  const theirs = { ...draftOf('On its way from another tab'), until: 5_000 }
  const mine = draftOf('Typed here')

  it('words wait while another tab’s are on their way, in time', () => {
    assert.equal(waitsFor({ draft: mine, sending: theirs }, mine, 4_000), true)
  })

  it('a way to start (no draft of its own) waits for any tab’s words on their way, in time', () => {
    assert.equal(onItsWayNow({ draft: null, sending: theirs }, 4_000), true)
    assert.equal(onItsWayNow({ draft: null, sending: theirs }, 5_000), false)
    assert.equal(onItsWayNow(NOTHING_KEPT, 4_000), false)
  })

  it('they don’t wait for the same draft (one message), for words whose time is up, or for nothing', () => {
    assert.equal(waitsFor({ draft: null, sending: theirs }, theirs, 4_000), false)
    assert.equal(waitsFor({ draft: mine, sending: theirs }, mine, 5_000), false)
    assert.equal(waitsFor({ draft: mine, sending: null }, mine, 4_000), false)
  })
})

describe('one send at a time on the device', () => {
  it('a send while another holds the device’s lock is told it is taken', async () => {
    const held = Promise.withResolvers<void>()
    const first = oneAtATime('ana', async (taken) => {
      await held.promise
      return taken ? 'waited' : 'went'
    })
    const second = await oneAtATime('ana', (taken) => Promise.resolve(taken ? 'waits' : 'went'))
    held.resolve()
    assert.equal(second, 'waits')
    assert.equal(await first, 'went')
  })

  it('another account’s send, or one after the first has settled, goes', async () => {
    const held = Promise.withResolvers<void>()
    const first = oneAtATime('ana', () => held.promise)
    assert.equal(await oneAtATime('ben', (taken) => Promise.resolve(taken ? 'waits' : 'went')), 'went')
    held.resolve()
    await first
    assert.equal(await oneAtATime('ana', (taken) => Promise.resolve(taken ? 'waits' : 'went')), 'went')
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
