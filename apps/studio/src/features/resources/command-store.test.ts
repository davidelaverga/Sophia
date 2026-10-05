import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  added,
  commandOf,
  commandSpace,
  drafted,
  received,
  repeatOf,
  resent,
  spaceOf,
  unanswered,
} from './command-store.ts'
import { executionOf, scopeOf, type Command, type Receipt } from './receipts.ts'

const target = {
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 3,
  attempt_id: 'at',
  session_id: 's',
}
/** The execution its drafts belong to: the scope, then its attempt and session (Codex F-007). */
const draft = executionOf(target)
let n = 0
/** A space of its own for each check: the store lives as long as the module. */
const fresh = () => `test-space-${String(++n)}`

const receipt = (c: Command, revision: number, over: Partial<Receipt> = {}): Receipt => ({
  schema_version: 'sophia.work.receipt.v1',
  operation_id: c.operation_id,
  receipt_id: `r-${c.operation_id}`,
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 3,
  kind: c.kind,
  revision,
  observed_at: '2026-10-02T12:00:00Z',
  admission: 'recorded',
  delivery: 'queued',
  effect: c.kind === 'guidance' ? 'not_applicable' : 'pending',
  rejection: null,
  evidence_refs: ['admission'],
  ...over,
})

describe('the command store', () => {
  it('keeps a space’s commands and drafts apart from every other space (viewer, project)', () => {
    const a = fresh()
    const b = fresh()
    added(a, { operation_id: 'op-1', kind: 'stop', target })
    drafted(a, draft, 'Only in a')
    assert.equal(spaceOf(a).known.length, 1)
    assert.deepEqual(spaceOf(b), { known: [], drafts: {} })
  })

  it('takes the same request again as the same operation: a control unresolved, or the same words (P1)', () => {
    const space = fresh()
    const guide: Command = { operation_id: 'op-g', kind: 'guidance', text: 'Use the staging fixtures', target }
    added(space, guide)
    unanswered(space, 'op-g')
    assert.equal(repeatOf(space, 'guidance', target, 'Use the staging fixtures')?.command.operation_id, 'op-g')
    assert.equal(repeatOf(space, 'guidance', target, 'Other words'), null)
    added(space, { operation_id: 'op-s', kind: 'stop', target })
    assert.equal(repeatOf(space, 'stop', target)?.command.operation_id, 'op-s')
    assert.equal(repeatOf(space, 'stop', { ...target, assignment_generation: 4 }), null) // another generation
    // The same generation's next attempt, or another session: another execution, so another request (PR #76, P1).
    assert.equal(repeatOf(space, 'stop', { ...target, attempt_id: 'at-next' }), null)
    assert.equal(repeatOf(space, 'stop', { ...target, session_id: 's-next' }), null)
  })

  it('is one space per project and viewer, whichever surface sends (Codex F-016)', () => {
    assert.equal(commandSpace('p', 'davide'), commandSpace('p', 'davide'))
    assert.notEqual(commandSpace('p', 'davide'), commandSpace('p', 'luis'))
    assert.notEqual(commandSpace('p', 'davide'), commandSpace('q', 'davide'))
  })

  it('keys a draft by its execution, so another attempt or session starts with none (Codex F-007)', () => {
    // One tuple of every field, each whole (Codex F-027).
    assert.deepEqual(JSON.parse(draft), ['execution', 'p', 'w', 'a', 3, 'at', 's'])
  })

  it('keeps tasks apart whose ids hold the old separator, and none apart from "-" (Codex F-027)', () => {
    const space = fresh()
    const first = { ...target, work_id: 'x|y', assignment_id: 'z' }
    const second = { ...target, work_id: 'x', assignment_id: 'y|z' }
    drafted(space, executionOf(first), 'For the first task only.')
    assert.equal(spaceOf(space).drafts[executionOf(second)], undefined)
    assert.equal(spaceOf(space).drafts[executionOf(first)], 'For the first task only.')
    // A Stop sent to the first is the first's history, never the second's; the same request to it is its own again.
    added(space, { operation_id: 'op-x', kind: 'stop', target: first })
    assert.equal(repeatOf(space, 'stop', second), null)
    assert.equal(repeatOf(space, 'stop', first)?.command.operation_id, 'op-x')
    // None and "-" are different ids.
    drafted(space, executionOf({ ...target, attempt_id: null }), 'No attempt named.')
    assert.equal(spaceOf(space).drafts[executionOf({ ...target, attempt_id: '-' })], undefined)
    // Spaces too: a project or viewer holding the separator, and no viewer, are each their own.
    assert.notEqual(commandSpace('a|b', 'c'), commandSpace('a', 'b|c'))
    assert.notEqual(commandSpace('p', null), commandSpace('p', ''))
    assert.notEqual(scopeOf(first), scopeOf(second))
  })

  it('clears the words sent, once recorded, even with the sheet closed or a Hold sent since; never words typed after', () => {
    const space = fresh()
    const guide: Command = { operation_id: 'op-1', kind: 'guidance', text: 'Use the staging fixtures', target }
    added(space, guide)
    drafted(space, draft, 'Use the staging fixtures')
    added(space, { operation_id: 'op-2', kind: 'hold', target }) // a Hold in between
    received(space, 'op-1', receipt(guide, 1))
    assert.equal(spaceOf(space).drafts[draft], '')
    drafted(space, draft, 'Use the staging fixtures') // typed again after
    received(space, 'op-1', receipt(guide, 2, { delivery: 'delivered' }))
    assert.equal(spaceOf(space).drafts[draft], 'Use the staging fixtures')
  })

  it('keeps a refused guidance’s words to send again', () => {
    const space = fresh()
    const guide: Command = { operation_id: 'op-1', kind: 'guidance', text: 'Use the staging fixtures', target }
    added(space, guide)
    drafted(space, draft, 'Use the staging fixtures')
    const refusal = { admission: 'rejected' as const, delivery: 'not_sent' as const, effect: 'not_applicable' as const }
    received(space, 'op-1', receipt(guide, 1, { ...refusal, rejection: 'denied' }))
    assert.equal(spaceOf(space).drafts[draft], 'Use the staging fixtures')
  })

  it('says a retry is on its way again, after a lost reply or an unknown admission (every press answers)', () => {
    const space = fresh()
    const stop: Command = { operation_id: 'op-1', kind: 'stop', target }
    added(space, stop)
    received(space, 'op-1', receipt(stop, 1, { admission: 'unknown', delivery: 'unknown', effect: 'unknown' }))
    resent(space, 'op-1')
    assert.equal(commandOf(space, 'op-1')?.local, 'sending')
  })
})
