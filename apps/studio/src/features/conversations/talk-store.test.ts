import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changeIfCurrent, currentGeneration, forgetKept, keptAt } from './talk-store.ts'

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
