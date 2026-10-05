import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChatNoticeItem } from '../conversation/chat-view.ts'
import { factWords, madeFacts, madeHeading, madeKey, madeOnStage } from './made-view.ts'

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')

describe('a report’s facts', () => {
  it('reads minutes, sections and sources from its record', () => {
    const markdown = `# Title\n\n${words(460)}\n\n## One\n\ntext\n\n## Two\n\ntext\n\n### Not a section\n`
    const facts = madeFacts(markdown, [], { limitations: [], changeFacts: { cited: 6, added: [], dropped: [] } })
    assert.deepEqual(facts, { minutes: 2, sections: 2, sources: 6, limits: 0 })
  })

  it('takes at least a minute, and no sources when the version doesn’t say', () => {
    assert.deepEqual(madeFacts('A few words', [], undefined), { minutes: 1, sections: 0, sources: null, limits: 0 })
  })

  it('counts each limit once, from the files and the version', () => {
    const facts = madeFacts('x', [{ limitations: ['short', 'late'] }, { limitations: ['short'] }], {
      limitations: ['late', 'paywalled'],
    })
    assert.equal(facts.limits, 3)
  })
})

describe('the facts as the object says them', () => {
  it('leaves out what is none or unknown, and puts the limits last, marked', () => {
    assert.deepEqual(factWords({ minutes: 6, sections: 4, sources: 6, limits: 2 }), [
      { text: '6 min read', limit: false },
      { text: '4 sections', limit: false },
      { text: '6 sources', limit: false },
      { text: '2 limits', limit: true },
    ])
    assert.deepEqual(factWords({ minutes: 1, sections: 1, sources: null, limits: 0 }), [
      { text: '1 min read', limit: false },
      { text: '1 section', limit: false },
    ])
  })
})

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
