import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterGap, gapsIn, jumpReading, pageLinks, windowLinks } from './segment-view.ts'

/** Message n (1-based) of a discussion, a second apart. */
const m = (n: number) => ({
  id: `m${String(n).padStart(3, '0')}`,
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString(),
})
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => m(from + i))

/** A chat that holds the window and the pages read, each before its message: what it shows, and its gaps. */
function chat(total: number, reads: readonly number[]) {
  const all = range(1, total)
  const window = all.slice(-50)
  const shown = new Map(window.map((x) => [x.id, x]))
  const links = new Map(windowLinks(window))
  for (const before of reads) {
    // A23: the 50 before `before`.
    const page = all.slice(Math.max(0, before - 1 - 50), before - 1)
    for (const x of page) shown.set(x.id, x)
    for (const [a, b] of pageLinks(page, m(before).id)) links.set(a, b)
  }
  const list = [...shown.values()]
  return { list, gaps: gapsIn(list, links).map((id) => Number(id.slice(1))) }
}

describe('the gaps that pages read leave (A38, R-C4-01)', () => {
  it('a page read before a message shown joins it: no gap', () => {
    assert.deepEqual(chat(260, []).gaps, [])
    assert.deepEqual(chat(260, [211]).gaps, [])
  })

  it('a found page apart from the window has a gap after its last message', () => {
    assert.deepEqual(chat(260, [101]).gaps, [100])
  })

  it('a second found page overlapping the first never closes the gap to the window (100, then 125)', () => {
    const after = chat(260, [101, 126])
    assert.deepEqual(after.gaps, [125])
    // Filled from below, a page at a time: before 211, then before 161; then none.
    assert.deepEqual(chat(260, [101, 126, 211]).gaps, [125])
    assert.deepEqual(chat(260, [101, 126, 211, 161]).gaps, [])
  })

  it('a disjoint second page keeps both unread intervals, each its own gap', () => {
    assert.deepEqual(chat(260, [151, 41]).gaps, [40, 150])
    // Before 211 reads 161–210: 151–160 are still unread, so the gap after 150 stays.
    assert.deepEqual(chat(260, [151, 41, 211]).gaps, [40, 150])
    assert.deepEqual(chat(260, [151, 41, 211, 161]).gaps, [40])
    assert.deepEqual(chat(260, [151, 41, 211, 161, 101]).gaps, [40])
    assert.deepEqual(chat(260, [151, 41, 211, 161, 101, 51]).gaps, [])
  })

  it('each page is consecutive; its last one’s next is the message it was read before', () => {
    assert.deepEqual(pageLinks([m(2), m(1)], m(3).id), [
      [m(1).id, m(2).id],
      [m(2).id, m(3).id],
    ])
    assert.deepEqual(windowLinks([m(5)]), [])
  })

  it('a gap is filled from the message just after it', () => {
    const shown = [...range(51, 100), ...range(211, 260)]
    assert.deepEqual(afterGap(shown, m(100).id), m(211))
    assert.equal(afterGap(shown, m(260).id), undefined)
  })

  // 4306435434: a search's newest message comes with before null; the latest page is read, and its newest has no next.
  it('the latest page (before null): each links to its next, the newest to none', () => {
    assert.deepEqual(pageLinks([m(2), m(1), m(3)], null), [
      [m(1).id, m(2).id],
      [m(2).id, m(3).id],
    ])
    assert.deepEqual(gapsIn([m(1), m(2), m(3)], new Map(pageLinks([m(1), m(2), m(3)], null))), [])
  })

  // 4306435436: hold A, follow B. A loading: B waits. A answers: B is idle and asks for its own page. A fails: the
  // failure is A's, B is idle and asks for its own page. B's own failure is B's, so B's Try again reads B.
  it('a jump read is owned by its followed address: an older follow never fails a newer one, even both latest', () => {
    // Follows are id#seq; two newest messages both read the latest page (before null) yet stay distinct.
    const A = 'm-a#1'
    const B = 'm-b#1'
    assert.equal(jumpReading({ owner: A, reading: 'loading' }, B), 'loading', 'one at a time: B waits')
    assert.equal(jumpReading({ owner: A, reading: 'idle' }, B), 'idle', 'A answered: B asks for its own page')
    assert.equal(jumpReading({ owner: A, reading: 'failed' }, B), 'idle', 'A failed: not B’s failure')
    assert.equal(jumpReading({ owner: A, reading: 'failed' }, A), 'failed')
    assert.equal(jumpReading({ owner: B, reading: 'failed' }, B), 'failed', 'B’s own failure: its Try again reads B')
    assert.equal(
      jumpReading({ owner: A, reading: 'failed' }, 'm-a#2'),
      'idle',
      'the same message followed again is a new follow',
    )
  })
})
