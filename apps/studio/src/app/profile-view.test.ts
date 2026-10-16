import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../api/client.ts'
import { canSave, conflictWords, nameProblem, readTrouble, saveWords } from './profile-view.ts'

const refused = (status: number, code: string, message = 'No.') => new ApiError(status, code, message, 'never')

describe('a name that can be saved (0062)', () => {
  it('waits on an empty or spaces-only name without a word; refuses an address, hidden characters and length', () => {
    assert.equal(nameProblem(''), null)
    assert.equal(nameProblem('   '), null)
    assert.equal(canSave('   ', null), false)
    assert.equal(nameProblem('ana@sophia.test'), 'A name, not an email address.')
    assert.equal(nameProblem('Ana @ home'), 'A name, not an email address.')
    assert.equal(nameProblem('An\u0007a'), 'Use letters, numbers and spaces.')
    assert.equal(nameProblem('Ana\nRuiz'), 'Use letters, numbers and spaces.')
    assert.equal(nameProblem('An\u202Ea'), 'Use letters, numbers and spaces.')
    assert.equal(nameProblem('A\u200Bna'), 'Use letters, numbers and spaces.')
    assert.equal(nameProblem('x'.repeat(61)), 'At most 60 characters.')
    assert.equal(nameProblem('x'.repeat(60)), null)
    // Counted as the API counts: 60 emoji are 60 characters, though JavaScript sees 120 units.
    assert.equal(nameProblem('😀'.repeat(60)), null)
    assert.equal(nameProblem('  Ana López  '), null)
  })

  it('offers Save only for a name that differs from the one kept, trimmed', () => {
    assert.equal(canSave('Ana', null), true)
    assert.equal(canSave(' Ana ', 'Ana'), false)
    assert.equal(canSave('Ana Ruiz', 'Ana'), true)
    assert.equal(canSave('ana@x.io', null), false)
  })
})

describe('what a read or a save that didn’t go through says', () => {
  it('tells a server without profiles from a refused account and from a failed read', () => {
    assert.equal(readTrouble(refused(404, 'http_404')), 'unavailable')
    assert.equal(readTrouble(refused(401, 'actor_context_required')), 'signed_out')
    assert.equal(readTrouble(refused(403, 'forbidden')), 'signed_out')
    assert.equal(readTrouble(refused(503, 'unavailable')), 'failed')
    assert.equal(readTrouble(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'safe_read')), 'failed')
    assert.equal(readTrouble(new Error('boom')), 'failed')
  })

  it('says a refused name in the Studio’s words, never the schema’s', () => {
    const schema = refused(422, 'invalid_request', 'body/displayName must NOT have more than 60 characters')
    assert.equal(saveWords(schema, 'x'.repeat(61)), 'At most 60 characters.')
    assert.equal(
      saveWords(refused(422, 'invalid_request', 'Invalid display name'), 'An\u2028a'),
      'Use letters, numbers and spaces.',
    )
    assert.equal(
      saveWords(refused(422, 'invalid_request', 'Invalid display name'), 'Ana'),
      'That name can’t be used. Try letters, numbers and spaces.',
    )
    assert.equal(saveWords(refused(401, 'actor_context_required'), 'Ana'), 'Sign in again to change your name.')
    assert.equal(saveWords(refused(503, 'unavailable', 'Unavailable'), 'Ana'), 'Unavailable')
  })

  it('names the name a conflict found, and keeps the person’s own to save again', () => {
    assert.equal(conflictWords('Bea'), 'Changed elsewhere to «Bea». Save to use yours instead.')
    assert.equal(conflictWords(null), 'Changed elsewhere. Save to use yours instead.')
  })
})
