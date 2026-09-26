import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DiscussionEntry, NativeTask } from '@sophia/contracts'
import {
  authorLabel,
  briefBlocks,
  currentTask,
  liveInputs,
  MAX_BRIEF_INPUTS,
  TASK_PHASE,
  toggleInput,
} from './conversation-view.ts'

const entry = (id: string): DiscussionEntry => ({
  id,
  actorId: 'a',
  intent: 'discuss',
  origin: 'composer',
  text: id,
  sourceId: id,
  sha256: '0'.repeat(64),
  createdAt: '2026-09-25T00:00:00.000Z',
})

const task = (id: string, phase: NativeTask['phase']): NativeTask => ({
  id,
  kind: 'draft_brief',
  goalId: 'g',
  attemptId: 'a',
  commandId: 'c',
  actorId: 'x',
  state: 'running',
  phase,
  createdAt: '2026-09-25T00:00:00.000Z',
  contextSourceId: 's',
  inputSourceIds: [],
  resultSourceId: null,
  reason: null,
})

describe('conversation view', () => {
  it('names the author as the room knows them, never inventing one', () => {
    const names = new Map([['b', 'luis@example.com']])
    assert.equal(authorLabel('me', 'me', names), 'You')
    assert.equal(authorLabel('b', 'me', names), 'luis@example.com')
    assert.equal(authorLabel('c', 'me', names), 'A member')
  })

  it('keeps brief inputs in the order chosen, capped, and drops ones that left the discussion', () => {
    let selected: string[] = []
    for (const id of ['3', '1', '2']) selected = toggleInput(selected, id)
    assert.deepEqual(selected, ['3', '1', '2'])
    assert.deepEqual(toggleInput(selected, '1'), ['3', '2'])
    const full = Array.from({ length: MAX_BRIEF_INPUTS }, (_, i) => String(i))
    assert.deepEqual(toggleInput(full, 'extra'), full, 'no ninth input')
    assert.deepEqual(liveInputs(['3', '1', 'gone'], [entry('1'), entry('3')]), ['3', '1'])
  })

  it('reads a brief as headings, items and paragraphs, never as HTML', () => {
    assert.deepEqual(briefBlocks('## Intended outcome\n\nA room.\n- one\n* two\n<script>x</script>'), [
      { kind: 'heading', text: 'Intended outcome' },
      { kind: 'paragraph', text: 'A room.' },
      { kind: 'item', text: 'one' },
      { kind: 'item', text: 'two' },
      { kind: 'paragraph', text: '<script>x</script>' },
    ])
  })

  it('shows the newest task still in motion, else the newest; admitted is never called running', () => {
    assert.equal(currentTask([]), null)
    assert.equal(currentTask([task('a', 'running'), task('b', 'result_ready')])?.id, 'a')
    assert.equal(currentTask([task('a', 'stopped'), task('b', 'result_ready')])?.id, 'b')
    assert.notEqual(TASK_PHASE.queued.label, TASK_PHASE.running.label)
    assert.match(TASK_PHASE.result_ready.note, /candidate/i)
  })
})
