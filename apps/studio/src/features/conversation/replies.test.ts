import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { quoteOf } from './replies.ts'

describe('quoteOf', () => {
  it('keeps a short message whole, its spaces as one', () => {
    assert.equal(quoteOf('  Agreed:\n one page. '), 'Agreed: one page.')
  })

  it('cuts a long one at the limit, with an ellipsis', () => {
    const quote = quoteOf('Let us keep the report to one page, with the sources inline.', 20)
    assert.equal(quote, 'Let us keep the rep…')
    assert.equal(Array.from(quote).length, 20)
  })

  it('never cuts inside an emoji', () => {
    const family = '👨‍👩‍👧'
    const quote = quoteOf(`${'a'.repeat(18)}${family}${family}${family}`, 20)
    assert.equal(quote, `${'a'.repeat(18)}${family}…`)
  })
})
