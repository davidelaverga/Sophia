import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { needNote, needsLabel, needsOrder, untilWords, type Need } from './needs-you.ts'

const NOW = new Date('2026-10-11T10:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const need = (id: string, over: Partial<Need> = {}): Need => ({
  id,
  kind: 'review',
  title: `About ${id}`,
  project: 'Launch plan',
  expiresAt: null,
  detail: null,
  ...over,
})

describe('what needs you on Home', () => {
  it('orders the expiring first, soonest first, then the rest as given', () => {
    const needs = [
      need('r'),
      need('p', { expiresAt: at(90) }),
      need('g', { detail: 'Waiting 2 min' }),
      need('d', { expiresAt: at(20) }),
    ]
    assert.deepEqual(
      needsOrder(needs).map((n) => n.id),
      ['d', 'p', 'r', 'g'],
    )
  })

  it('says where and when: minutes within the hour (soon), hours in the day, days; expired, late', () => {
    assert.deepEqual(needNote(need('d', { expiresAt: at(20) }), NOW), {
      text: 'Launch plan · expires in 20 min',
      tone: 'soon',
    })
    assert.deepEqual(needNote(need('p', { expiresAt: at(130) }), NOW), {
      text: 'Launch plan · expires in 2 h',
      tone: 'quiet',
    })
    assert.equal(untilWords(NOW.getTime() + 3 * 24 * 3_600_000, NOW.getTime()), 'in 3 days')
    assert.equal(untilWords(NOW.getTime() + 30 * 3_600_000, NOW.getTime()), 'in 30 h') // hours to 47: never «1 days»
    assert.equal(untilWords(NOW.getTime() + 50 * 3_600_000, NOW.getTime()), 'in 2 days')
    assert.deepEqual(needNote(need('x', { expiresAt: at(-1) }), NOW), { text: 'Launch plan · expired', tone: 'late' })
  })

  it('keeps a detail where nothing expires; Sophia’s own reply names no project', () => {
    assert.deepEqual(needNote(need('g', { detail: 'Waiting 2 min' }), NOW), {
      text: 'Launch plan · Waiting 2 min',
      tone: 'quiet',
    })
    assert.deepEqual(needNote(need('s', { kind: 'reply', project: null, detail: 'Yesterday' }), NOW), {
      text: 'Yesterday',
      tone: 'quiet',
    })
  })

  it('counts them', () => {
    assert.deepEqual([0, 1, 3].map(needsLabel), [
      'Nothing needs you right now',
      '1 thing needs you',
      '3 things need you',
    ])
  })
})
