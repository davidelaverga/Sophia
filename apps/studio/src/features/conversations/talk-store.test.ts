import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  changeIfCurrent,
  changeKept,
  currentGeneration,
  forgetKept,
  goneFrom,
  keepsFor,
  keptAt,
  withErasure,
  withHome,
  withListed,
  withoutConversation,
  withoutMessage,
  withWithdrawal,
  type Kept,
} from './talk-store.ts'

const PLACE = 'project luis@sophia.test'
const draft = (text: string) => (was: NonNullable<ReturnType<typeof keptAt>>) => ({ ...was, drafts: { c1: text } })

describe('changeIfCurrent', () => {
  it('keeps a change made since the last forgetting', () => {
    forgetKept()
    changeIfCurrent(PLACE, currentGeneration(), draft('kept'))
    assert.equal(keptAt(PLACE)?.drafts.c1, 'kept')
  })

  it('drops a change from before a forgetting: a late write never brings back what the account left', () => {
    const born = currentGeneration()
    changeIfCurrent(PLACE, born, draft('before'))
    forgetKept()
    changeIfCurrent(PLACE, born, draft('late'))
    assert.equal(keptAt(PLACE), undefined)
  })
})

describe('withoutConversation', () => {
  it('lets go of an erased conversation’s draft, intent, message held, refusal and wait, and keeps the others’', () => {
    forgetKept()
    changeIfCurrent(PLACE, currentGeneration(), (was) => ({
      ...was,
      drafts: { c1: 'gone with it', c2: 'stays' },
      asks: { c1: false, c2: true },
      holds: { c1: { key: 'k1', ask: { text: 'held', askSophia: false }, sending: false }, c2: null },
      refusals: { c1: 'refused', c2: null },
      asked: { c1: { replyId: 'r1', messageId: 'm1', here: 1 }, c2: null },
    }))
    const kept = keptAt(PLACE)
    assert.ok(kept)
    const after = withoutConversation(kept, 'c1')
    assert.deepEqual(after.drafts, { c2: 'stays' })
    assert.deepEqual(after.asks, { c2: true })
    assert.deepEqual(after.holds, { c2: null })
    assert.deepEqual(after.refusals, { c2: null })
    assert.deepEqual(after.asked, { c2: null })
    assert.deepEqual(after.start, kept.start)
  })

  it('settles the erased conversation’s erasure alone: another conversation’s, and Still open’s decision, stay', () => {
    const kept = keptWith({
      erasures: { c1: { key: 'e1', ask: 'c1', sending: true }, c2: { key: 'e2', ask: 'c2', sending: false } },
      decision: DECISION,
    })
    const after = withoutConversation(kept, 'c1')
    assert.deepEqual(after.erasures, { c2: { key: 'e2', ask: 'c2', sending: false } })
    assert.deepEqual(after.erased, { c1: true })
    assert.deepEqual(after.decision, DECISION)
  })
})

describe('withErasure', () => {
  it('holds an erasure on its way or with no reply, and lets it go once answered', () => {
    const kept = keptWith({})
    const sending = withErasure(kept, 'c1', { key: 'e1', ask: 'c1', sending: true })
    assert.deepEqual(sending.erasures, { c1: { key: 'e1', ask: 'c1', sending: true } })
    const unknown = withErasure(sending, 'c1', { key: 'e1', ask: 'c1', sending: false })
    assert.deepEqual(unknown.erasures, { c1: { key: 'e1', ask: 'c1', sending: false } })
    assert.deepEqual(withErasure(unknown, 'c1', null).erasures, {})
  })

  it('never brings back a settled erasure: its old request failing, or answering late, changes nothing', () => {
    const settled = withoutConversation(keptWith({ erasures: { c1: { key: 'e1', ask: 'c1', sending: true } } }), 'c1')
    assert.equal(withErasure(settled, 'c1', { key: 'e1', ask: 'c1', sending: false }), settled)
    assert.equal(withErasure(settled, 'c1', null), settled)
    // Another conversation's erasure is its own.
    const other = withErasure(settled, 'c2', { key: 'e2', ask: 'c2', sending: true })
    assert.deepEqual(other.erasures, { c2: { key: 'e2', ask: 'c2', sending: true } })
  })
})

const held = (key: string) => ({ key, ask: 'words from the message', sending: false })

describe('a gone message’s part (PR #199 r4235397318, r4235397321)', () => {
  const parts = (): Partial<Kept> => ({
    proposals: { m1: held('p1'), m2: held('p2') },
    proposalRefusals: { m1: 'refused', m2: null },
    proposed: { m1: { id: 'd1', statement: 'words from the message' }, m2: null },
    withdrawals: { m1: held('w1'), m2: held('w2') },
    homes: { m1: 'c1', m2: 'c2' },
    decision: DECISION,
  })

  it('an erased conversation takes its messages’ proposals and withdrawals; another’s, and the decision, stay', () => {
    const after = withoutConversation(keptWith(parts()), 'c1')
    assert.deepEqual(Object.keys(after.proposals), ['m2'])
    assert.deepEqual(Object.keys(after.proposalRefusals), ['m2'])
    assert.deepEqual(Object.keys(after.proposed), ['m2'])
    assert.deepEqual(Object.keys(after.withdrawals), ['m2'])
    assert.deepEqual(after.homes, { m2: 'c2' })
    assert.deepEqual(after.gone, { m1: true })
    assert.deepEqual(after.decision, DECISION)
  })

  it('a late answer writing a gone message’s proposal back (ProposeHere writes its own) is left out', () => {
    keptWith(parts())
    changeKept(PLACE, (k) => withoutConversation(k, 'c1'))
    changeKept(PLACE, (k) => ({ ...k, proposals: { ...k.proposals, m1: held('p1') } }))
    changeKept(PLACE, (k) => ({ ...k, proposed: { ...k.proposed, m1: { id: 'd1', statement: 'late' } } }))
    const now = keptAt(PLACE)
    assert.ok(now)
    assert.equal(now.proposals.m1, undefined)
    assert.equal(now.proposed.m1, undefined)
    assert.deepEqual(now.proposals.m2, held('p2'))
  })

  it('a proposal whose home is not yet known goes with the erasure that names its message as read (r4237298613)', () => {
    // Pressed just before the erasure settled: its proposal kept, its home not yet written.
    keptWith({ proposals: { m3: held('p3'), m2: held('p2') }, homes: { m2: 'c2' }, decision: DECISION })
    changeKept(PLACE, (k) => withoutConversation(k, 'c1', ['m3']))
    // Its answer comes late, and writes it back: left out.
    changeKept(PLACE, (k) => ({ ...k, proposals: { ...k.proposals, m3: held('p3') } }))
    changeKept(PLACE, (k) => ({ ...k, proposed: { ...k.proposed, m3: { id: 'd3', statement: 'late' } } }))
    const now = keptAt(PLACE)
    assert.ok(now)
    assert.equal(now.proposals.m3, undefined)
    assert.equal(now.proposed.m3, undefined)
    assert.equal(now.gone.m3, true)
    // Another conversation's proposal, and the decision, stay.
    assert.deepEqual(now.proposals.m2, held('p2'))
    assert.deepEqual(now.decision, DECISION)
  })

  it('a message withdrawn here takes its own part only', () => {
    const after = withoutMessage(keptWith(parts()), 'm1')
    assert.deepEqual(Object.keys(after.proposals), ['m2'])
    assert.deepEqual(Object.keys(after.withdrawals), ['m2'])
    assert.deepEqual(after.gone, { m1: true })
  })

  it('a withdrawal is held under its message, its conversation known, and never comes back once gone', () => {
    const k = withWithdrawal(keptWith({}), 'm1', 'c1', held('w1'))
    assert.deepEqual(k.withdrawals, { m1: held('w1') })
    assert.deepEqual(k.homes, { m1: 'c1' })
    assert.deepEqual(withWithdrawal(k, 'm1', 'c1', null).withdrawals, {})
    const gone = withoutMessage(k, 'm1')
    assert.equal(withWithdrawal(gone, 'm1', 'c1', held('w1')), gone)
    assert.equal(withHome(withHome(k, 'm9', 'c3'), 'm9', 'c3').homes.m9, 'c3')
  })
})

describe('an erased conversation’s own part (Codex on a3422f4)', () => {
  const sendHeld = { key: 's1', ask: { text: 'SYNTHETIC-ERASED-SEND-WORDS', askSophia: false }, sending: false }

  it('a late answer to a send writing its held message, refusal or wait back is left out; another’s and the decision stay', () => {
    keptWith({ drafts: { c1: 'gone', c2: 'stays' }, holds: { c2: null }, decision: DECISION })
    changeKept(PLACE, (k) => withoutConversation(k, 'c1'))
    changeKept(PLACE, (k) => ({ ...k, holds: { ...k.holds, c1: sendHeld } }))
    changeKept(PLACE, (k) => ({ ...k, refusals: { ...k.refusals, c1: 'refused late' } }))
    changeKept(PLACE, (k) => ({ ...k, asked: { ...k.asked, c1: { replyId: 'r1', messageId: 'm1', here: 1 } } }))
    changeKept(PLACE, (k) => ({ ...k, drafts: { ...k.drafts, c1: 'typed late' } }))
    const now = keptAt(PLACE)
    assert.ok(now)
    assert.deepEqual(
      [now.holds.c1, now.refusals.c1, now.asked.c1, now.drafts.c1],
      [undefined, undefined, undefined, undefined],
    )
    assert.equal(now.drafts.c2, 'stays')
    assert.deepEqual(now.decision, DECISION)
  })
})

describe('keepsFor: by what is kept, not by an entry left empty (PR #199 r4235731017)', () => {
  it('an empty draft and cleared entries keep nothing; words, a held message, an erasure’s key or a proposal do', () => {
    const empty = keptWith({
      drafts: { c1: '  ' },
      asks: { c1: false },
      holds: { c1: null },
      refusals: { c1: null },
      asked: { c1: null },
      homes: { m1: 'c1' },
      proposals: { m1: null },
      proposed: { m1: null },
    })
    assert.equal(keepsFor(empty, 'c1'), false)
    assert.equal(keepsFor({ ...empty, drafts: { c1: 'words' } }, 'c1'), true)
    const message = { key: 's1', ask: { text: 'held words', askSophia: false }, sending: false }
    assert.equal(keepsFor({ ...empty, holds: { c1: message } }, 'c1'), true)
    assert.equal(keepsFor({ ...empty, erasures: { c1: { key: 'e1', ask: 'c1', sending: false } } }, 'c1'), true)
    assert.equal(keepsFor({ ...empty, proposals: { m1: held('p1') } }, 'c1'), true)
    assert.equal(keepsFor({ ...empty, drafts: { c2: 'words' } }, 'c1'), false)
  })
})

describe('goneFrom and withListed: only a whole list says one is gone', () => {
  it('seen in a list of the newest only, left out of one: kept; left out of a whole list later: gone', () => {
    // Opened on a project already past the newest the list holds: every list read so far is capped.
    let k = withListed(keptWith({ drafts: { c1: 'a draft' } }), ['c1', 'c2', 'c3'], false)
    assert.deepEqual(Object.keys(k.listed).toSorted(), ['c1', 'c2', 'c3'])
    // Erased elsewhere; a capped list leaves it out: nothing proved, it stays seen.
    k = withListed(k, ['c2', 'c3', 'c4'], false)
    assert.deepEqual(Object.keys(k.listed).toSorted(), ['c1', 'c2', 'c3', 'c4'])
    // A whole list, read now, without it: gone, though no earlier whole list ever held it.
    assert.deepEqual(goneFrom(k, ['c2', 'c3', 'c4']), ['c1'])
    const settled = withListed(withoutConversation(k, 'c1'), ['c2', 'c3', 'c4'], true)
    assert.deepEqual(Object.keys(settled.listed).toSorted(), ['c2', 'c3', 'c4'])
    assert.equal(settled.drafts.c1, undefined)
    assert.deepEqual(goneFrom(settled, ['c2', 'c3', 'c4']), [])
  })

  it('an erasure held here counts though never seen listed; a start seen listed is never gone while listed', () => {
    const k = withListed(keptWith({ erasures: { c9: { key: 'e9', ask: 'c9', sending: false } } }), ['c1'], true)
    assert.deepEqual(goneFrom(k, ['c1']), ['c9'])
    const started = withListed(k, ['c5', 'c1'], true)
    assert.deepEqual(goneFrom(started, ['c5', 'c1']), ['c9'])
  })
})

const DECISION = {
  key: 'd1',
  ask: { args: { decisionId: 'p1', revision: 3, decision: 'accept' as const }, statement: 'Map first' },
  sending: false,
}

/** What is kept for PLACE, these fields changed, everything else as it starts. */
function keptWith(fields: Partial<Kept>): Kept {
  forgetKept()
  changeIfCurrent(PLACE, currentGeneration(), (was) => ({ ...was, ...fields }))
  const kept = keptAt(PLACE)
  assert.ok(kept)
  return kept
}
