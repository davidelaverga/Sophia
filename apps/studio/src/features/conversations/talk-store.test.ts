import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  changeIfCurrent,
  currentGeneration,
  forgetKept,
  keptAt,
  withErasure,
  withoutConversation,
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
