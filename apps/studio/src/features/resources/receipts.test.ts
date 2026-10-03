import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  fold,
  knownSaid,
  lost,
  reached,
  readReceipt,
  retried,
  scopeOf,
  sending,
  uncertain,
  unresolved,
  type Command,
  type Known,
  type Receipt,
} from './receipts.ts'

// The packet's own synthetic receipts, installed byte for byte (docs/missions/2026-10-03-workboard-connection).
const examples = new URL('../../../../../docs/missions/2026-10-03-workboard-connection/examples/', import.meta.url)
const example = (name: string): unknown => JSON.parse(readFileSync(new URL(name, examples), 'utf8'))

const target = {
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 3,
  attempt_id: 'at-3',
  session_id: 's',
}
const command = (kind: Command['kind'], over: Partial<Command> = {}): Command => ({
  operation_id: 'op-1',
  kind,
  target,
  ...over,
})

/** A receipt for `command`, at `revision`, saying what `over` says. */
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
  observed_at: '2026-10-02T12:00:00Z',
  admission: 'recorded',
  delivery: 'queued',
  effect: c.kind === 'guidance' ? 'not_applicable' : 'pending',
  rejection: null,
  evidence_refs: ['admission-1'],
  ...over,
})

const after = (c: Command, ...receipts: unknown[]): Known => receipts.reduce<Known>(fold, sending(c))

describe('readReceipt', () => {
  it('accepts the packet’s recorded Stop and its confirmed settlement', () => {
    for (const name of ['stop-recorded.json', 'stop-confirmed.json']) {
      const read = readReceipt(example(name))
      assert.equal(read.ok, true, read.ok ? '' : read.problems.join('\n'))
    }
  })

  it('refuses the packet’s negative receipts, saying why', () => {
    const stop = command('stop')
    const cases: [string, unknown, RegExp][] = [
      [
        'stopped without evidence',
        receipt(stop, 3, { effect: 'stopped', evidence_refs: [] }),
        /recorded, with evidence/,
      ],
      [
        'guidance claiming a stop',
        receipt(command('guidance'), 3, { effect: 'stopped' }),
        /only a stop settles as stopped/,
      ],
      ['rejected but queued', receipt(stop, 1, { admission: 'rejected' }), /was not sent/],
    ]
    for (const [name, value, says] of cases) {
      const read = readReceipt(value)
      assert.equal(read.ok, false, name)
      if (!read.ok) assert.match(read.problems.join('\n'), says, name)
    }
  })
})

describe('what is known of a command', () => {
  it('is Sending until a receipt comes, never Recorded before one (UI-09)', () => {
    assert.equal(knownSaid(sending(command('guidance'))), 'Sending…')
    assert.equal(reached(sending(command('guidance'))), -1)
  })

  it('says guidance as recorded, then delivered, never as followed', () => {
    const c = command('guidance')
    assert.equal(knownSaid(after(c, receipt(c, 1))), 'Guidance recorded; delivery pending.')
    const delivered = after(c, receipt(c, 1), receipt(c, 2, { delivery: 'delivered' }))
    assert.equal(knownSaid(delivered), 'Delivered to the session; not yet verified in the result.')
    assert.deepEqual([reached(delivered), unresolved(delivered)], [2, false])
  })

  it('says a Stop delivered but not settled as requested, and only a settled one as stopped (UI-10)', () => {
    const stop = command('stop')
    const delivered = after(stop, receipt(stop, 1), receipt(stop, 2, { delivery: 'delivered' }))
    assert.equal(knownSaid(delivered), 'Stop requested; waiting for the runtime to confirm.')
    assert.deepEqual([reached(delivered), unresolved(delivered)], [1, true])
    const unsure = fold(delivered, receipt(stop, 3, { delivery: 'delivered', effect: 'unknown' }))
    assert.equal(knownSaid(unsure), 'Stop requested. The runtime’s state is not confirmed yet.')
    assert.equal(uncertain(unsure), true)
    const settled = fold(
      unsure,
      receipt(stop, 4, { delivery: 'delivered', effect: 'stopped', evidence_refs: ['a', 'b'] }),
    )
    assert.equal(knownSaid(settled), 'Stopped. Completed work is kept.')
    const hold = command('hold')
    assert.equal(
      knownSaid(after(hold, receipt(hold, 1, { delivery: 'delivered', effect: 'held', evidence_refs: ['a', 'b'] }))),
      'Held. Work and remaining allowance are retained.',
    )
  })

  it('ignores a repeated or older receipt, never takes Recorded back, and keeps a settled effect (UI-12)', () => {
    const stop = command('stop')
    const settled = after(
      stop,
      receipt(stop, 4, { delivery: 'delivered', effect: 'stopped', evidence_refs: ['a', 'b'] }),
    )
    assert.equal(fold(settled, receipt(stop, 2, { delivery: 'queued' })), settled) // late
    assert.equal(fold(settled, receipt(stop, 4, { delivery: 'queued' })), settled) // repeated revision
    const later = fold(settled, receipt(stop, 5, { admission: 'unknown', delivery: 'unknown', effect: 'unknown' }))
    assert.deepEqual([later.receipt?.admission, later.receipt?.effect], ['recorded', 'stopped'])
  })

  it('never takes Recorded back for a later refusal: delivery and effect become unknown instead (review P3)', () => {
    const stop = command('stop')
    const delivered = after(stop, receipt(stop, 1), receipt(stop, 2, { delivery: 'delivered' }))
    const refused = { admission: 'rejected' as const, delivery: 'not_sent' as const, effect: 'not_applicable' as const }
    const later = fold(delivered, receipt(stop, 3, { ...refused, rejection: 'conflict' }))
    assert.deepEqual(
      [later.receipt?.admission, later.receipt?.delivery, later.receipt?.effect],
      ['recorded', 'unknown', 'unknown'],
    )
    assert.equal(knownSaid(later), 'Stop requested. The runtime’s state is not confirmed yet.')
  })

  it('never settles a command from another project’s receipt, whatever else matches (Codex F-001)', () => {
    const stop = command('stop')
    const foreign = receipt(stop, 3, {
      project_id: 'another-project',
      delivery: 'delivered',
      effect: 'stopped',
      evidence_refs: ['admission', 'settled'],
    })
    const known = fold(sending(stop), foreign)
    assert.equal(knownSaid(known), 'Sending…')
    assert.equal(known.receipt, null)
  })

  it('takes nothing from a receipt for other work, another generation, another operation, or one malformed (UI-12)', () => {
    const c = command('hold')
    const known = sending(c)
    for (const foreign of [
      receipt(c, 1, { project_id: 'another-project' }), // Codex F-001: the same ids in another project
      receipt(c, 1, { work_id: 'other' }),
      receipt(c, 1, { assignment_generation: 2 }),
      receipt(c, 1, { operation_id: 'op-2' }),
      receipt(c, 1, { kind: 'stop' }),
      { ...receipt(c, 1), admission: 'probably' },
    ]) {
      assert.equal(fold(known, foreign), known)
    }
  })

  it('says a refusal before sending as nothing sent; a lost reply as unknown, retried with the same operation (UI-09)', () => {
    const c = command('guidance', { text: 'Use the staging fixtures' })
    const refused = after(
      c,
      receipt(c, 1, { admission: 'rejected', delivery: 'not_sent', effect: 'not_applicable', rejection: 'denied' }),
    )
    assert.equal(knownSaid(refused), 'Not allowed here. Nothing was sent.')
    assert.equal(unresolved(refused), false)
    const gone = lost(sending(c))
    assert.equal(knownSaid(gone), 'Not confirmed whether it was recorded. Try again: it reuses the same request.')
    assert.deepEqual([unresolved(gone), uncertain(gone)], [true, true])
    assert.equal(retried(gone).command, c) // the same operation, the same words
    assert.equal(retried(gone).local, 'sending')
    // A receipt that already came isn't erased by a reply lost after it.
    const recorded = after(c, receipt(c, 1))
    assert.equal(lost(recorded), recorded)
  })

  it('keeps commands by work and assignment generation: a session’s next assignment starts afresh (UI-11)', () => {
    assert.notEqual(scopeOf(target), scopeOf({ ...target, assignment_generation: 4 }))
    assert.notEqual(scopeOf(target), scopeOf({ ...target, work_id: 'other' }))
    assert.equal(scopeOf(target), scopeOf({ ...target, attempt_id: 'at-4', session_id: 'other' }))
  })
})
