import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision, ProjectionCoverage } from '@sophia/contracts'
import type { ConversationMessage, ConversationReply, ConversationSummary } from '../../api/conversations.ts'
import {
  NAMED_AT_MOST,
  acceptedOf,
  continuesRun,
  coverageWords,
  initialOf,
  withMessage,
  firstWords,
  gistOf,
  withLastMessage,
  rowsKnown,
  lastSaid,
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
  remainsAfter,
  withWithdrawn,
  type ReadPages,
  type Remains,
  type Unnamed,
} from './conversation-list.ts'

const ME = 'me'

/** Only conversation a's thread held, as read here. */
const heldForA = (held: ReturnType<typeof page>) => (id: string) => (id === 'a' ? held : undefined)

/** What a row's coverage says, where there is a row. */
const words = (c: ProjectionCoverage | undefined) => (c ? coverageWords(c) : 'no row')

/** What a withdrawal leaves, as remainsAfter says it: by default nobody's writer, Sophia staying, place 3. */
const remainsOf = (over: Partial<Remains>): Remains => ({
  writer: null,
  writerStays: false,
  writerName: null,
  sophiaStays: true,
  seq: 3,
  newestShown: null,
  ...over,
})

/** 01:0m on 7 October: Codex's minutes. */
const minute = (m: number) => `2026-10-07T01:0${String(m)}:00.000Z`

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
  it('says there may be others once it names as many as A16 lets it (PR #199 review)', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ actorId: `a${String(i)}`, name: `N${String(i)}` }))
    assert.match(contributorsLine(conversation({ contributors: many }), 'a199'), /N198, You and others$/)
    assert.doesNotMatch(contributorsLine(conversation({ contributors: many.slice(0, 199) }), ME), /others/)
  })

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

describe('a receipt against the list’s row: only a row read before the message takes it (Codex, CX-0027)', () => {
  const sentAt = '2026-10-07T10:00:00.000Z'
  const receipt = { author: 'member' as const, actorId: ME, name: 'You', text: 'Seq 2, withdrawn since.', at: sentAt }
  const row = (lastAt: string, text: string, at = lastAt) => [
    conversation({ id: 'a', lastAt, lastMessage: { author: 'member', actorId: ME, name: 'You', text, at } }),
  ]
  const after = (list: ReturnType<typeof row>) => withLastMessage(list, 'a', receipt)[0]?.lastMessage?.text

  it('a row read before the message was written (its last activity earlier) takes it', () => {
    assert.equal(after(row('2026-10-07T09:55:00.000Z', 'Seq 1.')), 'Seq 2, withdrawn since.')
  })

  it('a row read since (its last activity the message’s own time: withdrawn since, seq 1 shown) keeps what it says', () => {
    // The list read after the withdrawal shows seq 1 again; the conversation's last activity is still seq 2's time.
    assert.equal(after(row(sentAt, 'Seq 1.', '2026-10-07T09:55:00.000Z')), 'Seq 1.')
  })

  it('a row read after a later message keeps it; equal times keep the row (it may lag, never go back)', () => {
    assert.equal(after(row('2026-10-07T10:05:00.000Z', 'Said since.')), 'Said since.')
    assert.equal(after(row(sentAt, 'Seq 1, the same millisecond.')), 'Seq 1, the same millisecond.')
  })
})

describe('a receipt against a row that says its order: messageSeq decides (CC-0023, Codex’s five invariants)', () => {
  const at = '2026-10-07T10:00:00.000Z'
  const said = (seq: number, text = `Seq ${String(seq)}.`) => ({
    author: 'member' as const,
    actorId: ME,
    name: 'You',
    text,
    at,
    seq,
  })
  const row = (messageSeq: number | undefined, lastMessage: ReturnType<typeof said> | null) =>
    conversation({ id: 'a', lastAt: at, revision: 6, ...(messageSeq === undefined ? {} : { messageSeq }), lastMessage })
  const take = (r: ReturnType<typeof row>, m: { at: string; seq?: number; text: string | null }) =>
    withLastMessage([r], 'a', { author: 'member', actorId: ME, name: 'You', ...m })[0]

  it('CX-0027: the row read after seq 2 (watermark 2, seq 1 shown since its withdrawal) keeps seq 1', () => {
    assert.equal(take(row(2, said(1)), said(2, 'Withdrawn since.'))?.lastMessage?.text, 'Seq 1.')
  })

  it('two messages in one millisecond: a row read before the second (watermark 1) takes it; its watermark moves', () => {
    const after = take(row(1, said(1)), said(2))
    assert.equal(after?.lastMessage?.text, 'Seq 2.')
    assert.equal(after?.lastMessage?.seq, 2)
    assert.equal(after?.messageSeq, 2)
    // Nothing else is made up: its revision and last activity as the list read said them.
    assert.equal(after?.revision, 6)
    assert.equal(after?.lastAt, at)
  })

  it('a cleared preview is no permission, nor an equal place; a lower watermark is, preview or not', () => {
    assert.equal(take(row(2, null), said(2))?.lastMessage, null)
    assert.equal(take(row(1, null), said(2))?.lastMessage?.text, 'Seq 2.')
  })

  it('receipts 3 then 2: the 3 moves the watermark, and the 2 that comes after never passes it', () => {
    const after3 = take(row(1, said(1)), said(3))
    assert.equal(after3?.messageSeq, 3)
    const after2 = after3 && take(after3, said(2))
    assert.equal(after2?.lastMessage?.text, 'Seq 3.')
    assert.equal(after2?.messageSeq, 3)
  })

  it('only one side ordered (a row without messageSeq, or a receipt without seq): by lastAt, ties keep the row', () => {
    assert.equal(take(row(undefined, said(1)), said(2))?.lastMessage?.text, 'Seq 1.')
    assert.equal(take(row(1, said(1)), { at, text: 'Unplaced.' })?.lastMessage?.text, 'Seq 1.')
    const later = { at: '2026-10-07T10:05:00.000Z', text: 'Unplaced, later.' }
    assert.equal(take(row(undefined, said(1)), later)?.lastMessage?.text, 'Unplaced, later.')
  })

  it('a row without messageSeq, receipts 3 then 2: the opening put there bounds it, and lastAt is left as read (Codex)', () => {
    // Codex's L0 at 7969d40: {lastAt 01:00, no opening}; seq 3 at 01:03, then seq 2 at 01:02 took the row back to 2.
    const bare = conversation({ id: 'a', lastAt: minute(0), revision: 6, lastMessage: null })
    const step = (r: typeof bare, seq: number | undefined, m: number) =>
      withLastMessage([r], 'a', {
        author: 'member',
        actorId: ME,
        name: 'You',
        text: `Seq ${String(seq ?? m)}.`,
        at: minute(m),
        ...(seq === undefined ? {} : { seq }),
      })[0] ?? r
    const after3 = step(bare, 3, 3)
    assert.equal(after3.lastMessage?.text, 'Seq 3.')
    assert.equal(after3.lastAt, minute(0))
    assert.equal(after3.revision, 6)
    assert.equal(after3.messageSeq, undefined)
    assert.equal(step(after3, 2, 2).lastMessage?.text, 'Seq 3.')
    // Unplaced receipts too; and one at the opening's own time keeps the row (it may lag, never go back).
    assert.equal(step(step(bare, undefined, 3), undefined, 2).lastMessage?.text, 'Seq 3.')
    assert.equal(step(after3, 4, 3).lastMessage?.text, 'Seq 3.')
    // The ordered control: messageSeq 1 moves to 3 and keeps 3.
    const ordered = step(step({ ...bare, messageSeq: 1 }, 3, 3), 2, 2)
    assert.equal(ordered.lastMessage?.text, 'Seq 3.')
    assert.equal(ordered.messageSeq, 3)
  })
})

describe('rowsKnown by place, within its conversation (CC-0023)', () => {
  const at = '2026-10-07T10:00:00.000Z'
  const says = (seq: number, text: string) => ({ author: 'member' as const, actorId: ME, name: 'You', text, at, seq })
  const rows = (lastMessage: ReturnType<typeof says>) => [
    conversation({ id: 'a', lastMessage }),
    conversation({ id: 'b', lastMessage }),
  ]
  const thread = () =>
    page([
      message('m2', { seq: 2, at, actorId: ME, author: 'member', text: null, withdrawn: { at } }),
      message('m3', { seq: 3, at, actorId: ME, author: 'member', text: 'Seq 3, still said.' }),
    ])
  /** Only conversation a's thread is held. */
  const heldOf = (id: string) => (id === 'a' ? thread() : undefined)

  it('the row says place 2, held withdrawn: it says none; another conversation’s row, saying its own 2, is untouched', () => {
    const after = rowsKnown(rows(says(2, 'Seq 2.')), heldOf)
    assert.equal(after[0]?.lastMessage, null)
    assert.equal(after[1]?.lastMessage?.seq, 2)
  })

  it('the row says place 3 (same writer and millisecond as the withdrawn 2): the same rows', () => {
    const list = rows(says(3, 'Seq 3, still said.'))
    assert.equal(rowsKnown(list, heldOf), list)
  })

  it('a list answer from before the withdrawal, shown after the thread’s read: none still (Codex at 7969d40)', () => {
    // The thread's read came first and the row was cleared; then a list read that set out before the withdrawal
    // answered with its words. Whatever answer is shown, the thread held says what is so.
    const cleared = rowsKnown(rows(says(2, 'Seq 2.')), heldOf)
    assert.equal(cleared[0]?.lastMessage, null)
    const stale = rows(says(2, 'SYNTHETIC LATE LIST GET WITHDRAWN'))
    assert.equal(rowsKnown(stale, heldOf)[0]?.lastMessage, null)
    // No thread held for it: the list as it says it (a current list read never says a withdrawn place).
    assert.equal(
      rowsKnown(stale, () => undefined),
      stale,
    )
  })
})

describe('rowsKnown: who wrote there and Sophia’s part, for a withdrawal its list read may not have known (r4236040713)', () => {
  const at = '2026-10-07T10:00:00.000Z'
  const later = { at: '2026-10-07T10:01:00.000Z' }
  const rowA = (lastMessage: ConversationSummary['lastMessage'], over: Partial<ConversationSummary> = {}) =>
    conversation({
      id: 'a',
      lastAt: at,
      contributors: [
        { actorId: ME, name: 'You' },
        { actorId: 'bo', name: 'Bo' },
      ],
      sophia: true,
      lastMessage,
      ...over,
    })
  // Bo's only message (place 4) and Sophia's answer to it (place 5), both withdrawn; your place 3 said.
  const held = () =>
    page([
      message('m3', { seq: 3, at, actorId: ME, author: 'member', text: 'Seq 3.' }),
      message('m4', { seq: 4, at, actorId: 'bo', author: 'member', text: null, withdrawn: later }),
      message('m5', { seq: 5, at, actorId: null, author: 'sophia', text: null, withdrawn: later }),
    ])
  const sophiaSays = { author: 'sophia' as const, actorId: null, name: 'Sophia', text: 'Five.', at, seq: 5 }

  it('seen after the list read set out: Bo and Sophia’s part go with the opening; you stay', () => {
    const [a] = rowsKnown([rowA(sophiaSays)], heldForA(held()), () => true)
    assert.deepEqual(
      a?.contributors.map((p) => p.actorId),
      [ME],
    )
    assert.equal(a?.sophia, false)
    assert.equal(a?.lastMessage, null)
  })

  it('seen before it set out, or older than a message the row knows of: the rows as the list read says them', () => {
    const says3 = { author: 'member' as const, actorId: ME, name: 'You', text: 'Seq 3.', at, seq: 3 }
    const current = [rowA(says3)]
    assert.equal(
      rowsKnown(current, heldForA(held()), () => false),
      current,
    )
    const knew = [rowA(says3, { lastAt: '2026-10-07T10:02:00.000Z' })]
    assert.equal(
      rowsKnown(knew, heldForA(held()), () => true),
      knew,
    )
  })
})

describe('rowsKnown, a row without its place: matched by writer, actor and time (Codex, CX-0027)', () => {
  const at = '2026-10-07T10:00:00.000Z'
  const says = { author: 'member' as const, actorId: ME, name: 'You', text: 'Seq 2, withdrawn since.', at }
  const rows = (lastMessage: typeof says | null) => [
    conversation({ id: 'a', lastMessage }),
    conversation({ id: 'b', lastMessage: says }),
  ]
  const thread = (withdrawn: boolean) =>
    page([
      message('m1', { seq: 1 }),
      message('m2', {
        seq: 2,
        at,
        actorId: ME,
        author: 'member',
        text: withdrawn ? null : says.text,
        withdrawn: withdrawn ? { at: '2026-10-07T10:01:00.000Z' } : null,
      }),
    ])

  it('the row’s words are the withdrawn message’s (its writer, actor and time): they go, that row only', () => {
    const after = rowsKnown(rows(says), heldForA(thread(true)))
    assert.equal(after[0]?.lastMessage, null)
    assert.equal(after[1]?.lastMessage?.text, says.text)
  })

  it('m2 withdrawn and m3 said in the same millisecond by the same writer, the row m3’s: it stays (Codex’s control)', () => {
    const list = rows({ ...says, text: 'Seq 3, still said.' })
    const both = page([
      message('m2', { seq: 2, at, actorId: ME, author: 'member', text: null, withdrawn: { at } }),
      message('m3', { seq: 3, at, actorId: ME, author: 'member', text: 'Seq 3, still said.' }),
    ])
    assert.equal(rowsKnown(list, heldForA(both)), list)
  })

  it('nothing withdrawn here, another message’s words, or no rows: as they were', () => {
    const list = rows(says)
    assert.equal(rowsKnown(list, heldForA(thread(false))), list)
    const other = rows({ ...says, at: '2026-10-07T09:55:00.000Z', text: 'Seq 1.' })
    assert.equal(rowsKnown(other, heldForA(thread(true))), other)
    assert.deepEqual(rowsKnown([], heldForA(thread(true))), [])
  })
})

describe('a receipt after its message was withdrawn, or a later one said (Codex, CX-0022)', () => {
  it('leaves the pages holding it withdrawn; the thread’s last words are another’s: none from the receipt', () => {
    const gone = message('m9', { seq: 9, text: null, name: null, withdrawn: { at: '2026-10-07T10:01:00.000Z' } })
    const read = page([message('m1', { seq: 1 }), gone])
    const after = withMessage(read, message('m9', { seq: 9, text: 'SYNTHETIC-WITHDRAWN-LATE-SEND' }))
    assert.equal(after, read)
    assert.equal(lastSaid(after)?.id, 'm1')
    assert.equal(lastSaid(undefined), undefined)
  })

  it('a later message said since, its time tied with the receipt’s, is the thread’s last: the receipt says nothing', () => {
    const at = '2026-10-07T10:00:00.000Z'
    const read = page([message('m9', { seq: 9, at }), message('m10', { seq: 10, at })])
    assert.equal(lastSaid(withMessage(read, message('m9', { seq: 9, at })))?.id, 'm10')
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

describe('a confirmed message, as the API would say its row after it (r4237298623, r4237298622)', () => {
  const at = '2026-10-07T10:00:00.000Z'
  const later = '2026-10-07T10:05:00.000Z'
  const range = (state: 'current' | 'stale', newer: number, over: Partial<ProjectionCoverage> = {}) =>
    ({
      state,
      complete: true,
      fromSeq: 1,
      throughSeq: 2,
      newer,
      generatedAt: at,
      replyId: null,
      eligibilityRevision: 1,
      ledgerRevision: 1,
      ...over,
    }) as const
  const row = (over: Partial<ConversationSummary & Unnamed> = {}): ConversationSummary & Unnamed =>
    conversation({
      id: 'a',
      lastAt: at,
      messageSeq: 2,
      contributors: [{ actorId: 'lucia', name: 'Lucía' }],
      lastMessage: { author: 'member', actorId: 'lucia', name: 'Lucía', text: 'Two.', at, seq: 2 },
      ...over,
    })
  const mine = { author: 'member' as const, actorId: ME, name: 'You', text: 'Three.', at: later, seq: 3 }
  /** A row read at place 1. */
  const readAt1 = {
    messageSeq: 1,
    lastMessage: { author: 'member', actorId: 'lucia', name: 'Lucía', text: 'One.', at, seq: 1 },
  } as const

  it('your first message here: you are among those who wrote there, so «Mine» and the notice know it', () => {
    const [a] = withLastMessage([row()], 'a', mine)
    assert.deepEqual(
      a?.contributors.map((p) => p.actorId),
      ['lucia', ME],
    )
    assert.equal(a?.othersUnnamed, undefined)
    // Already among them: as they were.
    const [b] = withLastMessage([row({ contributors: [{ actorId: ME, name: 'You' }] })], 'a', mine)
    assert.deepEqual(
      b?.contributors.map((p) => p.actorId),
      [ME],
    )
  })

  it('a row naming as many as it may: you take the last place kept, and the rest are unnamed', () => {
    const full = Array.from({ length: NAMED_AT_MOST }, (_, i) => ({ actorId: `p${String(i)}`, name: `P${String(i)}` }))
    const [a] = withLastMessage([row({ contributors: full })], 'a', mine)
    assert.equal(a?.contributors.length, NAMED_AT_MOST)
    assert.equal(a?.contributors.at(-1)?.actorId, ME)
    assert.equal(a?.othersUnnamed, true)
  })

  it('a projection with a range is one message behind: current becomes stale, newer one more; none assessed stays so', () => {
    const [a] = withLastMessage(
      [row({ summaryCoverage: range('current', 0), questionsCoverage: range('stale', 1) })],
      'a',
      mine,
    )
    assert.equal(a?.summaryCoverage.state, 'stale')
    assert.equal(a?.summaryCoverage.newer, 1)
    assert.equal(a?.questionsCoverage.state, 'stale')
    assert.equal(a?.questionsCoverage.newer, 2)
    const [b] = withLastMessage([row()], 'a', mine)
    assert.equal(b?.summaryCoverage.state, 'not_assessed')
    assert.equal(b?.questionsCoverage.newer, 0)
  })

  it('a row the receipt may not take (read since): writers and projections as the list said them', () => {
    const since = row({ messageSeq: 3, summaryCoverage: range('current', 0) })
    assert.equal(withLastMessage([since], 'a', mine)[0], since)
  })

  it('places adjacent: nothing can lie between, so one more newer is a count, and said as one', () => {
    const [a] = withLastMessage([row({ summaryCoverage: range('current', 0) })], 'a', mine)
    assert.equal(words(a?.summaryCoverage), 'Covers messages 1–2; 1 newer since.')
  })

  it('a gap in the places (r4237385090): how many are newer isn’t known here, and no count is said', () => {
    // Codex's: read at place 1, both projections through it; another wrote place 2 (eligible, or withdrawn since: the
    // same row either way); yours is place 3, then 4.
    const through1 = { fromSeq: 1, throughSeq: 1 }
    const read = row({
      ...readAt1,
      summaryCoverage: range('current', 0, through1),
      questionsCoverage: range('current', 0, { ...through1, complete: false }),
    })
    const [a] = withLastMessage([read], 'a', mine)
    const uncounted = [
      'Covers messages 1–1; newer messages since.',
      'Covers messages 1–1, the newest then; newer messages since.',
    ]
    const bothSay = (c: (ConversationSummary & Unnamed) | undefined) => [
      words(c?.summaryCoverage),
      words(c?.questionsCoverage),
    ]
    assert.equal(a?.summaryCoverage.state, 'stale')
    assert.equal(a?.questionsCoverage.state, 'stale')
    assert.deepEqual(bothSay(a), uncounted)
    // An adjacent receipt after it restores no count; the same receipt again, or an older one, leaves it as it is.
    const [b] = withLastMessage(a ? [a] : [], 'a', { ...mine, seq: 4 })
    assert.deepEqual(bothSay(b), uncounted)
    for (const again of [4, 3, 2]) {
      const [c] = withLastMessage(b ? [b] : [], 'a', { ...mine, seq: again })
      assert.equal(c, b)
    }
    // None assessed stays so.
    assert.equal(withLastMessage([row(readAt1)], 'a', mine)[0]?.summaryCoverage.state, 'not_assessed')
  })

  it('uncounted, then a withdrawal its range reached: back to not assessed, uncounted no longer', () => {
    const read = row({ ...readAt1, summaryCoverage: range('current', 0, { throughSeq: 1 }) })
    const [a] = withLastMessage([read], 'a', mine)
    const list = { conversations: a ? [a] : [] } as unknown as Parameters<typeof listWithdrawn>[0]
    const gone = listWithdrawn(list, 'a', remainsOf({ writer: ME, sophiaStays: false, seq: 1 }))?.conversations[0]
    assert.deepEqual(gone?.summaryCoverage, notAssessed)
    assert.equal(words(gone?.summaryCoverage), null)
  })

  it('no places to tell (an API from before them): no count either', () => {
    const unplaced = conversation({
      id: 'a',
      lastAt: at,
      summaryCoverage: range('current', 0),
      lastMessage: { author: 'member', actorId: 'lucia', name: 'Lucía', text: 'Two.', at },
    })
    const [a] = withLastMessage([unplaced], 'a', {
      author: 'member',
      actorId: ME,
      name: 'You',
      text: 'Three.',
      at: later,
    })
    assert.equal(words(a?.summaryCoverage), 'Covers messages 1–2; newer messages since.')
  })

  it('a writer already there (r4237385093): their name as the receipt says it now, in the same place', () => {
    const before = [
      { actorId: 'lucia', name: 'Lucía' },
      { actorId: ME, name: 'Synthetic Former Name' },
      { actorId: 'tomas', name: 'Tomás' },
    ]
    const other = conversation({ id: 'b', contributors: [{ actorId: ME, name: 'Synthetic Former Name' }] })
    const renamed = { ...mine, name: 'Synthetic Current Name' }
    const [a, b] = withLastMessage([row({ contributors: before }), other], 'a', renamed)
    assert.deepEqual(a?.contributors, [
      { actorId: 'lucia', name: 'Lucía' },
      { actorId: ME, name: 'Synthetic Current Name' },
      { actorId: 'tomas', name: 'Tomás' },
    ])
    assert.equal(a?.lastMessage?.name, 'Synthetic Current Name')
    // Another conversation's row, as it was.
    assert.equal(b, other)
    // Matched by who they are, never by a name: another writer named as the receipt's once was keeps that name.
    const [c] = withLastMessage(
      [row({ contributors: [{ actorId: 'lucia', name: 'Synthetic Former Name' }] })],
      'a',
      renamed,
    )
    assert.deepEqual(c?.contributors, [
      { actorId: 'lucia', name: 'Synthetic Former Name' },
      { actorId: ME, name: 'Synthetic Current Name' },
    ])
  })

  it('a writer already there whose receipt carries no name: «A member», as the API names them, never the former name', () => {
    const before = [
      { actorId: 'lucia', name: 'Lucía' },
      { actorId: ME, name: 'Synthetic Former Name' },
    ]
    const [a] = withLastMessage([row({ contributors: before })], 'a', { ...mine, name: null })
    assert.deepEqual(a?.contributors, [
      { actorId: 'lucia', name: 'Lucía' },
      { actorId: ME, name: 'A member' },
    ])
    assert.equal(a?.lastMessage?.name, null)
    // A writer new here, the same.
    const [b] = withLastMessage([row()], 'a', { ...mine, name: null })
    assert.deepEqual(b?.contributors.at(-1), { actorId: ME, name: 'A member' })
  })

  it('renamed in a row naming as many as it may: the same place, the same count, the rest still unnamed', () => {
    const full = Array.from({ length: NAMED_AT_MOST }, (_, i) =>
      i === 57 ? { actorId: ME, name: 'Synthetic Former Name' } : { actorId: `p${String(i)}`, name: `P${String(i)}` },
    )
    const [a] = withLastMessage([row({ contributors: full, othersUnnamed: true })], 'a', {
      ...mine,
      name: 'Synthetic Current Name',
    })
    assert.equal(a?.contributors.length, NAMED_AT_MOST)
    assert.deepEqual(a?.contributors[57], { actorId: ME, name: 'Synthetic Current Name' })
    assert.deepEqual(
      a?.contributors.filter((_, i) => i !== 57),
      full.filter((_, i) => i !== 57),
    )
    assert.equal(a?.othersUnnamed, true)
  })

  it('an older receipt the row may not take: the name the row has, as it was', () => {
    const since = row({ messageSeq: 3, contributors: [{ actorId: ME, name: 'Synthetic Current Name' }] })
    const older = { ...mine, seq: 2, name: 'Synthetic Former Name' }
    assert.equal(withLastMessage([since], 'a', older)[0], since)
  })
})

describe('a withdrawal leaves no question projection standing (PR #199 r4237222580)', () => {
  const at = '2026-10-07T10:00:00.000Z'
  const assessed = {
    state: 'current',
    complete: true,
    fromSeq: 1,
    throughSeq: 2,
    newer: 0,
    generatedAt: at,
    replyId: null,
    eligibilityRevision: 1,
    ledgerRevision: 1,
  } as const
  const asked = () =>
    conversation({
      id: 'a',
      lastAt: at,
      contributors: [{ actorId: ME, name: 'You' }],
      openQuestions: 2,
      questionsCoverage: assessed,
      lastMessage: { author: 'member', actorId: ME, name: 'You', text: 'Seq 2.', at, seq: 2 },
    })
  const remains = remainsOf({ writer: ME, writerStays: true, writerName: 'You', sophiaStays: false, seq: 2 })

  it('withdrawn here: its questions are not assessed any more, and none is counted open', () => {
    const list = { conversations: [asked()] } as unknown as Parameters<typeof listWithdrawn>[0]
    const a = listWithdrawn(list, 'a', remains)?.conversations[0]
    assert.equal(a?.openQuestions, 0)
    assert.equal(a?.questionsCoverage.state, 'not_assessed')
  })

  it('withdrawn elsewhere, the list read not knowing it: the same', () => {
    const thread = page([
      message('m1', { seq: 1, at, actorId: ME, author: 'member', text: 'Seq 1.' }),
      message('m2', { seq: 2, at, actorId: ME, author: 'member', text: null, withdrawn: { at } }),
    ])
    const [a] = rowsKnown([asked()], heldForA(thread), () => true)
    assert.equal(a?.openQuestions, 0)
    assert.equal(a?.questionsCoverage.state, 'not_assessed')
  })
})

describe('listWithdrawn: the list says nothing the withdrawal took (PR #199 review)', () => {
  const last = { author: 'member' as const, actorId: ME, name: 'Me', text: 'words 3', at: '2026-10-06T09:00:00.000Z' }
  const people = [
    { actorId: ME, name: 'Me' },
    { actorId: 'lucia', name: 'Lucía' },
  ]
  const listOf = (over: Partial<ConversationSummary> = {}) => ({
    projectId: 'p',
    conversations: [
      conversation({ lastMessage: last, summary: 'Said: words 3', contributors: people, sophia: true, ...over }),
      conversation({ id: 'c2', lastMessage: last, contributors: people }),
    ],
    more: false,
    policy: null,
    capability: { state: 'enabled' as const, write: true, moderate: false, ask: 'available' as const, askReason: null },
  })
  const nothingElse = remainsOf({})

  it('drops that conversation’s last message and summary, and leaves the others', () => {
    const list = listOf()
    const after = listWithdrawn(list, 'c1', nothingElse)
    assert.equal(after?.conversations[0]?.lastMessage, null)
    assert.equal(after?.conversations[0]?.summary, null)
    assert.equal(after?.conversations[0]?.summaryCoverage.state, 'not_assessed')
    assert.deepEqual(after?.conversations[1], list.conversations[1])
  })

  it('drops its writer among those who wrote there, unless words of theirs are still read there', () => {
    const gone = listWithdrawn(listOf(), 'c1', remainsOf({ writer: ME }))
    assert.deepEqual(
      gone?.conversations[0]?.contributors.map((p) => p.actorId),
      ['lucia'],
    )
    const stays = listWithdrawn(listOf(), 'c1', remainsOf({ writer: ME, writerStays: true, writerName: 'Me' }))
    assert.equal(stays?.conversations[0]?.contributors.length, 2)
  })

  it('a list that named as many as A16 lets it still says there are others once a named writer is taken out', () => {
    // 201 wrote there; the list names 200, you among them. Your only message withdrawn, the reads after it failing:
    const named = Array.from({ length: 199 }, (_, i) => ({ actorId: `w${String(i)}`, name: `W${String(i)}` }))
    const capped = listOf({ contributors: [...named, { actorId: ME, name: 'Me' }] })
    const after = listWithdrawn(capped, 'c1', remainsOf({ writer: ME }))
    const row = after?.conversations[0]
    assert.equal(row?.contributors.length, 199)
    assert.ok(row)
    assert.match(contributorsLine(row, ME), /W198 and others/)
    // Taken out again, it still says so; a list that never reached the cap stays exact.
    const again = listWithdrawn(after, 'c1', remainsOf({ writer: 'w0' }))?.conversations[0]
    assert.ok(again)
    assert.match(contributorsLine(again, ME), /and others/)
    const small = listWithdrawn(listOf(), 'c1', remainsOf({ writer: ME }))?.conversations[0]
    assert.ok(small)
    assert.doesNotMatch(contributorsLine(small, ME), /others/)
  })

  it('keeps Sophia only where an answer of hers is still to be seen', () => {
    assert.equal(listWithdrawn(listOf(), 'c1', { ...nothingElse, sophiaStays: false })?.conversations[0]?.sophia, false)
    assert.equal(listWithdrawn(listOf(), 'c1', nothingElse)?.conversations[0]?.sophia, true)
  })
})

/** One page of messages, as read. */
const page = (messages: ConversationMessage[]) => ({ pages: [{ messages, before: null }], pageParams: [null] })

describe('remainsAfter: who still has words there, as read (PR #199 review)', () => {
  const gone = msg(3, { text: null, name: null, withdrawn: { at: '2026-10-06T10:00:00.000Z' } })
  const after = (read: ReadPages<ConversationMessage>) => remainsAfter(withWithdrawn(read, gone), gone)

  it('says the writer is gone when no other words of theirs are read, and stays when some are', () => {
    assert.deepEqual(after(page([msg(2, { actorId: 'lucia', name: 'Lucía' }), msg(3)])), {
      writer: ME,
      writerStays: false,
      writerName: null,
      sophiaStays: false,
      seq: 3,
      newestShown: 2,
    })
    assert.equal(after(page([msg(1), msg(3)])).writerStays, true)
  })

  it('keeps Sophia only where an answer of hers that did not read it is still to be seen', () => {
    assert.equal(after(page([msg(3), answer(4, 3)])).sophiaStays, false)
    assert.equal(after(page([msg(1), answer(2, 1), msg(3), answer(4, 3)])).sophiaStays, true)
  })

  it('never keeps Sophia on what isn’t read: an answer that read it may lie outside the pages (read again, a gap)', () => {
    // The newest page read again, the older one with the message kept from before: what came between is not read.
    const gap = {
      pages: [
        { messages: [msg(9), msg(10)], before: '9' },
        { messages: [msg(2), msg(3)], before: null },
      ],
      pageParams: [null, '4'],
    }
    assert.equal(after(gap).sophiaStays, false)
    assert.equal(remainsAfter(undefined, gone).sophiaStays, false)
  })
})

/** A list holding only that row. */
const oneRow = (row: ConversationSummary) =>
  ({ conversations: [row] }) as unknown as Parameters<typeof listWithdrawn>[0]

describe('a withdrawal, a row’s projections and its writer’s name (PR #199 r4237439149, r4237439145)', () => {
  const at = '2026-10-06T09:00:00.000Z'
  const gone = msg(6, { text: null, name: null, withdrawn: { at: '2026-10-06T10:00:00.000Z' } })
  const through = (last: number, state: 'current' | 'stale', newer: number) =>
    ({
      state,
      complete: true,
      fromSeq: 1,
      throughSeq: last,
      newer,
      generatedAt: at,
      replyId: null,
      eligibilityRevision: 1,
      ledgerRevision: 1,
    }) as const
  const assessed = (over: Partial<ConversationSummary> = {}) =>
    conversation({
      id: 'a',
      messageSeq: 6,
      summary: 'Said so far.',
      summaryCoverage: through(5, 'current', 0),
      openQuestions: 2,
      questionsCoverage: through(5, 'current', 0),
      contributors: [{ actorId: ME, name: 'Me' }],
      ...over,
    })
  const withdrawnIn = (row: ConversationSummary, messages: ConversationMessage[]) =>
    listWithdrawn(oneRow(row), 'a', remainsAfter(page([...messages, gone]), gone))?.conversations[0]
  const before = [msg(1), msg(2), msg(3), msg(4), msg(5)]

  it('projections whose range ends before the message never read it: they stay, words and all', () => {
    const row = assessed()
    const a = withdrawnIn(row, before)
    assert.equal(a?.summary, 'Said so far.')
    assert.deepEqual(a?.summaryCoverage, row.summaryCoverage)
    assert.equal(a?.openQuestions, 2)
    assert.deepEqual(a?.questionsCoverage, row.questionsCoverage)
    // The same for a withdrawal the list read may not have known (rowsKnown), its thread held here.
    const [b] = rowsKnown([row], heldForA(page([...before, gone])), () => true)
    assert.equal(b?.summary, 'Said so far.')
    assert.equal(b?.openQuestions, 2)
  })

  it('each projection by its own range: one that reached the message goes, the other stays', () => {
    const a = withdrawnIn(assessed({ questionsCoverage: through(6, 'current', 0) }), before)
    assert.equal(a?.summary, 'Said so far.')
    assert.equal(a?.questionsCoverage.state, 'not_assessed')
    assert.equal(a?.openQuestions, 0)
  })

  it('a count that may have held the message isn’t a count any more: newer still shown, said uncounted', () => {
    const counted = assessed({ messageSeq: 7, summaryCoverage: through(5, 'stale', 2) })
    const a = withdrawnIn(counted, [...before, msg(7)])
    assert.equal(a?.summary, 'Said so far.')
    assert.equal(words(a?.summaryCoverage), 'Covers messages 1–5; newer messages since.')
  })

  it('and with nothing newer still shown: kept, words and questions, said only that it may be out of date (CX-0036)', () => {
    // Codex's common case: through 5, one newer counted, only 6 withdrawn; whether the decisions moved isn't known here.
    const row = assessed({ summaryCoverage: through(5, 'stale', 1), questionsCoverage: through(5, 'stale', 1) })
    for (const shownBefore of [before, [msg(1)]]) {
      const a = withdrawnIn(row, shownBefore)
      assert.equal(a?.summary, 'Said so far.')
      assert.equal(a?.openQuestions, 2)
      assert.equal(a?.summaryCoverage.state, 'stale')
      assert.equal(words(a?.summaryCoverage), 'Covers messages 1–5; it may be out of date.')
      assert.equal(words(a?.questionsCoverage), 'Covers messages 1–5; it may be out of date.')
    }
    // A partial one keeps its label.
    const partial = assessed({ summaryCoverage: { ...through(5, 'stale', 1), complete: false } })
    assert.equal(
      words(withdrawnIn(partial, before)?.summaryCoverage),
      'Covers messages 1–5, the newest then; it may be out of date.',
    )
  })

  it('out of date, then a newer message confirmed: newer messages, never a count; withdrawn again with none: out of date', () => {
    const row = assessed({ messageSeq: 6, summaryCoverage: through(5, 'stale', 1) })
    const a = withdrawnIn(row, before)
    const mineAt7 = { author: 'member' as const, actorId: ME, name: 'Me', text: 'Seven.', at, seq: 7 }
    const [b] = withLastMessage(a ? [a] : [], 'a', mineAt7)
    assert.equal(words(b?.summaryCoverage), 'Covers messages 1–5; newer messages since.')
    // That one withdrawn too, nothing newer shown: back to out of date, the words still kept.
    const seven = msg(7, { text: null, name: null, withdrawn: { at: '2026-10-06T10:05:00.000Z' } })
    const list = oneRow(b ?? row)
    const c = listWithdrawn(list, 'a', remainsAfter(page([...before, gone, seven]), seven))?.conversations[0]
    assert.equal(c?.summary, 'Said so far.')
    assert.equal(words(c?.summaryCoverage), 'Covers messages 1–5; it may be out of date.')
  })

  it('stale for the project’s decisions only (none newer counted): as it was', () => {
    const row = assessed({ summaryCoverage: through(5, 'stale', 0) })
    assert.deepEqual(withdrawnIn(row, before)?.summaryCoverage, row.summaryCoverage)
  })

  it('a writer who stays is named by their newest message still shown, never by the withdrawn one', () => {
    const row = assessed({
      contributors: [
        { actorId: 'lucia', name: 'Lucía' },
        { actorId: ME, name: 'Synthetic Current Name' },
      ],
    })
    const former = [msg(1, { actorId: 'lucia', name: 'Lucía' }), msg(2, { name: 'Synthetic Former Name' })]
    assert.deepEqual(withdrawnIn(row, former)?.contributors, [
      { actorId: 'lucia', name: 'Lucía' },
      { actorId: ME, name: 'Synthetic Former Name' },
    ])
    // Their newest one still shown carries no name: «A member», as the API names them.
    const unnamed = [msg(1, { actorId: 'lucia', name: 'Lucía' }), msg(2, { name: null })]
    assert.deepEqual(withdrawnIn(row, unnamed)?.contributors[1], { actorId: ME, name: 'A member' })
    // The same through rowsKnown, where the name is all that changes: it is kept, not taken for no change (CX-0036).
    const [b] = rowsKnown([row], heldForA(page([...former, gone])), () => true)
    assert.deepEqual(b?.contributors[1], { actorId: ME, name: 'Synthetic Former Name' })
  })
})
