import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChatNoticeItem } from '../conversation/chat-view.ts'
import { madeHeading, madeKey, madeOnStage } from './made-view.ts'

const notice = (taskId: string, resultRevision: number, at: number): ChatNoticeItem => ({
  key: `${taskId}-${String(resultRevision)}`,
  taskId,
  taskKind: 'research',
  resultRevision,
  at,
})

describe('the notice on the stage', () => {
  it('is the newest, by arrival', () => {
    assert.equal(madeOnStage([notice('a', 1, 5), notice('b', 1, 9), notice('c', 1, 2)], new Set())?.taskId, 'b')
  })

  it('is none once this person put it away, until a revision comes', () => {
    const first = notice('a', 1, 5)
    assert.equal(madeOnStage([first], new Set([madeKey(first)])), null)
    assert.equal(madeOnStage([notice('a', 2, 7)], new Set([madeKey(first)]))?.resultRevision, 2)
  })

  it('putting the newest away never brings back an older one', () => {
    const older = notice('a', 1, 5)
    const newest = notice('b', 1, 9)
    assert.equal(madeOnStage([older, newest], new Set([madeKey(newest)])), null)
  })

  it('leaves a drafted brief to the chat: it delivers no report to open', () => {
    const brief = { ...notice('b', 1, 9), taskKind: 'draft_brief' }
    assert.equal(madeOnStage([notice('a', 1, 5), brief], new Set())?.taskId, 'a')
    assert.equal(madeOnStage([brief], new Set()), null)
  })

  it('is none without notices', () => {
    assert.equal(madeOnStage([], new Set()), null)
  })
})

describe('the object’s heading', () => {
  it('names the report by its version’s title, with its number', () => {
    assert.deepEqual(madeHeading({ title: 'Pilot results', versionNumber: 2 }, 'Card title', 'Research report ready'), {
      title: 'Pilot results',
      meta: 'Report · v2',
    })
  })

  it('says the Studio’s words until the record is read', () => {
    assert.deepEqual(madeHeading(undefined, undefined, 'Research report ready'), {
      title: 'Research report ready',
      meta: 'Report',
    })
  })
})
