import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationMessage, ConversationReply, ConversationSummary } from '../../api/conversations.ts'
import {
  acceptedOf,
  continuesRun,
  initialOf,
  withMessage,
  firstWords,
  gistOf,
  withLastMessage,
  pendingOf,
  byActivity,
  contributorsLine,
  matching,
  messageBy,
  narrowed,
  openWords,
  replyEndWords,
  replyOf,
  replyOpen,
  listWithdrawn,
  withWithdrawn,
} from './conversation-list.ts'

const ME = 'me'

const notAssessed = {
  state: 'not_assessed',
  complete: false,
  fromSeq: null,
  throughSeq: null,
  newer: 0,
  generatedAt: null,
  replyId: null,
  eligibilityRevision: null,
  ledgerRevision: null,
} as const

const conversation = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: 'c1',
  title: 'What makes a report worth reading?',
  revision: 1,
  summary: null,
  summaryCoverage: notAssessed,
  lastAt: '2026-10-06T09:40:00.000Z',
  contributors: [],
  sophia: false,
  openQuestions: 0,
  questionsCoverage: notAssessed,
  output: null,
  lastMessage: null,
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

describe('gistOf', () => {
  const lucia = { actorId: 'lucia', name: 'Lucía' }
  const at = '2026-10-06T09:40:00.000Z'
  it('says the last message, who said it first; else the summary', () => {
    const withSummary = conversation({ summary: 'Short or long.', contributors: [lucia] })
    assert.equal(gistOf(withSummary, ME), 'Short or long.')
    assert.equal(gistOf({ ...withSummary, lastMessage: null }, ME), 'Short or long.')
    const said = (author: 'member' | 'sophia', actorId: string | null, name: string | null = null) =>
      gistOf({ ...withSummary, lastMessage: { author, actorId, name, text: 'One page.', at } }, ME)
    assert.equal(said('member', ME), 'You: One page.')
    assert.equal(said('sophia', null), 'Sophia: One page.')
    assert.equal(said('member', 'lucia'), 'Lucía: One page.')
    assert.equal(said('member', 'gone'), 'Someone: One page.')
    // Not listed, but the message names them.
    assert.equal(said('member', 'marco', 'Marco'), 'Marco: One page.')
  })
})

describe('withLastMessage', () => {
  it('puts a confirmed message as its conversation’s last, its opening cut at 140', () => {
    const at = '2026-10-07T10:00:00.000Z'
    const said = { author: 'member' as const, actorId: ME, name: 'You', text: 'Two pages.', at }
    const list = [
      conversation({ id: 'a', lastMessage: null }),
      conversation({ id: 'b', lastMessage: { ...said, text: 'Old.' } }),
    ]
    const next = withLastMessage(list, 'a', said)
    assert.equal(next[0]?.lastMessage?.text, 'Two pages.')
    assert.equal(next[1]?.lastMessage?.text, 'Old.')
    assert.equal(withLastMessage(list, 'a', { ...said, text: 'x'.repeat(200) })[0]?.lastMessage?.text.length, 140)
    // A withdrawn message (no words) is never anyone's last line.
    assert.equal(withLastMessage(list, 'a', { ...said, text: null })[0]?.lastMessage, null)
  })
})

describe('narrowed', () => {
  const lucia = { actorId: 'lucia', name: 'Lucía' }
  const me = { actorId: ME, name: 'You' }
  const all = [
    conversation({ id: 'open-mine', title: 'Briefs', openQuestions: 2, contributors: [me, lucia] }),
    conversation({ id: 'open-theirs', title: 'Data', openQuestions: 1, contributors: [lucia] }),
    conversation({ id: 'closed-mine', title: 'Briefs again', contributors: [me] }),
    conversation({ id: 'closed-theirs', title: 'Setup', contributors: [lucia] }),
  ]
  const ids = (typed: string, open: boolean, mine: boolean) => narrowed(all, { typed, open, mine }, ME).map((c) => c.id)
  it('Open keeps those with an open question; Mine those I wrote in; both, those that are both', () => {
    assert.deepEqual(ids('', false, false), ['open-mine', 'open-theirs', 'closed-mine', 'closed-theirs'])
    assert.deepEqual(ids('', true, false), ['open-mine', 'open-theirs'])
    assert.deepEqual(ids('', false, true), ['open-mine', 'closed-mine'])
    assert.deepEqual(ids('', true, true), ['open-mine'])
  })
  it('the title words narrow with them', () => {
    assert.deepEqual(ids('briefs', false, true), ['open-mine', 'closed-mine'])
    assert.deepEqual(ids('briefs', true, false), ['open-mine'])
    assert.deepEqual(ids('setup', true, false), [])
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

  it('all of them, newest first, when all are asked for (C9)', () => {
    const all = ['1', '2', '3', '4', '5'].map((n) => decision(n, `2026-10-0${n}T09:00:00.000Z`))
    const { shown, more } = acceptedOf(all, true)
    assert.deepEqual(
      shown.map((d) => d.id),
      ['5', '4', '3', '2', '1'],
    )
    assert.equal(more, 0)
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

const reply = (over: Partial<ConversationReply> = {}): ConversationReply => ({
  id: 'r1',
  messageId: 'm1',
  state: 'pending',
  reason: null,
  answerId: null,
  askedAt: '2026-10-06T10:05:00.000Z',
  settledAt: null,
  ...over,
})
const message = (id: string, over: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id,
  seq: 1,
  author: 'member',
  actorId: ME,
  name: 'You',
  text: 'Hello',
  at: '2026-10-06T10:05:00.000Z',
  withdrawn: null,
  ask: null,
  replyTo: null,
  ...over,
})

describe('the request a message asked, never the clock (CON01-A09)', () => {
  it('is open while pending, running or uncertain, and ended otherwise', () => {
    for (const state of ['pending', 'running', 'outcome_unknown'] as const) assert.equal(replyOpen({ state }), true)
    for (const state of ['answered', 'failed', 'cancelled', 'blocked'] as const)
      assert.equal(replyOpen({ state }), false)
  })

  it("reads the request off the asking message only: a later message of Sophia's to another request settles nothing", () => {
    const messages = [
      message('m1', { ask: reply() }),
      message('m2', {
        author: 'sophia',
        actorId: null,
        name: 'Sophia',
        at: '2026-10-06T10:09:00.000Z',
        replyTo: { messageId: 'm0', replyId: 'r0' },
      }),
    ]
    assert.equal(replyOf(messages, 'm1')?.state, 'pending')
    assert.equal(replyOf(messages, 'absent'), undefined)
  })

  it('says why a request ended without an answer, and nothing for one answered or open', () => {
    assert.match(replyEndWords(reply({ state: 'blocked', reason: 'replies_not_enabled' })) ?? '', /doesn’t answer/)
    assert.match(replyEndWords(reply({ state: 'blocked', reason: 'no_grant' })) ?? '', /aren’t on/)
    assert.match(replyEndWords(reply({ state: 'failed' })) ?? '', /couldn’t answer/)
    assert.match(replyEndWords(reply({ state: 'cancelled', reason: 'source_withdrawn' })) ?? '', /withdrawn/)
    assert.equal(replyEndWords(reply({ state: 'answered', answerId: 'a1' })), null)
    assert.equal(replyEndWords(reply()), null)
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
  it('never runs through a withdrawn message: its byline names nobody, and the next one names its writer', () => {
    const gone = {
      ...said('member', 'luis', '2026-10-06T09:00:00.000Z'),
      withdrawn: { at: '2026-10-06T10:00:00.000Z' },
    }
    const next = said('member', 'luis', '2026-10-06T09:01:00.000Z')
    assert.equal(continuesRun(gone, next), false)
    assert.equal(continuesRun(next, { ...gone, at: '2026-10-06T09:02:00.000Z' }), false)
    assert.equal(continuesRun(said('member', 'luis', '2026-10-06T08:59:00.000Z'), next), true)
  })

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
  it('never joins two members known by no id: they may be two people', () => {
    assert.equal(
      continuesRun(said('member', null, '2026-10-06T09:00:00Z'), said('member', null, '2026-10-06T09:01:00Z')),
      false,
    )
  })
})

describe('initialOf: a face’s letter', () => {
  it('is the name’s first letter, upper case; «A member» without a name', () => {
    assert.equal(initialOf('lucía'), 'L')
    assert.equal(initialOf(' Ángel'), 'Á')
    assert.equal(initialOf(null), 'A')
    assert.equal(initialOf(''), 'A')
    assert.equal(initialOf('🙂 Ana'), '🙂')
  })
})

/** A message as the API serves it, by its order; Sophia's answers name the message that asked. */
const msg = (seq: number, over: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: `m${String(seq)}`,
  seq,
  author: 'member',
  actorId: ME,
  name: 'Me',
  text: `words ${String(seq)}`,
  at: '2026-10-06T09:00:00.000Z',
  withdrawn: null,
  ask: null,
  replyTo: null,
  ...over,
})
const answer = (seq: number, asked: number) =>
  msg(seq, {
    author: 'sophia',
    actorId: null,
    name: null,
    replyTo: { messageId: `m${String(asked)}`, replyId: `r${String(asked)}` },
  })
const ask = (state: ConversationReply['state']): ConversationReply => ({
  id: 'r',
  messageId: 'm',
  state,
  reason: null,
  answerId: null,
  askedAt: '2026-10-06T09:00:00.000Z',
  settledAt: null,
})
const shown = (read: ReturnType<typeof withWithdrawn>) =>
  read?.pages.flatMap((p) => p.messages.map((m) => `${m.id}:${m.text ?? (m.withdrawn ? 'withdrawn' : 'none')}`))

describe('withWithdrawn: what a withdrawal takes off the screen at once (PR #199 review)', () => {
  const gone = msg(3, { text: null, name: null, withdrawn: { at: '2026-10-06T10:00:00.000Z' } })

  it('withdraws the message, and Sophia’s answers that read it, before anything is read again', () => {
    const read = {
      pages: [
        { messages: [answer(4, 3), msg(5), answer(6, 5)], before: '3' },
        { messages: [msg(2), answer(2.5, 1), msg(3)], before: null },
      ],
      pageParams: [null, '3'],
    }
    assert.deepEqual(shown(withWithdrawn(read, gone)), [
      'm4:withdrawn',
      'm5:words 5',
      'm6:withdrawn',
      'm2:words 2',
      'm2.5:words 2.5',
      'm3:withdrawn',
    ])
  })

  it('withdraws an answer whose asking message isn’t read here when it came after the message', () => {
    const read = { pages: [{ messages: [answer(7, 6), answer(1.5, 1)], before: null }], pageParams: [null] }
    assert.deepEqual(shown(withWithdrawn(read, gone)), ['m7:withdrawn', 'm1.5:words 1.5'])
  })

  it('cancels a request still open from there, and leaves one asked before it', () => {
    const read = {
      pages: [{ messages: [msg(2, { ask: ask('pending') }), msg(4, { ask: ask('running') })], before: null }],
      pageParams: [null],
    }
    const after = withWithdrawn(read, gone)?.pages[0]?.messages
    assert.equal(after?.[0]?.ask?.state, 'pending')
    assert.equal(after?.[1]?.ask?.state, 'cancelled')
    assert.equal(after?.[1]?.ask?.reason, 'source_withdrawn')
  })

  it('leaves a conversation not read yet as it is', () => {
    assert.equal(withWithdrawn(undefined, gone), undefined)
  })
})

describe('listWithdrawn: the list says nothing the withdrawal took (PR #199 review)', () => {
  it('drops that conversation’s last message and summary, and leaves the others', () => {
    const last = { author: 'member' as const, actorId: ME, name: 'Me', text: 'words 3', at: '2026-10-06T09:00:00.000Z' }
    const list = {
      projectId: 'p',
      conversations: [
        conversation({ lastMessage: last, summary: 'Said: words 3' }),
        conversation({ id: 'c2', lastMessage: last }),
      ],
      more: false,
      policy: null,
      capability: {
        state: 'enabled' as const,
        write: true,
        moderate: false,
        ask: 'available' as const,
        askReason: null,
      },
    }
    const after = listWithdrawn(list, 'c1')
    assert.equal(after?.conversations[0]?.lastMessage, null)
    assert.equal(after?.conversations[0]?.summary, null)
    assert.equal(after?.conversations[0]?.summaryCoverage.state, 'not_assessed')
    assert.deepEqual(after?.conversations[1], list.conversations[1])
  })
})
