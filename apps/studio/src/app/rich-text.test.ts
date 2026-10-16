import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { richLines } from './rich-text.ts'

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

  it('shows a mark that doesn’t close, or holds nothing, as written', () => {
    assert.deepEqual(richLines('2 ** 3 and `open').at(0)?.pieces, [{ kind: 'text', text: '2 ** 3 and `open' }])
    assert.deepEqual(richLines('****').at(0)?.pieces, [{ kind: 'text', text: '****' }])
    assert.deepEqual(richLines('>no space').at(0), { quote: false, pieces: [{ kind: 'text', text: '>no space' }] })
  })
})
