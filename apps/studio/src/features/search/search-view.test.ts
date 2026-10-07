import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SearchHit } from '../../api/vision.ts'
import { hitRunning, hitSource } from './search-view.ts'

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

describe('whether a recap hit’s meeting runs', () => {
  const running = { id: 'm1', endedAt: null }
  it('runs only when the latest meetings say it is the one running', () => {
    assert.equal(hitRunning('m1', [running]), true)
    assert.equal(hitRunning('m2', [running]), false)
    assert.equal(hitRunning('m1', [{ id: 'm1', endedAt: '2026-10-04T15:38:00.000Z' }]), false)
    assert.equal(hitRunning('m1', []), false)
  })

  it('is unknown until they are read', () => {
    assert.equal(hitRunning('m1', undefined), undefined)
  })
})
