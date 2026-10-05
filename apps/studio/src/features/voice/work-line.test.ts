import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal, NativeTask, NativeTaskDetail } from '@sophia/contracts'
import { soleTask, workWords } from './work-line.ts'

const task = (id: string, over: Partial<NativeTask> = {}): NativeTask => ({
  id,
  kind: 'research',
  goalId: `goal-${id}`,
  attemptId: 'a',
  commandId: 'c',
  actorId: 'me',
  state: 'running',
  phase: 'running',
  createdAt: '2026-10-05T00:00:00.000Z',
  contextSourceId: 's',
  inputSourceIds: [],
  resultSourceId: null,
  reason: null,
  ...over,
})

const goal = (id: string, status: Goal['status']): Goal => ({
  id,
  projectId: 'p',
  title: 'A goal',
  revision: 1,
  authorityEpoch: 1,
  status,
  outcome: '',
  criteria: [],
  stateRevision: 1,
})

const detail = (reads: number): NativeTaskDetail => ({
  task: task('t'),
  instruction: '',
  result: null,
  research: {
    question: 'q',
    specialist: 's',
    outputs: ['markdown'],
    rootTaskId: 't',
    capUsd: 5,
    committedUsd: 0,
    spentUsd: 0,
    searches: { used: 1, max: 5 },
    reads: { used: reads, max: 8 },
  },
})

describe('the task her line can speak of', () => {
  it('is the one native task running, when it is the only work', () => {
    assert.equal(soleTask({ goals: [], work: [task('t')] })?.id, 't')
  })

  it('is none with two pieces of work, or a goal running without a task', () => {
    assert.equal(soleTask({ goals: [], work: [task('a'), task('b')] }), null)
    assert.equal(soleTask({ goals: [goal('g', 'running')], work: [task('t')] }), null)
  })

  it('is none once the task is no longer running, or without a snapshot', () => {
    assert.equal(soleTask({ goals: [], work: [task('t', { phase: 'result_ready', state: 'succeeded' })] }), null)
    assert.equal(soleTask(undefined), null)
  })
})

describe('what her line says of it', () => {
  it('says she researches, and how many sources she read once she read some', () => {
    assert.equal(workWords(task('t'), undefined), 'Researching')
    assert.equal(workWords(task('t'), detail(0)), 'Researching')
    assert.equal(workWords(task('t'), detail(1)), 'Researching · 1 source read')
    assert.equal(workWords(task('t'), detail(3)), 'Researching · 3 sources read')
  })

  it('says she drafts the brief for a brief', () => {
    assert.equal(workWords(task('t', { kind: 'draft_brief' }), undefined), 'Drafting the brief')
  })
})
