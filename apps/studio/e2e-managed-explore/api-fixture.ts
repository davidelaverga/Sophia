import { createHash } from 'node:crypto'
import { expect, type Page, type Route } from '@playwright/test'
import { mission, membership, PROJECT, snapshot } from '../fixtures/data.ts'
import { goalNote } from '../fixtures/brief-data.ts'
import { prototype } from './preview.ts'
import type { ExploreApproval, ExploreDirection, ExploreSession, ExploreVersion } from '../src/api/managed-explore.ts'

export const brief = 'Review a weekly energy exception. Compare a shore-first assignment with a vessel-first response.'
export const feedback = 'Require the chief engineer to give a non-blank explanation before shore can assign follow-up.'
const seedHash = 'a'.repeat(64)
const note = {
  ...goalNote(1, PROJECT, { kind: 'expectation', hours: 1, text: brief, sophia: true }),
  actorId: membership.actorId,
  ledgerRevision: 3,
  sha256: seedHash,
}
export const projectRoute = `/p/${PROJECT}/studio`
const explore = `/api/v1/projects/${PROJECT}/explore`
const session = '00000000-0000-4000-8000-000000000901'
const seed = { entryId: note.id, revision: note.ledgerRevision, text: brief, sha256: seedHash }
const funding: ExploreSession['funding'] = { routeId: 'synthetic-funded-project', label: 'OpenAI API credits' }

export const shore: ExploreDirection = {
  id: '00000000-0000-4000-8000-000000000911',
  revision: 1,
  label: 'Shore assigns first',
  firstActor: 'Shore coordinator',
  nextStep: 'Assign follow-up immediately',
  rationale: 'The shore queue starts as soon as the exception arrives.',
  tradeoff: 'Some work starts before the vessel can explain.',
  steps: [
    { id: 'assign', label: 'Assign follow-up', lane: 'shore' },
    { id: 'review', label: 'Review exception', lane: 'vessel' },
  ],
  edges: [{ from: 'assign', to: 'review' }],
}
export const vessel: ExploreDirection = {
  id: '00000000-0000-4000-8000-000000000912',
  revision: 1,
  label: 'Vessel responds first',
  firstActor: 'Vessel engineer',
  nextStep: 'Acknowledge the exception',
  rationale: 'An acknowledgement opens the shore queue.',
  tradeoff: 'Shore waits for a vessel response.',
  steps: [
    { id: 'respond', label: 'Acknowledge', lane: 'vessel' },
    { id: 'queue', label: 'Open shore queue', lane: 'shore' },
    { id: 'assign', label: 'Assign follow-up', lane: 'shore' },
  ],
  edges: [
    { from: 'respond', to: 'queue' },
    { from: 'queue', to: 'assign' },
  ],
}
const entryHash = (version: number) => createHash('sha256').update(prototype(version)).digest('hex')
const v1: ExploreVersion = {
  id: '00000000-0000-4000-8000-000000000921',
  number: 1,
  parentVersionId: null,
  directionId: vessel.id,
  entrySha256: entryHash(1),
  manifestSha256: 'c'.repeat(64),
  changeSummary: 'Vessel acknowledgement unlocks shore assignment.',
  acceptanceCriteria: ['Shore waits for acknowledgement.'],
  mockReplacements: ['Replace the demo vessel record with the weekly exceptions feed.'],
}
const v2: ExploreVersion = {
  ...v1,
  id: '00000000-0000-4000-8000-000000000922',
  number: 2,
  parentVersionId: v1.id,
  entrySha256: entryHash(2),
  manifestSha256: 'e'.repeat(64),
  changeSummary: 'A non-blank chief engineer explanation unlocks shore assignment.',
  acceptanceCriteria: ['Whitespace cannot unlock shore assignment.'],
}
const approval: ExploreApproval = {
  id: '00000000-0000-4000-8000-000000000931',
  versionId: v2.id,
  manifestSha256: v2.manifestSha256,
  approvedAt: '2026-11-22T19:00:00Z',
  acceptanceCriteria: v2.acceptanceCriteria,
}

type Write = { path: string; key: string; request: Record<string, unknown> }
interface Fixture {
  calls: { writes: Write[]; preflights: number; rejectPermits: boolean }
  data: ExploreSession
  options: { ineligible?: boolean; uncertain?: boolean }
  started: boolean
  lostTextResponse: boolean
}

const json = (route: Route, body: unknown) => route.fulfill({ json: body })
const notFound = (route: Route) => route.fulfill({ status: 404 })
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function roomRead(route: Route, path: string) {
  if (path.endsWith('/membership')) return json(route, membership)
  if (path.endsWith('/snapshot')) return json(route, snapshot(3, false))
  if (path.endsWith('/mission')) return json(route, mission(3, [note]))
  if (path.endsWith('/me/profile')) return json(route, { displayName: 'Founder', chosen: true, revision: 1 })
  if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' })
  return notFound(route)
}

function exploreRead(route: Route, url: URL, fixture: Fixture) {
  if (url.pathname.endsWith('/preflight')) {
    fixture.calls.preflights++
    expect(url.searchParams.get('seedEntryId')).toBe(note.id)
    expect(url.searchParams.get('expectedSeedRevision')).toBe(String(seed.revision))
    return fixture.options.ineligible
      ? notFound(route)
      : json(route, { seed, funding, sessionId: fixture.started ? session : null })
  }
  if (url.pathname.endsWith(`/handoff/${approval.id}`))
    return json(route, {
      approvalId: approval.id,
      versionId: approval.versionId,
      manifestSha256: approval.manifestSha256,
      seedText: brief,
      acceptanceCriteria: approval.acceptanceCriteria,
      mockReplacements: v2.mockReplacements,
      limitations: [],
      files: [
        {
          path: 'index.html',
          mime: 'text/html',
          byteCount: Buffer.byteLength(prototype(v2.number)),
          sha256: v2.entrySha256,
        },
      ],
    })
  return json(route, fixture.data)
}

function previewPermit({ path, request }: Write, reject: boolean) {
  const version = path.includes(v2.id) ? v2 : v1
  expect(request).toEqual({ entrySha256: version.entrySha256, manifestSha256: version.manifestSha256 })
  return {
    url: `http://localhost:5277/v1/previews/synthetic-v${String(version.number)}/index.html`,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    versionId: version.id,
    entrySha256: reject ? 'f'.repeat(64) : version.entrySha256,
    manifestSha256: version.manifestSha256,
  }
}

function turnAccepted(route: Route, fixture: Fixture, payload: Write['request']) {
  const { data, options } = fixture
  const { kind, instruction } = payload
  const turnId = `00000000-0000-4000-8000-${String(data.revision).padStart(12, '9')}`
  let resultVersionId: string | null = null
  if (typeof instruction !== 'string') throw new Error('Studio sent a turn without an instruction')
  switch (kind) {
    case 'text':
      break
    case 'directions':
      data.directions = [shore, vessel]
      break
    case 'prototype':
      expect(payload['directionId']).toBe(vessel.id)
      data.versions.push(v1)
      resultVersionId = v1.id
      break
    case 'revision':
      expect(payload['parentVersionId']).toBe(v1.id)
      expect(instruction).toBe(feedback)
      data.versions.push(v2)
      resultVersionId = v2.id
      break
    default:
      throw new Error('Studio submitted an unexpected kind of turn')
  }
  data.turns.push({
    id: turnId,
    kind,
    status: 'completed',
    instruction,
    reply: kind === 'text' ? 'I’ll keep the weekly exception at the center.' : null,
    resultVersionId,
    error: null,
  })
  if (options.uncertain && kind === 'text' && !fixture.lostTextResponse) {
    fixture.lostTextResponse = true
    return route.abort()
  }
  return json(route, { turnId })
}

function decide(route: Route, fixture: Fixture, write: Write) {
  const { data } = fixture
  const { path, request } = write
  if (path.endsWith('/direction-selection')) {
    expect(request).toEqual({
      directionId: vessel.id,
      expectedDirectionRevision: vessel.revision,
      expectedSessionRevision: data.revision - 1,
    })
    data.selectedDirectionId = vessel.id
    return json(route, { revision: data.revision })
  }
  if (path.endsWith('/approvals')) {
    expect(request).toEqual({
      prototypeVersionId: v2.id,
      expectedManifestDigest: v2.manifestSha256,
      expectedSessionRevision: data.revision - 1,
      acceptanceCriteria: v2.acceptanceCriteria,
    })
    data.approvals.push(approval)
    return json(route, approval)
  }
  expect(path.endsWith('/turns')).toBe(true)
  return turnAccepted(route, fixture, request)
}

function exploreWrite(route: Route, path: string, fixture: Fixture) {
  const request: unknown = route.request().postDataJSON()
  if (!isRecord(request)) throw new Error('A Studio write must carry a JSON object')
  const key = route.request().headers()['idempotency-key'] ?? ''
  expect(key).toBeTruthy()
  const write = { path, key, request }
  const replay = fixture.calls.writes.some((call) => call.key === key)
  fixture.calls.writes.push(write)
  if (path.endsWith('/sessions')) {
    expect(request).toEqual({
      seedEntryId: seed.entryId,
      expectedSeedRevision: seed.revision,
      routeId: funding.routeId,
    })
    fixture.started = true
    return json(route, { sessionId: session })
  }
  if (path.endsWith('/preview-permits')) return json(route, previewPermit(write, fixture.calls.rejectPermits))
  if (path.endsWith('/turns') && replay) return json(route, { turnId: fixture.data.turns.at(-1)?.id })
  expect(request['expectedSessionRevision']).toBe(fixture.data.revision)
  fixture.data.revision++
  return decide(route, fixture, write)
}

export async function mockApi(page: Page, options: Fixture['options'] = {}) {
  const fixture: Fixture = {
    calls: { writes: [], preflights: 0, rejectPermits: false },
    data: {
      id: session,
      revision: 1,
      seed,
      funding,
      turns: [],
      directions: [],
      selectedDirectionId: null,
      versions: [],
      approvals: [],
    },
    options,
    started: false,
    lostTextResponse: false,
  }
  await page.addInitScript(() => sessionStorage.setItem('sophia.dev.identity', 'Founder'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (!url.pathname.startsWith(explore)) return roomRead(route, url.pathname)
      expect(request.headers()['authorization']).toBe('Bearer synthetic-founder')
      return request.method() === 'GET' ? exploreRead(route, url, fixture) : exploreWrite(route, url.pathname, fixture)
    },
  )
  return fixture.calls
}
