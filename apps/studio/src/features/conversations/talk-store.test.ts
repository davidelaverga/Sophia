import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changeIfCurrent, currentGeneration, forgetKept, keptAt, withoutConversation } from './talk-store.ts'

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
})
