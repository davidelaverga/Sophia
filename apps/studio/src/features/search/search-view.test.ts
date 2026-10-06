import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SearchHit } from '../../api/vision.ts'
import { hitSource } from './search-view.ts'

const words = { day: () => 'Oct 4', time: () => '15:00', today: () => false }

const hit = (kind: SearchHit['kind']): SearchHit => ({
  kind,
  id: 'h',
  title: 't',
  snippet: 's',
  meetingId: null,
  at: '2026-10-04T15:00:00.000Z',
  cite: { recordId: 'r' },
})

describe('where a hit is from', () => {
  it('names its kind and when, a recap with its time', () => {
    assert.equal(hitSource(hit('decision'), words), 'Decision · Oct 4')
    assert.equal(hitSource(hit('note'), words), 'Kept note · Oct 4')
    assert.equal(hitSource(hit('report'), words), 'Report · Oct 4')
    assert.equal(hitSource(hit('report_section'), words), 'Report section · Oct 4')
    assert.equal(hitSource(hit('recap'), words), 'Meeting recap · Oct 4, 15:00')
  })
})
