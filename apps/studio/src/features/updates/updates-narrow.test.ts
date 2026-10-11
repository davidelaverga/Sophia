import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Records } from '../voice/recap-view.ts'
import { kindCounts, narrowRecords, peopleOf } from './updates-view.ts'

const R: Records = {
  decided: [
    { decisionId: 'd1', statement: 'Keep the checks', proposedBy: 'lucia', decidedBy: 'me', at: 't', undoable: false },
  ],
  made: [{ artifactId: 'a1', artifactVersionId: 'v1', title: 'Readout', versionNumber: 2, askedBy: 'noor' }],
  noted: [
    { entryId: 'n1', kind: 'observation', text: 'Both teams', authoredBy: 'member', actorId: 'lucia', at: 't' },
    { entryId: 'n2', kind: 'observation', text: 'Second region', authoredBy: 'member', actorId: 'noor', at: 't' },
  ],
  open: [{ proposalId: 'p1', statement: 'Record a demo' }],
  work: [{ taskId: 'w1', kind: 'research', state: 'running' }],
}
const keys = (r: Records) => ({
  decided: r.decided.map((d) => d.decisionId),
  made: r.made.map((m) => m.artifactVersionId),
  noted: r.noted.map((n) => n.entryId),
  open: r.open.map((o) => o.proposalId),
  work: r.work.map((w) => w.taskId),
})

describe('the digest narrowed', () => {
  it('to everyone and every kind: all of it', () => {
    assert.deepEqual(keys(narrowRecords(R, { kind: 'all', person: null })), keys(R))
  })
  it('to a kind: that kind alone', () => {
    assert.deepEqual(keys(narrowRecords(R, { kind: 'kept', person: null })), {
      decided: [],
      made: [],
      noted: ['n1', 'n2'],
      open: [],
      work: [],
    })
  })
  it('to a person: what they proposed, decided, asked or kept; what names nobody is for everyone only', () => {
    assert.deepEqual(keys(narrowRecords(R, { kind: 'all', person: 'lucia' })), {
      decided: ['d1'],
      made: [],
      noted: ['n1'],
      open: [],
      work: [],
    })
    assert.deepEqual(keys(narrowRecords(R, { kind: 'all', person: 'me' })).decided, ['d1']) // the decider too
    assert.deepEqual(keys(narrowRecords(R, { kind: 'open', person: 'lucia' })).open, [])
  })
  it('to both', () => {
    assert.deepEqual(keys(narrowRecords(R, { kind: 'kept', person: 'noor' })).noted, ['n2'])
  })
})

describe('the row over it', () => {
  it('counts each kind', () => {
    assert.deepEqual(kindCounts(R), { decided: 1, made: 1, kept: 2, open: 1, work: 1 })
  })
  it('lists who appears, in order, once, by the digest’s names, the viewer as You', () => {
    assert.deepEqual(peopleOf(R, { lucia: 'Lucía', noor: 'Noor', me: 'Fixture viewer' }, 'me'), [
      { id: 'lucia', name: 'Lucía' },
      { id: 'me', name: 'You' },
      { id: 'noor', name: 'Noor' },
    ])
    assert.deepEqual(peopleOf({ ...R, decided: [], noted: [] }, {}, 'me'), [{ id: 'noor', name: 'Someone' }])
  })
})
