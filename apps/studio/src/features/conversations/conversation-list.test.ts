import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationSummary } from '../../api/vision.ts'
import {
  acceptedOf,
  continuesRun,
  initialOf,
  withMessage,
  answeredAfter,
  firstWords,
  pendingOf,
  byActivity,
  contributorsLine,
  matching,
  messageBy,
  openWords,
} from './conversation-list.ts'

const ME = 'me'

const conversation = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: 'c1',
  title: 'What makes a report worth reading?',
  summary: null,
  lastAt: '2026-10-06T09:40:00.000Z',
  contributors: [],
  sophia: false,
  openQuestions: 0,
  output: null,
  ...over,
})

describe('contributorsLine', () => {
  it('names who wrote there, mine as You, and Sophia only where she answered', () => {
    const c = conversation({
      contributors: [
        { actorId: 'l', name: 'Lucía' },
        { actorId: ME, name: 'Fixture viewer' },
      ],
      sophia: true,
    })
    assert.equal(contributorsLine(c, ME), 'Lucía, You · Sophia')
    assert.equal(contributorsLine({ ...c, sophia: false }, ME), 'Lucía, You')
  })

  it('with nobody but Sophia, says Sophia; with nobody, says nobody yet', () => {
    assert.equal(contributorsLine(conversation({ sophia: true }), ME), 'Sophia')
    assert.equal(contributorsLine(conversation(), ME), 'Nobody has written yet')
  })
})

describe('openWords', () => {
  it('counts the open questions in words', () => {
    assert.equal(openWords(0), 'No open questions')
    assert.equal(openWords(1), '1 open question')
    assert.equal(openWords(2), '2 open questions')
  })
})

describe('byActivity', () => {
  it('puts the newest activity first, whatever order they came in', () => {
    const older = conversation({ id: 'a', lastAt: '2026-10-04T11:00:00.000Z' })
    const newer = conversation({ id: 'b', lastAt: '2026-10-06T09:40:00.000Z' })
    assert.deepEqual(
      byActivity([older, newer]).map((c) => c.id),
      ['b', 'a'],
    )
  })
})

describe('matching', () => {
  it('keeps the titles that have the words, in any case and with or without accents', () => {
    const all = [
      conversation({ id: 'a', title: 'Short or long briefs?' }),
      conversation({ id: 'b', title: 'Lucía’s data' }),
    ]
    assert.deepEqual(
      matching(all, '  BRIEF ').map((c) => c.id),
      ['a'],
    )
    assert.deepEqual(
      matching(all, 'lucia').map((c) => c.id),
      ['b'],
    )
    assert.equal(matching(all, '').length, 2)
    // Every word, in any order.
    assert.deepEqual(
      matching(all, 'briefs short').map((c) => c.id),
      ['a'],
    )
    assert.equal(matching(all, 'short data').length, 0)
  })
})

const decision = (id: string, decidedAt: string | null, state: MissionDecision['state'] = 'accepted') =>
  ({ id, statement: id, state, decidedAt, createdAt: '2026-10-01T00:00:00.000Z' }) as unknown as MissionDecision

describe('acceptedOf', () => {
  it('shows the three newest accepted decisions and counts the rest', () => {
    const all = ['1', '2', '3', '4', '5'].map((n) => decision(n, `2026-10-0${n}T09:00:00.000Z`))
    const { shown, more } = acceptedOf(all)
    assert.deepEqual(
      shown.map((d) => d.id),
      ['5', '4', '3'],
    )
    assert.equal(more, 2)
  })

  it('never shows what wasn’t accepted', () => {
    const { shown, more } = acceptedOf([decision('a', null, 'proposed'), decision('b', '2026-10-02T00:00:00.000Z')])
    assert.deepEqual(
      shown.map((d) => d.id),
      ['b'],
    )
    assert.equal(more, 0)
  })
})

describe('messageBy', () => {
  it('names Sophia, mine as You, and a member by name', () => {
    assert.equal(messageBy({ author: 'sophia', actorId: null, name: null }, ME), 'Sophia')
    assert.equal(messageBy({ author: 'member', actorId: ME, name: 'Fixture viewer' }, ME), 'You')
    assert.equal(messageBy({ author: 'member', actorId: 'l', name: 'Lucía' }, ME), 'Lucía')
    assert.equal(messageBy({ author: 'member', actorId: 'x', name: null }, ME), 'A member')
  })
})

describe('pendingOf', () => {
  it('shows the three newest proposals and counts the rest', () => {
    const all = ['1', '2', '3', '4'].map((n) => decision(n, `2026-10-0${n}T09:00:00.000Z`, 'proposed'))
    const { shown, more } = pendingOf(all)
    assert.deepEqual(
      shown.map((d) => d.id),
      ['4', '3', '2'],
    )
    assert.equal(more, 1)
  })
})

const m = (minute: number, author: 'member' | 'sophia') => ({
  author,
  at: `2026-10-06T10:${String(minute).padStart(2, '0')}:00.000Z`,
})
const ASKED = '2026-10-06T10:05:00.000Z'

describe('answeredAfter', () => {
  it('is true only when Sophia wrote after she was asked', () => {
    assert.equal(answeredAfter([m(5, 'member'), m(6, 'sophia')], ASKED), true)
    assert.equal(answeredAfter([m(4, 'sophia'), m(5, 'member')], ASKED), false)
    assert.equal(answeredAfter([m(5, 'member'), m(7, 'member')], ASKED), false)
    // Her answer counts wherever the page holds it, even with the message asked out of the page.
    assert.equal(answeredAfter([m(8, 'member'), m(9, 'sophia')], ASKED), true)
  })
})

describe('firstWords', () => {
  it('keeps a short message whole and cuts a long one with an ellipsis', () => {
    assert.equal(firstWords('Did this one land?'), 'Did this one land?')
    assert.equal(firstWords('x'.repeat(60)).length, 48)
    assert.ok(firstWords('x'.repeat(60)).endsWith('…'))
  })
})

const pageOf = (ids: string[], before: string | null) => ({ messages: ids.map((id) => ({ id })), before })

describe('withMessage', () => {
  it('puts the accepted message at the end of the newest page, once', () => {
    const read = { pages: [pageOf(['c', 'd'], '2'), pageOf(['a', 'b'], null)], pageParams: [null, '2'] }
    const once = withMessage(read, { id: 'e' })
    assert.deepEqual(
      once?.pages.map((p) => p.messages.map((msg) => msg.id)),
      [
        ['c', 'd', 'e'],
        ['a', 'b'],
      ],
    )
    assert.equal(withMessage(once, { id: 'e' }), once)
  })

  it('leaves a conversation not read yet as it is', () => {
    assert.equal(withMessage(undefined, { id: 'e' }), undefined)
  })
})

/** A message as a run sees it. */
const said = (author: 'member' | 'sophia', actorId: string | null, at: string) => ({ author, actorId, at })

describe('continuesRun: a message that goes on from the one before it', () => {
  it('goes on: the same person within five minutes', () => {
    assert.equal(
      continuesRun(said('member', 'a', '2026-10-06T09:00:00Z'), said('member', 'a', '2026-10-06T09:04:59Z')),
      true,
    )
  })
  it('starts a run: five minutes or more, another person, or Sophia after a person', () => {
    assert.equal(
      continuesRun(said('member', 'a', '2026-10-06T09:00:00Z'), said('member', 'a', '2026-10-06T09:05:00Z')),
      false,
    )
    assert.equal(
      continuesRun(said('member', 'a', '2026-10-06T09:00:00Z'), said('member', 'b', '2026-10-06T09:01:00Z')),
      false,
    )
    assert.equal(
      continuesRun(said('member', null, '2026-10-06T09:00:00Z'), said('sophia', null, '2026-10-06T09:01:00Z')),
      false,
    )
  })
  it('goes on for Sophia after Sophia, and never from nothing', () => {
    assert.equal(
      continuesRun(said('sophia', null, '2026-10-06T09:00:00Z'), said('sophia', null, '2026-10-06T09:02:00Z')),
      true,
    )
    assert.equal(continuesRun(undefined, said('member', 'a', '2026-10-06T09:00:00Z')), false)
  })
})

describe('initialOf: a face’s letter', () => {
  it('is the name’s first letter, upper case; «A member» without a name', () => {
    assert.equal(initialOf('lucía'), 'L')
    assert.equal(initialOf(' Ángel'), 'Á')
    assert.equal(initialOf(null), 'A')
  })
})
