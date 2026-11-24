import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import type { ManagedExploreRetentionCallback } from './managed-explore-dispatch.ts'
import {
  managedExploreRetention,
  parseManagedExploreDirections,
  validManagedExploreEntry,
} from './managed-explore-output.ts'
import { ManagedExploreProviderError, type ManagedExplorePrototype } from './managed-explore-provider.ts'

const CARD = {
  label: 'Shore assigns',
  firstActor: 'shore',
  nextStep: 'Assign a berth',
  rationale: 'One queue',
  tradeoff: 'Shore starts',
  steps: [
    { id: 'assign', label: 'Assign', lane: 'shore' },
    { id: 'confirm', label: 'Confirm', lane: 'vessel' },
  ],
  edges: [{ from: 'assign', to: 'confirm' }],
}
const OTHER = { ...CARD, label: 'Vessel requests', firstActor: 'vessel', nextStep: 'Request a berth' }
const NOTES = {
  changeSummary: 'Add a berth queue',
  acceptanceCriteria: ['Confirm from the queue'],
  mockReplacements: ['Replace fictional vessels'],
  limitations: [],
}
const LOCAL =
  '<!doctype html>\r\n<html><head><style>button{color:red}</style></head><body><button id="go">Confirm</button><script>document.querySelector("button").onclick=()=>{document.body.dataset.confirmed="yes"}</script></body></html>\r\n'
const IDENTITY = { projectId: 'fixture_project', turnId: 'local_turn', leaseToken: 'fixture_lease' }
const ROOT = {
  id: 'fixture_root',
  sessionId: 'fixture_session',
  status: 'completed',
  createdAt: 1,
  startedAt: 2,
  completedAt: 3,
  usage: null,
  failure: null,
} as const
const REFERENCE = {
  root: ROOT,
  event: {
    providerSessionId: ROOT.sessionId,
    submissionId: 'fixture_submission',
    payloadSha256: 'a'.repeat(64),
    previousRootId: null,
  },
  environmentId: 'fixture_environment',
  outputRequestId: 'req_artifact',
  rootRequestId: 'req_root',
}

function artifact(bytes = Buffer.from(LOCAL)): ManagedExplorePrototype {
  return {
    artifactId: 'fixture_artifact',
    sessionId: ROOT.sessionId,
    environmentId: REFERENCE.environmentId,
    turnId: ROOT.id,
    path: '/workspace/outputs/index.html',
    mimeType: 'text/html; charset=utf-8',
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  }
}

const fixture = (second: unknown = OTHER) => JSON.stringify({ directions: [CARD, second] })

test('directions are an atomic, exact, bounded pair with locally drawable graphs', () => {
  assert.deepEqual(parseManagedExploreDirections(fixture()), [CARD, OTHER])
  for (const input of [
    JSON.stringify({ directions: [CARD] }),
    JSON.stringify({ directions: [CARD, OTHER, OTHER] }),
    `\`\`\`json\n${fixture()}\n\`\`\``,
    fixture({ ...OTHER, id: 'provider_chosen_id' }),
    fixture({ ...OTHER, label: CARD.label.toUpperCase() }),
    fixture({ ...OTHER, firstActor: 'SHORE', nextStep: 'ASSIGN A BERTH' }),
    fixture({ ...OTHER, steps: [CARD.steps[0], CARD.steps[0]] }),
    fixture({ ...OTHER, edges: [{ from: 'assign', to: 'assign' }] }),
    fixture({ ...OTHER, edges: [{ from: 'assign', to: 'outside' }] }),
    fixture({ ...OTHER, edges: [CARD.edges[0], CARD.edges[0]] }),
    fixture({ ...OTHER, tradeoff: 'é'.repeat(501) }),
  ])
    assert.equal(parseManagedExploreDirections(input), null)
})

test('entry validation holds exact bytes and rejects nonlocal, invalid UTF-8, oversized and mismatched output', () => {
  assert.equal(validManagedExploreEntry(artifact()), true)
  for (const input of [
    { ...artifact(), sha256: 'a'.repeat(64) },
    { ...artifact(), byteLength: 1 },
    artifact(Buffer.from('<img src="https://example.invalid/image.png">')),
    artifact(Buffer.from('<a href="&#104;ttps://example.invalid">link</a>')),
    artifact(Buffer.from('<style>@import "https://example.invalid/stylesheet";</style>')),
    artifact(Buffer.concat([Buffer.from(LOCAL), Buffer.from([0xc0, 0xaf])])),
    artifact(Buffer.concat([Buffer.from(LOCAL), Buffer.from([0])])),
    artifact(Buffer.alloc(2 * 1024 * 1024 + 1)),
  ])
    assert.equal(validManagedExploreEntry(input), false)
})

test('prototype retention verifies the exact saved root metadata and preserves raw CRLF bytes', async () => {
  const writes: Parameters<Parameters<typeof managedExploreRetention>[0]['write']>[] = []
  const metadataReads: string[][] = []
  let text: string | null = JSON.stringify(NOTES)
  let readError: ManagedExploreProviderError | undefined
  const retain = managedExploreRetention({
    readTurnText: (sessionId, rootId) => {
      metadataReads.push([sessionId, rootId])
      if (readError) return Promise.reject(readError)
      return Promise.resolve({ value: text })
    },
    write: (...args) => {
      writes.push(args)
      return Promise.resolve()
    },
  })
  const output = {
    kind: 'revision',
    ...REFERENCE,
    artifact: artifact(),
  } satisfies Parameters<ManagedExploreRetentionCallback>[1]
  assert.equal(await retain(IDENTITY, { ...output, artifact: { ...output.artifact, turnId: 'stale_turn' } }), 'invalid')
  assert.equal(metadataReads.length, 0)
  assert.equal(await retain(IDENTITY, output), 'settled')
  assert.deepEqual(metadataReads, [[ROOT.sessionId, ROOT.id]])
  assert.deepEqual(writes, [
    [
      IDENTITY,
      {
        kind: 'prototype',
        ...REFERENCE.event,
        ...NOTES,
        rootId: ROOT.id,
        environmentId: REFERENCE.environmentId,
        artifactId: output.artifact.artifactId,
        artifactRequestId: REFERENCE.outputRequestId,
        path: output.artifact.path,
        byteLength: output.artifact.byteLength,
        sha256: output.artifact.sha256,
        bytes: Buffer.from(LOCAL),
      },
    ],
  ])
  text = JSON.stringify({ ...NOTES, approval: true })
  assert.equal(await retain(IDENTITY, output), 'invalid')
  text = JSON.stringify({ ...NOTES, limitations: undefined })
  assert.equal(await retain(IDENTITY, output), 'invalid')
  text = null
  assert.equal(await retain(IDENTITY, output), 'missing')
  readError = new ManagedExploreProviderError('transient', 'retry_read')
  assert.equal(await retain(IDENTITY, output), 'pending')
  readError = new ManagedExploreProviderError('invalid_response', 'terminal')
  assert.equal(await retain(IDENTITY, output), 'invalid')
  readError = new ManagedExploreProviderError('page_limit', 'retry_read')
  assert.equal(await retain(IDENTITY, output), 'history_limit')
  assert.equal(writes.length, 1)
})
