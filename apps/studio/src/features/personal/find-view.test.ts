import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Row } from './conversation-view.ts'
import { marksIn, richLines, shownOf } from '../../app/rich-text.ts'
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

  it('folds case as Unicode does: a final sigma, a long s, a sharp s (Codex P2 on #406)', () => {
    assert.deepEqual(pieces('ΟΣ', 'ος'), [{ text: 'ΟΣ', n: 0 }])
    assert.deepEqual(pieces('Die ſtraße', 'STRASSE'), [
      { text: 'Die ', n: null },
      { text: 'ſtraße', n: 0 },
    ])
  })

  it('finds capital sharp S by ss or ß, and ß by it (Codex P2 on #433)', () => {
    assert.deepEqual(pieces('ẞ', 'ss'), [{ text: 'ẞ', n: 0 }])
    assert.deepEqual(pieces('STRAẞE', 'straße'), [{ text: 'STRAẞE', n: 0 }])
    assert.deepEqual(pieces('Die Straße', 'ẞ'), [
      { text: 'Die Stra', n: null },
      { text: 'ß', n: 0 },
      { text: 'e', n: null },
    ])
  })

  it('finds a standalone mark as written, and never matches across one (Codex P2 on #406)', () => {
    assert.deepEqual(pieces('2^8 and `x`', '^'), [
      { text: '2', n: null },
      { text: '^', n: 0 },
      { text: '8 and `x`', n: null },
    ])
    assert.deepEqual(pieces('a^b', 'ab'), [{ text: 'a^b', n: null }])
    // An accent on its letter still folds away.
    assert.deepEqual(pieces('Café', 'cafe'), [{ text: 'Café', n: 0 }])
  })

  it('marks a character once even when its decomposition repeats what is sought (Codex P2 on #406)', () => {
    // U+113C5 decomposes to U+113C2 twice: one character, one match.
    assert.equal(
      pieces('\u{113C5}', '\u{113C2}').filter((p) => p.n !== null).length,
      '\u{113C5}'.normalize('NFD') === '\u{113C2}\u{113C2}' ? 1 : 0,
    )
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

describe('finding whatever the accents (find-accents.md)', () => {
  it('matches as the notes’ search does: no case, no accents, the words cut as written', () => {
    assert.deepEqual(pieces('Un café y una mañana', 'cafe'), [
      { text: 'Un ', n: null },
      { text: 'café', n: 0 },
      { text: ' y una mañana', n: null },
    ])
    assert.deepEqual(pieces('Un cafe', 'café'), [
      { text: 'Un ', n: null },
      { text: 'cafe', n: 0 },
    ])
    assert.deepEqual(pieces('MAÑANA temprano', 'manana'), [
      { text: 'MAÑANA', n: 0 },
      { text: ' temprano', n: null },
    ])
  })

  it('keeps an accent typed as its own mark with its letter', () => {
    assert.deepEqual(pieces('Un café aquí', 'cafe'), [
      { text: 'Un ', n: null },
      { text: 'café', n: 0 },
      { text: ' aquí', n: null },
    ])
    assert.deepEqual(foundIn([said('a', 'Café o te')], 'CAFÉ'), [{ key: 'a', n: 0 }])
  })
})

// What Find marks and what RichText draws agree (docs/plans/personal-replies-formatted.md): each piece's part of the
// marks, rebuilt line by line, is the words as shown, and every match counted is drawn.
describe('finding in formatted words', () => {
  const TRICKY = [
    ['Start with **the one figure** you trust', 'one figure you'],
    ['run `sum Q3` once, then **Q3** again', 'q3'],
    ['> quoted **bold**\n\n> second `code`', 'o'],
    ['see https://example.com/**draft** and **https://example.com/plan**', 'example'],
    ['2 ** 3 and `open and ****', '**'],
    ['**a****b** `x``y`', 'ab'],
    ['Ünïcode **İstanbul** straße', 'istanbul strasse'],
    ['', 'x'],
  ] as const

  for (const [text, query] of TRICKY) {
    it(`agrees for ${JSON.stringify(text)} and ${JSON.stringify(query)}`, () => {
      const shown = shownOf(text)
      const marks = pieces(shown, query)
      let at = 0
      const drawn = new Set<number>()
      const rebuilt = richLines(text).map((line) => {
        const words = line.pieces.map((p) => {
          const part = marksIn(marks, at, (at += p.text.length))
          for (const m of part) if (m.n !== null) drawn.add(m.n)
          return part.map((m) => m.text).join('')
        })
        at += 1
        return words.join('')
      })
      assert.equal(rebuilt.join('\n'), shown)
      assert.equal(foundIn([said('t', text)], query).length, drawn.size)
    })
  }
})
