import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision } from '@sophia/contracts'
import { askOf, startable, startersOf } from './new-conversation.ts'

const pending = (statement: string, day = 1) =>
  ({ statement, state: 'proposed', createdAt: `2026-10-0${String(day)}T09:00:00.000Z` }) as unknown as MissionDecision

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

  it('the starters: proposals waiting, newest first, three at most, none already the question', () => {
    const all = ['One page', 'Cite every claim', 'Name a setup owner', 'Map first, list second'].map((s, i) =>
      pending(s, i + 1),
    )
    assert.deepEqual(startersOf(all, '', 120), ['Map first, list second', 'Name a setup owner', 'Cite every claim'])
    assert.deepEqual(startersOf(all, 'Name a setup owner', 120), [
      'Map first, list second',
      'Cite every claim',
      'One page',
    ])
    assert.deepEqual(startersOf(undefined, '', 120), [])
  })

  it('a proposal longer than a question can be is not offered', () => {
    assert.deepEqual(startersOf([pending('x'.repeat(121)), pending('Short')], '', 120), ['Short'])
  })
})
