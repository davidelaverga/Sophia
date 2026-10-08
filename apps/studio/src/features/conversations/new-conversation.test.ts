import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision } from '@sophia/contracts'
import { askOf, startable, startersOf } from './new-conversation.ts'

const pending = (statement: string) => ({ statement, state: 'proposed' }) as unknown as MissionDecision

describe('starting a conversation (C8)', () => {
  it('an empty first message is the question; words are trimmed', () => {
    assert.deepEqual(askOf({ title: '  Short or long briefs? ', text: '  ', askSophia: true }), {
      title: 'Short or long briefs?',
      text: 'Short or long briefs?',
      askSophia: true,
    })
    assert.deepEqual(askOf({ title: 'Q', text: ' More. ', askSophia: false }), {
      title: 'Q',
      text: 'More.',
      askSophia: false,
    })
  })

  it('a question is enough to start', () => {
    assert.equal(startable({ title: 'Q', text: '', askSophia: true }), true)
    assert.equal(startable({ title: '   ', text: 'Only context', askSophia: true }), false)
  })

  it('the starters: proposals waiting, three at most, none already the question', () => {
    const all = ['Map first, list second', 'Name a setup owner', 'Cite every claim', 'One page'].map(pending)
    assert.deepEqual(startersOf(all, ''), ['Map first, list second', 'Name a setup owner', 'Cite every claim'])
    assert.deepEqual(startersOf(all, 'Name a setup owner'), ['Map first, list second', 'Cite every claim', 'One page'])
    assert.deepEqual(startersOf(undefined, ''), [])
  })
})
