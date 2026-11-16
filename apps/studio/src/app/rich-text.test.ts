import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { marksIn, richLines, shownText } from './rich-text.ts'

// Bold, code and quotes in messages (docs/plans/message-format.md).
describe('a message’s marks', () => {
  it('reads a line starting with «> » as a quote, the rest as lines', () => {
    assert.deepEqual(richLines('> Marco said this\nAnd I agree'), [
      { quote: true, pieces: [{ kind: 'text', text: 'Marco said this' }] },
      { quote: false, pieces: [{ kind: 'text', text: 'And I agree' }] },
    ])
  })

  it('reads code first, literally, then bold', () => {
    assert.deepEqual(richLines('Run `**not bold**` then **this** works').at(0)?.pieces, [
      { kind: 'text', text: 'Run ' },
      { kind: 'code', text: '**not bold**' },
      { kind: 'text', text: ' then ' },
      { kind: 'bold', text: 'this' },
      { kind: 'text', text: ' works' },
    ])
  })

  it('keeps an address whole when its path holds marks, and still bolds an address marked around (Codex P2 on #384)', () => {
    assert.deepEqual(richLines('see https://example.com/**draft** now').at(0)?.pieces, [
      { kind: 'text', text: 'see https://example.com/**draft** now' },
    ])
    assert.deepEqual(richLines('**https://example.com/plan** and **this**').at(0)?.pieces, [
      { kind: 'bold', text: 'https://example.com/plan' },
      { kind: 'text', text: ' and ' },
      { kind: 'bold', text: 'this' },
    ])
  })

  it('shows a mark that doesn’t close, or holds nothing, as written', () => {
    assert.deepEqual(richLines('2 ** 3 and `open').at(0)?.pieces, [{ kind: 'text', text: '2 ** 3 and `open' }])
    assert.deepEqual(richLines('****').at(0)?.pieces, [{ kind: 'text', text: '****' }])
    assert.deepEqual(richLines('>no space').at(0), { quote: false, pieces: [{ kind: 'text', text: '>no space' }] })
  })
})

// What Personal's Find and Copy read (docs/plans/personal-replies-formatted.md).
describe('a message as shown', () => {
  it('drops the marks and keeps the lines', () => {
    assert.equal(shownText('Run `sum` **now**\n> as I said\nand **2 ** 3'), 'Run sum now\nas I said\nand **2 ** 3')
    assert.equal(shownText('see https://example.com/**draft**'), 'see https://example.com/**draft**')
  })

  it('cuts Find’s pieces to a span, their numbers kept', () => {
    const marks = [
      { text: 'Start ', n: null },
      { text: 'one fig', n: 0 },
      { text: 'ure', n: null },
    ]
    assert.deepEqual(marksIn(marks, 6, 9), [{ text: 'one', n: 0 }])
    assert.deepEqual(marksIn(marks, 3, 10), [
      { text: 'rt ', n: null },
      { text: 'one ', n: 0 },
    ])
    assert.deepEqual(marksIn(marks, 13, 16), [{ text: 'ure', n: null }])
  })
})
