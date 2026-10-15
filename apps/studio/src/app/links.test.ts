import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linksIn, spans } from './links.ts'

describe('links in a message (message-links.md)', () => {
  it('finds each web address, its trailing punctuation left out', () => {
    const text = 'The deck: https://example.com/deck?v=2. And http://a.test/x, then (https://b.test/y).'
    assert.deepEqual(
      linksIn(text).map((l) => [text.slice(l.start, l.end), l.href]),
      [
        ['https://example.com/deck?v=2', 'https://example.com/deck?v=2'],
        ['http://a.test/x', 'http://a.test/x'],
        ['https://b.test/y', 'https://b.test/y'],
      ],
    )
  })

  it('keeps a closing bracket that belongs to the address', () => {
    const text = 'See https://en.wikipedia.org/wiki/Bridge_(game) now'
    assert.deepEqual(
      linksIn(text).map((l) => l.href),
      ['https://en.wikipedia.org/wiki/Bridge_(game)'],
    )
  })

  it('makes nothing of what isn’t a web address', () => {
    assert.deepEqual(linksIn('javascript:alert(1) ftp://x.test mailto:a@b.test https:// nope'), [])
    assert.deepEqual(linksIn('no links here'), [])
  })

  it('weaves the links with what Find marks, numbering kept, an address never cut in two', () => {
    const text = 'Read https://a.test/deck soon'
    const marks = [
      { text: 'Read https://a.test/', n: null },
      { text: 'deck', n: 0 },
      { text: ' soon', n: null },
    ]
    assert.deepEqual(spans(text, linksIn(text), marks), [
      { text: 'Read ', href: null, n: null },
      { text: 'https://a.test/', href: 'https://a.test/deck', n: null },
      { text: 'deck', href: 'https://a.test/deck', n: 0 },
      { text: ' soon', href: null, n: null },
    ])
    assert.deepEqual(spans('plain', [], [{ text: 'plain', n: null }]), [{ text: 'plain', href: null, n: null }])
  })
})
