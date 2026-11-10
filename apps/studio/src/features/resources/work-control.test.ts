import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fold, lost, sending, type Command, type CommandTarget, type Known, type Receipt } from './receipts.ts'
import { covers, guidanceWithheld, observedOf, retryKinds, stillOffered, workState } from './work-control.ts'

/** Resources names no attempt; Tasks does. Both name the same project, work, assignment, generation and session. */
const resources: CommandTarget = {
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 3,
  attempt_id: null,
  session_id: 's',
}
const tasks: CommandTarget = { ...resources, attempt_id: 'attempt-3' }
const command = (kind: Command['kind'], operation = `op-${kind}`, at: CommandTarget = resources): Command => ({
  operation_id: operation,
  kind,
  target: at,
})
/** A receipt for `c` at `revision`, saying what `over` says. */
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
  observed_at: '2026-11-10T12:00:00Z',
  admission: 'recorded',
  delivery: 'queued',
  effect: c.kind === 'guidance' ? 'not_applicable' : 'pending',
  rejection: null,
  evidence_refs: ['admission'],
  ...over,
})
/** A command folded through its receipts, in the order given. */
const through = (c: Command, ...receipts: Receipt[]): Known => receipts.reduce<Known>((k, r) => fold(k, r), sending(c))
const settled = (c: Command, effect: Receipt['effect']) =>
  through(
    c,
    receipt(c, 1, { delivery: 'delivered' }),
    receipt(c, 2, { delivery: 'delivered', effect, evidence_refs: ['native'] }),
  )
const pending = (c: Command) => through(c, receipt(c, 1, { delivery: 'delivered' }))
const offer = [{ kind: 'guidance' }, { kind: 'hold' }, { kind: 'resume' }, { kind: 'stop' }] as const
const kinds = (o: readonly { kind: string }[]) => o.map((x) => x.kind)

describe('a work’s control state: what applies to it (F03)', () => {
  it('covers the same assignment and generation whether either side names its attempt or not; never another', () => {
    assert.equal(covers(tasks, resources), true) // a Resources command, seen from Tasks' named attempt
    assert.equal(covers(resources, tasks), true) // and the other way
    assert.equal(covers(tasks, { ...tasks, attempt_id: 'attempt-2' }), false) // known distinct attempts
    assert.equal(covers(tasks, { ...resources, assignment_generation: 4 }), false) // reassigned
    assert.equal(covers(tasks, { ...resources, assignment_id: 'b' }), false)
    assert.equal(covers(tasks, { ...resources, session_id: 'other' }), false) // another session
    assert.equal(covers(tasks, { ...resources, session_id: null }), true) // its session unnamed: ambiguous, fenced
  })

  it('fences guidance on Tasks’ named attempt for a Stop sent from Resources unnamed, and the other way round', () => {
    const fromResources = pending(command('stop', 'op-stop', resources))
    assert.deepEqual(kinds(stillOffered(offer, workState([fromResources], tasks, null))), ['hold', 'resume', 'stop'])
    const fromTasks = pending(command('stop', 'op-stop', tasks))
    assert.deepEqual(kinds(stillOffered(offer, workState([fromTasks], resources, null))), ['hold', 'resume', 'stop'])
    // Another attempt, generation or session keeps its own offers.
    for (const other of [
      { ...tasks, attempt_id: 'attempt-4' },
      { ...tasks, assignment_generation: 4 },
      { ...tasks, session_id: 'other' },
    ]) {
      assert.deepEqual(kinds(stillOffered(offer, workState([fromTasks], other, null))), kinds(offer))
    }
  })
})

describe('a work’s control state: every control, not only the latest (F02)', () => {
  it('keeps a Stop not yet settled fencing guidance after a later Resume took effect', () => {
    const stop = pending(command('stop'))
    const resumed = settled(command('resume'), 'resumed')
    const state = workState([stop, resumed], resources, 'held')
    assert.equal(state.fenced.has('guidance'), true)
    assert.equal(state.said?.status, 'Stop requested') // the Stop speaks, not the Resume
    assert.equal(state.guidanceWhy, 'No guidance while its Stop is under way.')
  })

  it('keeps an unconfirmed Stop fencing, a lost one too, whatever order its receipts came in', () => {
    const stop = command('stop')
    const late = through(stop, receipt(stop, 2, { delivery: 'delivered', effect: 'unknown' }), receipt(stop, 1))
    assert.equal(workState([late], resources, null).fenced.has('guidance'), true)
    assert.equal(workState([late], resources, null).said?.status, 'Stop not confirmed')
    assert.equal(workState([lost(sending(stop))], resources, null).fenced.has('guidance'), true)
  })

  it('stops everything once a Stop is settled, whatever is pressed after; a refused Stop changed nothing', () => {
    const state = workState([settled(command('stop'), 'stopped'), pending(command('hold'))], resources, null)
    assert.deepEqual(stillOffered(offer, state), [])
    assert.deepEqual([...retryKinds(offer, state)], [])
    assert.equal(state.said?.status, 'Stopped')
    const refused = command('stop')
    const no = through(
      refused,
      receipt(refused, 1, {
        admission: 'rejected',
        delivery: 'not_sent',
        effect: 'not_applicable',
        rejection: 'denied',
      }),
    )
    assert.deepEqual(kinds(stillOffered(offer, workState([no], resources, null))), kinds(offer))
  })

  it('tries again only the controls in play, each its own operation; never a lost guidance past a fence', () => {
    const state = workState([lost(sending(command('guidance'))), lost(sending(command('stop')))], resources, null)
    const again = retryKinds(offer, state)
    assert.equal(again.has('stop'), true) // the same Stop, reconciled
    assert.equal(again.has('guidance'), false) // its words would arrive after the Stop
  })
})

describe('a work’s control state: what its view observes (F01)', () => {
  it('fences a view observed held with nothing sent here: no guidance, no Hold, Resume as its view allows', () => {
    const state = workState([], tasks, 'held')
    assert.deepEqual(kinds(stillOffered(offer, state)), ['resume', 'stop'])
    assert.deepEqual({ ...state.said }, { status: 'Held', tone: 'muted', sentence: 'Its runtime reports it held.' })
    assert.equal(retryKinds(offer, state).has('guidance'), false)
    assert.equal(state.guidanceWhy, 'No guidance to held work: it would start a new turn.')
  })

  it('fences everything for a view observed stopped, whatever its allowed actions still list', () => {
    const state = workState([], tasks, 'stopped')
    assert.deepEqual(stillOffered(offer, state), [])
    assert.equal(state.said?.sentence, 'Its runtime reports it stopped.')
  })

  it('reads held and stopped from a Tasks lifecycle, nothing else', () => {
    assert.deepEqual(['held', 'stopped', 'running', 'waiting', 'unknown', null].map(observedOf), [
      'held',
      'stopped',
      null,
      null,
      null,
      null,
    ])
  })

  it('says a receipt-proven Hold in its own words; its Resume under way withholds Resume and Hold', () => {
    assert.equal(
      workState([settled(command('hold'), 'held')], resources, null).said?.sentence,
      'Its runtime confirmed the hold.',
    )
    const resuming = workState([settled(command('hold'), 'held'), pending(command('resume'))], tasks, 'held')
    assert.deepEqual(kinds(stillOffered(offer, resuming)), ['stop'])
    assert.equal(resuming.said?.status, 'Resume requested')
    assert.equal(resuming.guidanceWhy, 'No guidance while its Resume is under way.')
    const running = workState([settled(command('hold'), 'held'), settled(command('resume'), 'resumed')], tasks, null)
    assert.deepEqual(kinds(stillOffered(offer, running)), kinds(offer)) // its view decides again
    assert.equal(running.said, null)
  })
})

describe('a work’s control state: nothing in play', () => {
  it('withholds nothing and says nothing while no control is sent and its view is neither held nor stopped', () => {
    const state = workState([through(command('guidance'), receipt(command('guidance'), 1))], tasks, null)
    assert.deepEqual(kinds(stillOffered(offer, state)), kinds(offer))
    assert.equal(state.said, null)
    assert.equal(guidanceWithheld(offer, state, 'draft'), null)
  })

  it('says a draft is kept on this page, nothing more sent from it, only where guidance is withheld', () => {
    const held = workState([], tasks, 'held')
    assert.equal(
      guidanceWithheld(offer, held, 'Use the staging fixtures'),
      'No guidance to held work: it would start a new turn. What you wrote is kept on this page; nothing more is sent from it.',
    )
    assert.equal(guidanceWithheld([{ kind: 'stop' }], held, 'x'), null) // its view never offered guidance
  })
})

describe('a work’s settled control as structure (r3 repair 2, F05)', () => {
  it('is held as its view reports or by a Hold settled here; a Hold under way, or a Resume settled since, is not', () => {
    assert.equal(workState([], tasks, 'held').settled, 'held') // the view's own word, nothing sent here
    assert.equal(workState([settled(command('hold'), 'held')], resources, null).settled, 'held')
    assert.equal(workState([pending(command('hold'))], resources, null).settled, null)
    assert.equal(workState([lost(sending(command('hold')))], resources, null).settled, null)
    const resumed = [settled(command('hold'), 'held'), settled(command('resume'), 'resumed')]
    assert.equal(workState(resumed, tasks, 'held').settled, null) // its view may lag the Resume's receipt
    assert.equal(workState([], tasks, 'stopped').settled, 'stopped')
    assert.equal(workState([settled(command('stop'), 'stopped')], resources, null).settled, 'stopped')
    assert.equal(workState([pending(command('stop'))], resources, null).settled, null)
  })
})
