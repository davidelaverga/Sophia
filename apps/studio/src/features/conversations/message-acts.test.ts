import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clipOf, quoteOf, withQuote } from './message-acts.ts'

const NOW = Date.parse('2026-10-11T10:00:00Z')

describe('a message’s words taken elsewhere', () => {
  it('quotes each line after «> », then who said them', () => {
    assert.equal(quoteOf({ text: 'Short first.' }, 'Lucía'), '> Short first.\n— Lucía')
    assert.equal(quoteOf({ text: 'One.\nTwo.' }, 'You'), '> One.\n> Two.\n— You')
  })
  it('copies the words, then who and when on their own line', () => {
    assert.match(
      clipOf({ text: 'Map first.', at: '2026-10-06T14:05:00Z' }, 'Lucía', NOW),
      /^Map first\.\n— Lucía, .+ \d\d:\d\d$/,
    )
  })
  it('puts a quote under the draft with a blank line between, and one after for the answer', () => {
    assert.equal(withQuote('', '> A\n— Lucía'), '> A\n— Lucía\n\n')
    assert.equal(withQuote('  ', '> A\n— Lucía'), '> A\n— Lucía\n\n')
    assert.equal(withQuote('Yes.\n', '> A\n— Lucía'), 'Yes.\n\n> A\n— Lucía\n\n')
  })
})
