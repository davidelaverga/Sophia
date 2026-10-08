import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { refusalWords, statementFrom } from './decide.ts'

describe('a message proposed as a decision (C7)', () => {
  it('a member’s words, on one line, as written', () => {
    assert.equal(statementFrom('One page,\nwith the sources inline, then.', false), 'One page, with the sources inline, then.')
  })

  it('Sophia’s words without the marks they are drawn with', () => {
    assert.equal(
      statementFrom('Where it stands:\n- Marco: One page.\n- Lucía: Sources inline.', true),
      'Where it stands: Marco: One page. · Lucía: Sources inline.',
    )
  })

  it('a long message is cut after a sentence within 200 characters', () => {
    const long = `${'The brief keeps to one page so a new admin reads it in a minute. '.repeat(4)}`
    const cut = statementFrom(long, false)
    assert.ok(cut.length <= 200, String(cut.length))
    assert.ok(cut.endsWith('minute.'), cut)
  })

  it('one long sentence is cut at a word, and says so', () => {
    const cut = statementFrom(`Keep ${'everything '.repeat(40)}short`, false)
    assert.ok(cut.length <= 201, String(cut.length))
    assert.ok(cut.endsWith('everything…'), cut)
  })
})

describe('a refused decision', () => {
  it('a stale revision says someone decided first; anything else says try again', () => {
    assert.equal(
      refusalWords(new ApiError(409, 'stale_revision', 'stale', 'never')),
      'Someone decided it first. This is the brief as it is now.',
    )
    assert.equal(
      refusalWords(new ApiError(503, 'unavailable', 'down', 'safe_read')),
      'That couldn’t be done. Try again in a moment.',
    )
  })
})
