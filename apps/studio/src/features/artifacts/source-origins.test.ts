import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { originWords } from './source-origins.ts'

const at = '2026-10-04T15:00:00.000Z'
const base = { sourceId: 's', id: 'x', at }

describe('a source’s origin in words (A19, proposed)', () => {
  it('names a conversation and a decision by their titles, and goes to a conversation', () => {
    assert.deepEqual(originWords({ ...base, kind: 'conversation', title: 'Short or long briefs?', by: null }, 'UTC'), {
      words: 'From the conversation “Short or long briefs?”',
      goes: true,
    })
    assert.deepEqual(originWords({ ...base, kind: 'decision', title: 'Keep the brief to one page', by: null }, 'UTC'), {
      words: 'From the decision “Keep the brief to one page”',
      goes: false,
    })
  })

  it('names a meeting by its day, in the reader’s time zone, and goes to it', () => {
    assert.deepEqual(originWords({ ...base, kind: 'meeting', title: null, by: null }, 'UTC'), {
      words: 'From the meeting on Oct 4',
      goes: true,
    })
    const late = { ...base, kind: 'meeting' as const, title: null, by: null, at: '2026-10-04T23:30:00.000Z' }
    assert.equal(originWords(late, 'Asia/Tokyo').words, 'From the meeting on Oct 5')
  })

  it('says who added a file, and when; a file nobody is named for is a member’s', () => {
    assert.deepEqual(originWords({ ...base, kind: 'file', title: 'survey.csv', by: 'Lucía' }, 'UTC'), {
      words: 'A file Lucía added · Oct 4',
      goes: false,
    })
    assert.equal(
      originWords({ ...base, kind: 'file', title: null, by: null }, 'UTC').words,
      'A file a member added · Oct 4',
    )
  })

  it('a conversation or decision with no title is still said', () => {
    assert.equal(
      originWords({ ...base, kind: 'conversation', title: null, by: null }, 'UTC').words,
      'From a conversation',
    )
    assert.equal(originWords({ ...base, kind: 'decision', title: null, by: null }, 'UTC').words, 'From a decision')
  })
})
