import { createHash } from 'node:crypto'
import { expect, type Page, type Route } from '@playwright/test'
import type { BuildDestination, BuildExport, RepositoryBinding } from '../src/api/explore-build-handoff.ts'
import { approval, mockApi, v2 } from './api-fixture.ts'
import { prototype } from './preview.ts'

export const target = {
  repositoryId: '918273645',
  repository: 'example-study/fleet-demo',
  defaultBranch: 'main',
  seedCommit: 'a'.repeat(40),
  privateConfirmed: true,
} as const
export const legacyDeploymentReference = 'fixture-release-7'
export const verificationDeploymentReference = 'https://fictional.example.test/releases/7'
export const source = Buffer.from(prototype(v2.number), 'utf8')
const bindingId = '00000000-0000-4000-8000-000000000941'
export const exportId = '00000000-0000-4000-8000-000000000942'
const fileId = '00000000-0000-4000-8000-000000000943'
export const returnId = '00000000-0000-4000-8000-000000000945'
const sourceId = '00000000-0000-4000-8000-000000000944'

function exportFor(binding: RepositoryBinding, revision: number): BuildExport {
  const manifest = {
    acceptanceCriteria: v2.acceptanceCriteria,
    approvalId: approval.id,
    bindingId: binding.id,
    defaultBranch: binding.defaultBranch,
    files: [
      {
        byteCount: source.byteLength,
        id: fileId,
        mime: 'text/html',
        path: 'index.html',
        sha256: v2.entrySha256,
        sourceId,
      },
    ],
    prototypeManifestSha256: v2.manifestSha256,
    recipient: 'Fixture founder',
    repository: binding.repository,
    repositoryId: binding.repositoryId,
    seedCommit: binding.seedCommit,
    transport: 'manual_owner_codex',
    versionId: v2.id,
  } as const
  const sha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  return { id: exportId, revision, sha256, manifest: { ...manifest, files: [...manifest.files] } }
}

interface Fixture {
  state: BuildDestination
  calls: { path: string; key: string; body: unknown }[]
  receipts: Map<string, unknown>
  corrupt: boolean
  corruptManifest: boolean
  holdFile: Promise<void> | null
  unavailable: boolean
  dropBindReply: boolean
  deploymentReference: string
}
const reply = (route: Route, body: unknown) => route.fulfill({ json: body })
const absent = (route: Route) => route.fulfill({ status: 404 })
async function read(route: Route, path: string, fixture: Fixture) {
  if (fixture.unavailable) return absent(route)
  if (path.endsWith('/destination')) return reply(route, fixture.state)
  if (path.endsWith(`/exports/${exportId}/manifest`)) {
    const record = fixture.state.export
    return reply(
      route,
      fixture.corruptManifest && record
        ? { ...record, manifest: { ...record.manifest, recipient: 'Different recipient' } }
        : record,
    )
  }
  if (!path.endsWith(`/exports/${exportId}/files/${fileId}`) || !fixture.state.export) return absent(route)
  if (fixture.holdFile) await fixture.holdFile
  const bytes = Buffer.from(source)
  if (fixture.corrupt) bytes[10] = (bytes[10] ?? 0) ^ 1
  return route.fulfill({ contentType: 'text/plain; charset=utf-8', body: bytes })
}

function writeEvidence(body: unknown, fixture: Fixture) {
  const record = fixture.state.export
  if (!record) throw new Error('A prepared export is required')
  expect(body).toMatchObject({
    expectedRevision: fixture.state.revision,
    exportId: record.id,
    exportSha256: record.sha256,
    repositoryId: target.repositoryId,
  })
  const fields = {
    candidateSha: 'b'.repeat(40),
    pullRequestNumber: 7,
    mergeSha: 'c'.repeat(40),
    deploymentReference: fixture.deploymentReference,
    deployedSha: 'c'.repeat(40),
  }
  expect(body).toMatchObject(fields)
  const item = {
    id: returnId,
    exportId: record.id,
    exportSha256: record.sha256,
    repositoryId: target.repositoryId,
    status: 'reported' as const,
    ...fields,
  }
  fixture.state.returns.push(item)
  fixture.state.revision++
  return item
}

function apply(path: string, body: unknown, fixture: Fixture) {
  const { state } = fixture
  if (path.endsWith('/repository-binding')) {
    expect(body).toEqual({ ...target, expectedRevision: state.revision })
    const saved: RepositoryBinding = { ...target, id: bindingId, revision: ++state.revision, provenance: 'reported' }
    state.binding = saved
    return saved
  }
  if (path.endsWith('/exports')) {
    if (!state.binding) throw new Error('An authorized binding is required')
    expect(body).toEqual({ expectedRevision: state.revision, bindingId })
    state.export = exportFor(state.binding, ++state.revision)
    return state.export
  }
  return writeEvidence(body, fixture)
}

function write(route: Route, path: string, fixture: Fixture) {
  const key = route.request().headers()['idempotency-key'] ?? ''
  expect(key).toBeTruthy()
  const request: unknown = route.request().postDataJSON()
  fixture.calls.push({ path, key, body: request })
  if (fixture.receipts.has(key)) return reply(route, fixture.receipts.get(key))
  const receipt = apply(path, request, fixture)
  fixture.receipts.set(key, receipt)
  if (fixture.dropBindReply && path.endsWith('/repository-binding')) {
    fixture.dropBindReply = false
    return route.abort()
  }
  return reply(route, receipt)
}

export async function mockBuild(page: Page, unavailable = false, deploymentReference = legacyDeploymentReference) {
  await mockApi(page, { existingVersions: true, approvedVersion: true })
  const fixture: Fixture = {
    state: { revision: 1, binding: null, export: null, returns: [], verification: undefined },
    calls: [],
    receipts: new Map(),
    corrupt: false,
    corruptManifest: false,
    holdFile: null,
    unavailable,
    dropBindReply: true,
    deploymentReference,
  }
  await page.route(
    (url) => url.pathname.includes(`/handoff/${approval.id}/`),
    (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      expect(request.headers()['authorization']).toBe('Bearer synthetic-founder')
      return request.method() === 'GET' ? read(route, path, fixture) : write(route, path, fixture)
    },
  )
  return fixture
}
