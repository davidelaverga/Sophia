import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sameQuestionLine } from './same-question-view.ts'

describe('the same question’s line (Codex P1 on #266)', () => {
  it('leads with where it was asked and names the conversation in quotes, its title whole and trimmed', () => {
    assert.deepEqual(sameQuestionLine('Short or long briefs?'), {
      lead: 'Already asked here:',
      press: '“Short or long briefs?”',
    })
    assert.equal(sameQuestionLine('  Who owns setup?  ').press, '“Who owns setup?”')
  })
})
