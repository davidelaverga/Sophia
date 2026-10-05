import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Row } from './conversation-view.ts'
import { foundIn, pieces } from './find-view.ts'

const said = (key: string, text: string): Row => ({
  kind: 'turn',
  key,
  turn: null,
  author: 'person',
  text,
  at: '10:00',
  first: true,
})

describe('finding in the conversation (personal-moments.md §3)', () => {
  it('cuts a text into what matches, whatever its case, and what doesn’t, counting the matches', () => {
    assert.deepEqual(pieces('Keep it here. I couldn’t keep it', 'keep'), [
      { text: 'Keep', n: 0 },
      { text: ' it here. I couldn’t ', n: null },
      { text: 'keep', n: 1 },
      { text: ' it', n: null },
    ])
    assert.deepEqual(pieces('Nothing here', 'keep'), [{ text: 'Nothing here', n: null }])
    assert.deepEqual(pieces('Keep', '  '), [{ text: 'Keep', n: null }])
    // A letter whose lower case is longer (İ) doesn't hide the rest of the turn from the search.
    assert.deepEqual(pieces('İstanbul, keep it', 'keep'), [
      { text: 'İstanbul, ', n: null },
      { text: 'keep', n: 0 },
      { text: ' it', n: null },
    ])
    // What a query holds is looked for as written, not as a pattern.
    assert.deepEqual(pieces('a (b) c', '(b)'), [
      { text: 'a ', n: null },
      { text: '(b)', n: 0 },
      { text: ' c', n: null },
    ])
  })

  it('finds every match in the turns, in reading order, and nothing in the days', () => {
    const rows: Row[] = [
      { kind: 'day', key: 'day-1', label: 'Keep', note: null },
      said('a', 'I keep putting it off'),
      said('b', 'Keep it here, keep it close'),
    ]
    assert.deepEqual(foundIn(rows, 'KEEP'), [
      { key: 'a', n: 0 },
      { key: 'b', n: 0 },
      { key: 'b', n: 1 },
    ])
    assert.deepEqual(foundIn(rows, ''), [])
  })
})
