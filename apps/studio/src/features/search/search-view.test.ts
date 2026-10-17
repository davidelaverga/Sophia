import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal } from '@sophia/contracts'
import type { SearchHit } from '../../api/vision.ts'
import { around, hitRunning, hitSource, localHits, marked } from './search-view.ts'

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
    assert.equal(hitSource(hit('message'), words), 'Message · Oct 4')
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

const goal = (id: string, title: string, over: Partial<Goal> = {}): Goal => ({
  id,
  projectId: 'p',
  title,
  revision: 1,
  authorityEpoch: 1,
  status: 'ready',
  outcome: `${title}, done`,
  criteria: [],
  stateRevision: 1,
  ...over,
})

/** A goal's health as a test says it: on track while running, else not started. */
const health = (g: Goal) => (g.status === 'running' ? 'On track' : 'Not started')

describe('goals and tasks in the search (docs/plans/search-goals.md)', () => {
  const goals = [
    goal('g1', 'Roll the onboarding out', { status: 'running' }),
    goal('g2', 'Keep teams through an admin change', {
      criteria: [{ id: 'c', description: 'The checklist opens on its first step', required: true, verification: 'v' }],
    }),
  ]
  const plans = {
    g1: { tasksFound: [{ id: 't1', purpose: 'Translate the checklist', doer: 'Marco’s Claude Code' }] },
  }

  it('finds a goal by its criterion and a task by its purpose, each labelled', () => {
    const hits = localHits(goals, plans, 'CHECKLIST', health)
    assert.deepEqual(
      hits.map((h) => [h.kind, h.id, h.title, h.source]),
      [
        ['goal', 'g2', 'Keep teams through an admin change', 'Goal · Not started'],
        ['task', 't1', 'Translate the checklist', 'Task · Marco’s Claude Code'],
      ],
    )
    assert.equal(hits[0]?.words, 'The checklist opens on its first step')
  })

  it('finds a task by who does it, and nothing under two letters', () => {
    assert.deepEqual(
      localHits(goals, plans, 'marco', health).map((h) => h.id),
      ['t1'],
    )
    assert.deepEqual(localHits(goals, plans, 'c', health), [])
  })

  it('carries a task’s doer, so its line can mark it (Codex P2 on #313)', () => {
    assert.equal(localHits(goals, plans, 'marco', health)[0]?.doer, 'Marco’s Claude Code')
  })

  it('says «Goal» alone while its health isn’t known: the notes unread (Codex P2 on #313)', () => {
    assert.equal(localHits(goals, plans, 'admin', () => null)[0]?.source, 'Goal')
  })

  it('keeps three of each at most', () => {
    const many = Array.from({ length: 5 }, (_, i) => goal(`m${String(i)}`, `Report ${String(i)}`))
    assert.equal(localHits(many, undefined, 'report', health).length, 3)
  })
})

describe('the words marked, and a long text cut around them', () => {
  it('marks every match whatever its case', () => {
    assert.deepEqual(marked('The Checklist and the checklist', 'checklist'), [
      { text: 'The ', mark: false },
      { text: 'Checklist', mark: true },
      { text: ' and the ', mark: false },
      { text: 'checklist', mark: true },
    ])
    assert.deepEqual(marked('Nothing here', 'checklist'), [{ text: 'Nothing here', mark: false }])
  })

  it('cuts a long text around the first match', () => {
    const long = `${'a '.repeat(100)}the checklist ${'b '.repeat(100)}`
    const cut = around(long, 'checklist', 80)
    assert.ok(cut.startsWith('…') && cut.endsWith('…'))
    assert.ok(cut.includes('the checklist'))
    assert.ok(cut.length <= 82)
    assert.equal(around('short text', 'text', 80), 'short text')
  })
})
