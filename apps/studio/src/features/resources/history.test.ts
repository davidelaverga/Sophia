import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { windowHistory } from './history.ts'
import type { QuotaObservation, QuotaWindow } from './resource.ts'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 2, 12) + minutes * 60_000).toISOString()
const window = (over: Partial<QuotaWindow>): QuotaWindow => ({
  window_id: 'five_hour',
  unit: 'percent_used',
  value: 40,
  resets_at: at(120),
  scope: 'account',
  applicability: 'known',
  state: 'observed',
  ...over,
})
const reading = (minutes: number, windows: QuotaWindow[]) =>
  ({ observed_at: at(minutes), windows }) as unknown as QuotaObservation

describe('a window’s history', () => {
  it('is the readings of that window, oldest first, one per moment', () => {
    const latest = window({ value: 60 })
    const readings = [
      reading(0, [latest]),
      reading(-60, [window({ value: 30 })]),
      reading(-30, [window({ value: 45 })]),
      reading(-30, [window({ value: 45 })]),
    ]
    assert.deepEqual(
      windowHistory(latest, readings).map((p) => p.value),
      [30, 45, 60],
    )
  })

  it('leaves out the window before its reset, other windows, and what wasn’t observed or may not apply', () => {
    const latest = window({ value: 60 })
    const readings = [
      reading(0, [latest]),
      reading(-400, [window({ value: 90, resets_at: at(-180) })]), // the window before: another window
      reading(-50, [window({ window_id: 'seven_day', value: 10 })]),
      reading(-40, [window({ value: null, state: 'unknown' })]),
      reading(-30, [window({ value: 50, applicability: 'unknown' })]),
      reading(-20, [window({ value: 5, unit: 'credits_remaining' })]),
    ]
    assert.deepEqual(
      windowHistory(latest, readings).map((p) => p.value),
      [60],
    )
  })
})
