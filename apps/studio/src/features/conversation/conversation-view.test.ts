import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { NativeTask } from '@sophia/contracts'
import { authorLabel, briefBlocks, visibleBriefBlocks, currentTask, TASK_PHASE } from './conversation-view.ts'

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

  it('preserves the runtime brief content and removes its citation section and metadata', () => {
    const markdown = [
      '## Intended outcome',
      'A real voice in the shared room [input:first].',
      '## Retained decisions',
      '- Keep the floor (A01).',
      '## Proposed next implementation step',
      'Close the runtime crossing.',
      '## Open questions',
      '- None yet.',
      '## Cited inputs',
      '- first, second',
      'Source b7ff034b948',
      'Drafted by OpenAI',
    ].join('\n')
    assert.deepEqual(visibleBriefBlocks(markdown), [
      { kind: 'heading', text: 'Intended outcome' },
      { kind: 'paragraph', text: 'A real voice in the shared room.' },
      { kind: 'heading', text: 'Retained decisions' },
      { kind: 'item', text: 'Keep the floor (A01).' },
      { kind: 'heading', text: 'Proposed next implementation step' },
      { kind: 'paragraph', text: 'Close the runtime crossing.' },
      { kind: 'heading', text: 'Open questions' },
      { kind: 'item', text: 'None yet.' },
    ])
    assert.equal(visibleBriefBlocks(markdown)[1]?.text, 'A real voice in the shared room.')
  })
})

it('brief metadata filtering keeps ordinary authored Source and Drafted by sentences', () => {
  assert.deepEqual(
    visibleBriefBlocks(
      'Source facade needs a repair.\nDrafted by the team after the discussion.\nSource b7ff034b948\nDrafted by OpenAI',
    ),
    [
      { kind: 'paragraph', text: 'Source facade needs a repair.' },
      { kind: 'paragraph', text: 'Drafted by the team after the discussion.' },
    ],
  )
})
