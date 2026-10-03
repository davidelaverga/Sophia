import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { spanOf, windowHistory } from './history.ts'
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

  it('is one window by its epoch, as the contract says: a reset with the same id and reset time is another', () => {
    const latest = window({ value: 20, resets_at: null, window_epoch: 'e2' })
    const readings = [
      reading(0, [latest]),
      reading(-30, [window({ value: 10, resets_at: null, window_epoch: 'e2' })]),
      reading(-60, [window({ value: 95, resets_at: null, window_epoch: 'e1' })]), // before the reset
    ]
    assert.deepEqual(
      windowHistory(latest, readings).map((p) => p.value),
      [10, 20],
    )
  })

  it('spans from its first reading to its last, whenever it is looked at', () => {
    assert.equal(
      spanOf([
        { at: 0, value: 1 },
        { at: 3 * 3_600_000, value: 2 },
      ]),
      '3 h',
    )
    assert.equal(spanOf([{ at: 0, value: 1 }]), '')
  })
})
