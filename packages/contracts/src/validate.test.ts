import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  asErrorBody,
  ContractViolation,
  isCursorAdvance,
  parseFrame,
  parseMediaAssignmentBatch,
  parseNativeTaskDetail,
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
  room: {
    id: G,
    revision: 1,
    inputActorId: null,
    mode: 'invoked',
    sophia: {
      exchangeId: null,
      exchange: 'none',
      pauseReason: null,
      voice: 'not_connected',
      inputActorId: null,
      inputEpoch: null,
      playbackEpoch: null,
      observationEpoch: null,
      allowVision: false,
      looking: null,
      reason: null,
      reportedAt: null,
    },
  },
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

  it('reads research work and Markdown reports, and an unknown task kind only where readers tolerate it (A11)', () => {
    const sha = 'a'.repeat(64)
    const task = {
      id: G,
      kind: 'research',
      goalId: G,
      attemptId: G,
      commandId: G,
      actorId: G,
      state: 'succeeded',
      phase: 'result_ready',
      createdAt: '2026-10-01T09:00:00.000Z',
      contextSourceId: G,
      inputSourceIds: [],
      resultSourceId: G,
      reason: null,
      artifactId: P,
    }
    const report = {
      id: G,
      artifactId: P,
      projectId: P,
      parentId: null,
      sourceId: G,
      sourceHash: sha,
      state: 'stable',
      previewId: null,
      format: 'markdown',
      exportEditability: 'source_editable',
      title: 'Sandboxed PDF rendering on managed hosts',
      versionNumber: 2,
      createdAt: '2026-10-01T09:20:00.000Z',
      renditions: [
        { format: 'pdf', sourceId: G, sha256: sha, byteLength: 1024, mime: 'application/pdf', pageCount: 4 },
      ],
    }
    const withWork = { ...snapshot, work: [task], artifacts: [report] }
    assert.deepEqual(parseSnapshot(withWork), withWork)
    assert.match(
      violation(() => parseSnapshot({ ...withWork, work: [{ ...task, kind: 'slide_deck' }] })).issues,
      /kind/,
    )

    const output = { artifactVersionId: G, format: 'pdf', sourceId: G, sha256: sha, byteLength: 1024, limitations: [] }
    const detail = {
      task,
      instruction: 'Compare the hosts.',
      result: {
        sourceId: G,
        sha256: sha,
        markdown: '# Report',
        provider: 'openai',
        model: 'gpt-6.1-sol',
        inputTokens: 1200,
        outputTokens: 300,
        capturedAt: '2026-10-01T09:20:00.000Z',
        cacheReadTokens: 900,
        outputs: [output],
      },
    }
    assert.deepEqual(parseNativeTaskDetail(detail), detail)

    const assignment = {
      exchangeId: G,
      projectId: P,
      roomId: G,
      state: 'open',
      pauseReason: null,
      inputEpoch: 1,
      inputActorId: null,
      playbackEpoch: 1,
      observationEpoch: 1,
      allowVision: false,
      looking: null,
      roomRevision: 1,
      quiesceRequestId: null,
      roomToken: null,
      results: [
        { taskId: G, resultRevision: 1, kind: 'research' },
        { taskId: P, resultRevision: 1, kind: 'slide_deck' },
      ],
      missionRevision: 1,
      ledgerRevision: 1,
      eligibilityRevision: 1,
    }
    const batch = { assignments: [assignment], version: sha }
    assert.deepEqual(parseMediaAssignmentBatch(batch), batch, 'an unknown kind never fails the batch')
    const odd = { ...assignment, results: [{ taskId: G, resultRevision: 1, kind: 'Not A Kind' }] }
    assert.match(violation(() => parseMediaAssignmentBatch({ ...batch, assignments: [odd] })).issues, /kind/)
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
