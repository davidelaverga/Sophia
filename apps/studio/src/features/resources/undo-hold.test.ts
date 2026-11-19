// Undo after Hold (docs/plans/undo-hold.md): which Hold an Undo may take back, for how long, and its words.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fold,
  lost,
  sending,
  type Command,
  type CommandTarget,
  type Known,
  type Offer,
  type Receipt,
} from './receipts.ts'
import { pendingHold, UNDO_HOLD, UNDO_MS, undoableHold, undoWatch } from './undo-hold.ts'

const target: CommandTarget = {
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 3,
  attempt_id: 'attempt-3',
  session_id: 's',
}
const command = (kind: Command['kind'], operation = `op-${kind}`, at: CommandTarget = target): Command => ({
  operation_id: operation,
  kind,
  target: at,
})
const receipt = (c: Command, revision: number, over: Partial<Receipt> = {}): Receipt => ({
  schema_version: 'sophia.work.receipt.v1',
  operation_id: c.operation_id,
  receipt_id: `r-${c.operation_id}`,
  project_id: c.target.project_id,
  work_id: c.target.work_id,
  assignment_id: c.target.assignment_id,
  assignment_generation: c.target.assignment_generation,
  kind: c.kind,
  revision,
  observed_at: '2026-11-19T12:00:00Z',
  admission: 'recorded',
  delivery: 'queued',
  effect: c.kind === 'guidance' ? 'not_applicable' : 'pending',
  rejection: null,
  evidence_refs: ['admission'],
  ...over,
})
const through = (c: Command, ...receipts: Receipt[]): Known => receipts.reduce<Known>((k, r) => fold(k, r), sending(c))
const settled = (c: Command, effect: Receipt['effect']) =>
  through(
    c,
    receipt(c, 1, { delivery: 'delivered' }),
    receipt(c, 2, { delivery: 'delivered', effect, evidence_refs: ['native'] }),
  )
const pending = (c: Command) => through(c, receipt(c, 1, { delivery: 'delivered' }))
const refused = (c: Command) =>
  through(
    c,
    receipt(c, 1, { admission: 'rejected', delivery: 'not_sent', effect: 'not_applicable', rejection: 'conflict' }),
  )
const resumeOffered: Offer[] = [{ kind: 'resume' }, { kind: 'stop' }]

describe('undo-hold · which Hold an Undo takes back', () => {
  it('a Hold its runtime confirmed, the latest control, with Resume offered: its own operation', () => {
    const hold = command('hold', 'op-h1')
    assert.equal(undoableHold([settled(hold, 'held')], target, resumeOffered), 'op-h1')
  })

  it('nothing while the Hold is sending, on its way, lost, unconfirmed or refused', () => {
    const hold = command('hold')
    assert.equal(undoableHold([sending(hold)], target, resumeOffered), null)
    assert.equal(undoableHold([pending(hold)], target, resumeOffered), null)
    assert.equal(undoableHold([lost(sending(hold))], target, resumeOffered), null)
    assert.equal(undoableHold([settled(hold, 'unknown')], target, resumeOffered), null)
    assert.equal(undoableHold([refused(hold)], target, resumeOffered), null)
  })

  it('nothing with no Hold sent from here: an empty store, or only guidance', () => {
    assert.equal(undoableHold([], target, resumeOffered), null)
    assert.equal(undoableHold([pending(command('guidance'))], target, resumeOffered), null)
  })

  it('nothing once a Resume or a Stop came after it, whatever became of them', () => {
    const hold = settled(command('hold'), 'held')
    for (const after of [
      sending(command('resume')),
      pending(command('resume')),
      refused(command('resume')),
      settled(command('resume'), 'resumed'),
      pending(command('stop')),
    ])
      assert.equal(undoableHold([hold, after], target, resumeOffered), null, JSON.stringify(after))
  })

  it('a later guidance does not end it (it is no control)', () => {
    const hold = settled(command('hold', 'op-h'), 'held')
    assert.equal(undoableHold([hold, pending(command('guidance'))], target, resumeOffered), 'op-h')
  })

  it('a newer Hold replaces the older: the latest one is offered', () => {
    const first = settled(command('hold', 'op-h1'), 'held')
    const back = settled(command('resume', 'op-r'), 'resumed')
    const second = settled(command('hold', 'op-h2'), 'held')
    assert.equal(undoableHold([first, back, second], target, resumeOffered), 'op-h2')
  })

  it('nothing unless Resume is offered now: the same press, the same permission', () => {
    const hold = [settled(command('hold'), 'held')]
    assert.equal(undoableHold(hold, target, []), null)
    assert.equal(undoableHold(hold, target, [{ kind: 'stop' }]), null)
    assert.equal(undoableHold(hold, target, [{ kind: 'hold' }, { kind: 'stop' }]), null)
  })

  it('only for the execution shown: another attempt or session in its place has none', () => {
    const hold = [settled(command('hold'), 'held')]
    assert.equal(undoableHold(hold, { ...target, attempt_id: 'attempt-4' }, resumeOffered), null)
    assert.equal(undoableHold(hold, { ...target, session_id: 's2' }, resumeOffered), null)
    assert.equal(undoableHold(hold, null, resumeOffered), null)
  })
})

describe('undo-hold · a Hold on its way', () => {
  it('the latest control for the execution shown, a Hold not yet settled nor refused', () => {
    const hold = command('hold', 'op-p')
    assert.equal(pendingHold([sending(hold)], target), 'op-p')
    assert.equal(pendingHold([pending(hold)], target), 'op-p')
    assert.equal(pendingHold([lost(sending(hold))], target), 'op-p')
  })

  it('none once settled or refused, after a later control, or for another execution', () => {
    const hold = command('hold')
    assert.equal(pendingHold([settled(hold, 'held')], target), null)
    assert.equal(pendingHold([refused(hold)], target), null)
    assert.equal(pendingHold([pending(hold), sending(command('stop'))], target), null)
    assert.equal(pendingHold([pending(hold)], { ...target, attempt_id: 'attempt-4' }), null)
    assert.equal(pendingHold([pending(hold)], null), null)
  })
})

describe('undo-hold · when and how long, for one sheet', () => {
  it('only a Hold this sheet saw on its way: one already settled when it came is never offered', () => {
    const watch = undoWatch()
    assert.equal(watch.offer('op-old', 1000), null)
    const fresh = undoWatch()
    assert.equal(fresh.offer('op-settled-elsewhere', 0), null)
  })

  it('6 seconds from when it is first offered, the same end when asked again, none after', () => {
    assert.equal(UNDO_MS, 6000)
    const watch = undoWatch()
    watch.see('op-h')
    assert.equal(watch.offer('op-h', 1000), 7000)
    assert.equal(watch.offer('op-h', 5000), 7000) // back after a moment out of offer: the same end
    assert.equal(watch.offer('op-h', 7000), null)
    assert.equal(watch.offer('op-h', 9000), null)
  })

  it('nothing for no Hold; each Hold its own window; see(null) is nothing', () => {
    const watch = undoWatch()
    watch.see(null)
    assert.equal(watch.offer(null, 0), null)
    watch.see('op-a')
    watch.see('op-b')
    assert.equal(watch.offer('op-a', 0), 6000)
    assert.equal(watch.offer('op-b', 4000), 10000)
  })

  it('a window over is forgotten, whichever Hold is asked next: nothing grows', () => {
    const watch = undoWatch()
    watch.see('op-gone')
    watch.offer('op-gone', 0)
    assert.equal(watch.size(), 1)
    assert.equal(watch.offer(null, 6000), null) // swept on any ask
    assert.equal(watch.size(), 0)
    assert.equal(watch.offer('op-gone', 6500), null)
  })
})

describe('undo-hold · words', () => {
  it('kept in one place', () => {
    assert.deepEqual(UNDO_HOLD, { said: 'Put on hold.', act: 'Undo' })
  })
})
