import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  asErrorBody,
  ContractViolation,
  isCursorAdvance,
  parseFrame,
  parseProjectCreated,
  parseReceipt,
  parseSnapshot,
} from './validate.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'
const G = '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d'

const snapshot = {
  projectId: P,
  title: 'Sophia',
  cursor: '12',
  missionRevision: 1,
  audienceRevision: 1,
  eligibilityRevision: 1,
  goals: [],
  resources: [],
  humanActions: [],
  artifacts: [],
  sharedFocus: null,
  room: { id: G, revision: 1, inputActorId: null, mode: 'invoked' },
  lobby: [],
  sessions: [],
  discussion: [],
  work: [],
}
const receipt = {
  commandId: G,
  projectId: P,
  cursor: '13',
  stage: 'admitted',
  goalId: G,
  goalRevision: 1,
  authorityEpoch: 1,
}
const event = {
  eventId: G,
  projectId: P,
  sequence: '13',
  type: 'command.admitted',
  occurredAt: '2026-09-24T18:00:00.000Z',
  entityType: 'command',
  entityId: G,
  entityRevision: 1,
  references: [],
  summaryCode: 'review_requested',
}

/** The ContractViolation a parse throws, for asserting on its details. */
function violation(parse: () => unknown): ContractViolation {
  try {
    parse()
  } catch (err: unknown) {
    if (err instanceof ContractViolation) return err
    throw err
  }
  throw new Error('expected a ContractViolation')
}

describe('@sophia/contracts/validate', () => {
  it('returns values that match the contract unchanged', () => {
    assert.deepEqual(parseSnapshot(snapshot), snapshot)
    assert.deepEqual(parseReceipt(receipt), receipt)
    assert.deepEqual(parseProjectCreated({ projectId: P, cursor: '0' }), { projectId: P, cursor: '0' })
  })

  it('rejects what a cast would have let through', () => {
    const cases: Array<[string, () => unknown, RegExp]> = [
      ['missing field', () => parseSnapshot({ ...snapshot, goals: undefined }), /goals/],
      ['unknown field', () => parseReceipt({ ...receipt, actorId: G }), /additional properties/],
      ['numeric cursor', () => parseReceipt({ ...receipt, cursor: 13 }), /\/cursor must be string/],
      ['cursor with a leading zero', () => parseProjectCreated({ projectId: P, cursor: '01' }), /\/cursor/],
      [
        'non-uuid id',
        () => parseProjectCreated({ projectId: 'p-1', cursor: '0' }),
        /\/projectId must match format "uuid"/,
      ],
      ['unknown stage', () => parseReceipt({ ...receipt, stage: 'done' }), /\/stage/],
      ['revision below 1', () => parseReceipt({ ...receipt, goalRevision: 0 }), /\/goalRevision/],
      ['not an object', () => parseSnapshot('<html>'), /must be object/],
    ]
    for (const [name, parse, issue] of cases) {
      const err = violation(parse)
      assert.match(err.issues, issue, name)
    }
    assert.equal(violation(() => parseSnapshot(null)).schema, 'Snapshot')
  })

  it('reads an error body only when it is one', () => {
    const body = { code: 'forbidden', message: 'Not permitted', requestId: G, retry: 'never' }
    assert.deepEqual(asErrorBody(body), body)
    assert.equal(asErrorBody({ code: 'forbidden' }), null)
    assert.equal(asErrorBody({ ...body, retry: 'always' }), null)
    assert.equal(asErrorBody('Bad Gateway'), null)
  })

  it('parses stream frames as Event or CursorAdvance, and nothing else', () => {
    const advance = { projectId: P, type: 'cursor.advanced', sequence: '14' }
    assert.deepEqual(parseFrame(event), event)
    assert.equal(isCursorAdvance(parseFrame(advance)), true)
    assert.equal(isCursorAdvance(parseFrame(event)), false)
    assert.match(violation(() => parseFrame({ ...advance, eventId: G })).issues, /additional properties/)
    assert.match(violation(() => parseFrame({ ...event, occurredAt: 'yesterday' })).issues, /date-time/)
    assert.equal(violation(() => parseFrame({ ...event, sequence: undefined })).schema, 'Event')
  })
})
