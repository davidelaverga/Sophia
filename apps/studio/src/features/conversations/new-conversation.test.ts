import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision } from '@sophia/contracts'
import { askOf, fitQuestion, QUESTION_LIMIT, sameQuestion, startable, startersOf } from './new-conversation.ts'

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

/** A conversation here, by its title and when it last moved. */
const asked = (id: string, title: string, lastAt: string) => ({ id, title, lastAt })

describe('the same question, already asked here', () => {
  const here = [
    asked('c1', 'What makes a report worth reading?', '2026-10-06T05:42:00Z'),
    asked('c2', 'Short or long briefs?', '2026-10-05T10:00:00Z'),
    asked('c3', 'Who owns setup when an admin changes?', '2026-10-04T09:00:00Z'),
  ]
  it('finds the conversation that asks about the same thing, its words in any order', () => {
    assert.equal(sameQuestion('Should briefs be short or long?', here)?.id, 'c2')
    assert.equal(sameQuestion('What makes a good report?', here)?.id, 'c1')
    assert.equal(sameQuestion('who owns the setup after an admin change', here)?.id, 'c3')
  })
  it('says nothing for one shared word, only common words, or too few of the question’s', () => {
    assert.equal(sameQuestion('Budget for the Q4 hiring plan', here), null)
    assert.equal(sameQuestion('What should we do?', here), null)
    assert.equal(sameQuestion('A report', here), null)
    assert.equal(sameQuestion('Report deadlines, owners, reviewers and the launch budget', here), null)
    assert.equal(sameQuestion('', here), null)
  })
  it('takes the most shared, then the newest', () => {
    const two = [
      asked('old', 'Short briefs or long briefs?', '2026-10-01T00:00:00Z'),
      asked('new', 'Long or short briefs?', '2026-10-07T00:00:00Z'),
    ]
    assert.equal(sameQuestion('Should briefs be short or long?', two)?.id, 'new')
  })
})

describe('words given as a question', () => {
  it('fit its limit: as they are when short, cut at a word with an ellipsis when longer', () => {
    assert.equal(fitQuestion('  zebra crossings  '), 'zebra crossings')
    const long = Array.from({ length: 40 }, (_, i) => `word${String(i)}`).join(' ')
    const fitted = fitQuestion(long)
    assert.ok(fitted.length <= QUESTION_LIMIT, String(fitted.length))
    assert.ok(fitted.endsWith('…'))
    assert.ok(long.startsWith(fitted.slice(0, -1)))
  })
})
