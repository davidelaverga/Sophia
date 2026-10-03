import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { added, commandOf, drafted, received, repeatOf, resent, spaceOf, unanswered } from './command-store.ts'
import type { Command, Receipt } from './receipts.ts'

const target = {
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 3,
  attempt_id: 'at',
  session_id: 's',
}
const scope = 'p|w|a|3'
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
    drafted(a, scope, 'Only in a')
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
  })

  it('clears the words sent, once recorded, even with the sheet closed or a Hold sent since; never words typed after', () => {
    const space = fresh()
    const guide: Command = { operation_id: 'op-1', kind: 'guidance', text: 'Use the staging fixtures', target }
    added(space, guide)
    drafted(space, scope, 'Use the staging fixtures')
    added(space, { operation_id: 'op-2', kind: 'hold', target }) // a Hold in between
    received(space, 'op-1', receipt(guide, 1))
    assert.equal(spaceOf(space).drafts[scope], '')
    drafted(space, scope, 'Use the staging fixtures') // typed again after
    received(space, 'op-1', receipt(guide, 2, { delivery: 'delivered' }))
    assert.equal(spaceOf(space).drafts[scope], 'Use the staging fixtures')
  })

  it('keeps a refused guidance’s words to send again', () => {
    const space = fresh()
    const guide: Command = { operation_id: 'op-1', kind: 'guidance', text: 'Use the staging fixtures', target }
    added(space, guide)
    drafted(space, scope, 'Use the staging fixtures')
    const refusal = { admission: 'rejected' as const, delivery: 'not_sent' as const, effect: 'not_applicable' as const }
    received(space, 'op-1', receipt(guide, 1, { ...refusal, rejection: 'denied' }))
    assert.equal(spaceOf(space).drafts[scope], 'Use the staging fixtures')
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
