import { apiUrl } from './base.ts'
import { ApiError, callApi } from './client.ts'
import type { ExploreScope } from './managed-explore.ts'
import { apiFetch } from './renew.ts'
import { READ_TIMEOUT_MS } from './timeouts.ts'
import { checkedBlob, sha256Hex, utf8 } from '../features/artifacts/download.ts'

export const repositoryPattern = /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/iu
export const gitShaPattern = /^[\da-f]{40}(?:[\da-f]{24})?$/u
const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u
const digestPattern = /^[\da-f]{64}$/u
const repositoryIdPattern = /^\d{1,30}$/u
const MAX_HTML_BYTES = 2_097_152

function invalid(): Error {
  return new Error('The Build handoff data could not be verified.')
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid()
  return Reflect.get(value, key)
}
function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) throw invalid()
  return value
}
const property = (value: unknown, key: string, pattern?: RegExp) => string(field(value, key), pattern)
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw invalid()
  return value
}
function list<T>(value: unknown, read: (input: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalid()
  return value.map((input: unknown) => read(input))
}
const nullable = <T>(value: unknown, read: (input: unknown) => T): T | null => (value === null ? null : read(value))
function literal<const T extends string | true>(value: unknown, expected: T): T {
  if (value !== expected) throw invalid()
  return expected
}

const target = (value: unknown) => ({
  repositoryId: property(value, 'repositoryId', repositoryIdPattern),
  repository: property(value, 'repository', repositoryPattern),
  defaultBranch: property(value, 'defaultBranch'),
  seedCommit: property(value, 'seedCommit', gitShaPattern),
})
const bindingInput = (value: unknown) => ({
  ...target(value),
  expectedRevision: positive(field(value, 'expectedRevision')),
  privateConfirmed: literal(field(value, 'privateConfirmed'), true),
})
function parseBinding(value: unknown) {
  const provenance = field(value, 'provenance')
  if (provenance !== 'reported' && provenance !== 'independently_checked') throw invalid()
  return {
    ...target(value),
    id: property(value, 'id', uuidPattern),
    revision: positive(field(value, 'revision')),
    privateConfirmed: literal(field(value, 'privateConfirmed'), true),
    provenance,
  }
}
function exactFile(value: unknown) {
  const byteCount = positive(field(value, 'byteCount'))
  if (byteCount > MAX_HTML_BYTES) throw invalid()
  return {
    byteCount,
    id: property(value, 'id', uuidPattern),
    mime: literal(field(value, 'mime'), 'text/html'),
    path: literal(field(value, 'path'), 'index.html'),
    sha256: property(value, 'sha256', digestPattern),
    sourceId: property(value, 'sourceId', uuidPattern),
  }
}

// A68 canonical keys are in lexical order here and in exactFile. Its single file and criteria keep their original order.
function parseManifest(value: unknown) {
  const files = list(field(value, 'files'), exactFile)
  if (files.length !== 1) throw invalid()
  return {
    acceptanceCriteria: list(field(value, 'acceptanceCriteria'), (item) => string(item)),
    approvalId: property(value, 'approvalId', uuidPattern),
    bindingId: property(value, 'bindingId', uuidPattern),
    defaultBranch: property(value, 'defaultBranch'),
    files,
    prototypeManifestSha256: property(value, 'prototypeManifestSha256', digestPattern),
    recipient: property(value, 'recipient'),
    repository: property(value, 'repository', repositoryPattern),
    repositoryId: property(value, 'repositoryId', repositoryIdPattern),
    seedCommit: property(value, 'seedCommit', gitShaPattern),
    transport: literal(field(value, 'transport'), 'manual_owner_codex'),
    versionId: property(value, 'versionId', uuidPattern),
  }
}
const prepared = (value: unknown) => ({
  id: property(value, 'id', uuidPattern),
  revision: positive(field(value, 'revision')),
  sha256: property(value, 'sha256', digestPattern),
  manifest: parseManifest(field(value, 'manifest')),
})
const optional = <T>(value: unknown, read: (input: unknown) => T) => (value === undefined ? undefined : read(value))
const gitSha = (value: unknown) => string(value, gitShaPattern)
const evidence = (value: unknown) => ({
  candidateSha: optional(field(value, 'candidateSha'), gitSha),
  pullRequestNumber: optional(field(value, 'pullRequestNumber'), positive),
  mergeSha: optional(field(value, 'mergeSha'), gitSha),
  deploymentReference: optional(field(value, 'deploymentReference'), string),
  deployedSha: optional(field(value, 'deployedSha'), gitSha),
})
const returnIdentity = (value: unknown) => ({
  exportId: property(value, 'exportId', uuidPattern),
  exportSha256: property(value, 'exportSha256', digestPattern),
  repositoryId: property(value, 'repositoryId', repositoryIdPattern),
})
const reported = (value: unknown) => ({
  ...returnIdentity(value),
  ...evidence(value),
  id: property(value, 'id', uuidPattern),
  status: literal(field(value, 'status'), 'reported'),
})
const destination = (value: unknown) => ({
  revision: positive(field(value, 'revision')),
  binding: nullable(field(value, 'binding'), parseBinding),
  export: nullable(field(value, 'export'), prepared),
  returns: list(field(value, 'returns'), reported),
})
const prepareInput = (value: unknown) => ({
  expectedRevision: positive(field(value, 'expectedRevision')),
  bindingId: property(value, 'bindingId', uuidPattern),
})
const returnInput = (value: unknown) => ({
  ...returnIdentity(value),
  ...evidence(value),
  expectedRevision: positive(field(value, 'expectedRevision')),
})

export type RepositoryBinding = ReturnType<typeof parseBinding>
export type BuildExport = ReturnType<typeof prepared>
export type BuildDestination = ReturnType<typeof destination>
export type BuildEvidence = ReturnType<typeof evidence>
export type BuildAction =
  | { kind: 'repository-binding'; body: ReturnType<typeof bindingInput> }
  | { kind: 'exports'; body: ReturnType<typeof prepareInput> }
  | { kind: 'returns'; body: ReturnType<typeof returnInput> }

export function parseBuildAction(value: unknown): BuildAction {
  const kind = field(value, 'kind')
  const body = field(value, 'body')
  switch (kind) {
    case 'repository-binding':
      return { kind, body: bindingInput(body) }
    case 'exports':
      return { kind, body: prepareInput(body) }
    case 'returns':
      return { kind, body: returnInput(body) }
    default:
      throw invalid()
  }
}

export interface BuildScope extends ExploreScope {
  sessionId: string
  approvalId: string
}
const esc = encodeURIComponent
const base = ({ projectId, sessionId, approvalId }: BuildScope) =>
  `/api/v1/projects/${esc(projectId)}/explore/sessions/${esc(sessionId)}/handoff/${esc(approvalId)}` as const
const exportPath = (scope: BuildScope, exportId: string) => `${base(scope)}/exports/${esc(exportId)}` as const

export const getBuildDestination = (scope: BuildScope, signal: AbortSignal) =>
  callApi(`${base(scope)}/destination`, { token: scope.token, method: 'GET', memberRead: true, signal }, destination)

export async function sendBuildAction(scope: BuildScope, action: BuildAction, key: string, signal: AbortSignal) {
  const path = `${base(scope)}/${action.kind}` as const
  const init = { token: scope.token, body: action.body, key, signal }
  switch (action.kind) {
    case 'repository-binding':
      return callApi(path, init, parseBinding)
    case 'exports':
      return callApi(path, init, prepared)
    case 'returns':
      return callApi(path, init, reported)
    default:
      throw invalid()
  }
}

interface PinnedExport {
  binding: RepositoryBinding
  record: BuildExport
  versionId: string
  prototypeManifestSha256: string
  acceptanceCriteria: readonly string[]
  entrySha256: string
  entryByteCount: number
}

function matchesDestination(manifest: BuildExport['manifest'], binding: RepositoryBinding) {
  return (
    manifest.bindingId === binding.id &&
    manifest.repositoryId === binding.repositoryId &&
    manifest.repository === binding.repository &&
    manifest.defaultBranch === binding.defaultBranch &&
    manifest.seedCommit === binding.seedCommit
  )
}

export async function getVerifiedBuildManifest(scope: BuildScope, expected: PinnedExport, signal: AbortSignal) {
  const read = await callApi(
    `${exportPath(scope, expected.record.id)}/manifest`,
    { token: scope.token, method: 'GET', memberRead: true, signal },
    prepared,
  )
  const { manifest } = read
  const file = manifest.files[0]
  if (
    read.id !== expected.record.id ||
    read.sha256 !== expected.record.sha256 ||
    manifest.approvalId !== scope.approvalId ||
    manifest.versionId !== expected.versionId ||
    manifest.prototypeManifestSha256 !== expected.prototypeManifestSha256 ||
    !matchesDestination(manifest, expected.binding) ||
    JSON.stringify(manifest.acceptanceCriteria) !== JSON.stringify(expected.acceptanceCriteria) ||
    !file ||
    file.sha256 !== expected.entrySha256 ||
    file.byteCount !== expected.entryByteCount
  )
    throw invalid()
  if ((await sha256Hex(utf8(JSON.stringify(manifest)))) !== read.sha256) throw invalid()
  signal.throwIfAborted()
  return { ...read, file }
}

async function exactBytes(response: Response, expectedLength: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader()
  if (!reader) throw invalid()
  const bytes = new Uint8Array(expectedLength)
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (size + chunk.value.byteLength > expectedLength) throw invalid()
      bytes.set(chunk.value, size)
      size += chunk.value.byteLength
    }
    if (size !== expectedLength) throw invalid()
    return bytes
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Reauthorize at the API and check the decoded transport octets. Never navigate to a server-provided URL. */
export async function getVerifiedBuildBlob(
  scope: BuildScope,
  record: Awaited<ReturnType<typeof getVerifiedBuildManifest>>,
  signal: AbortSignal,
): Promise<Blob> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, READ_TIMEOUT_MS)
  const { file } = record
  try {
    const response = await apiFetch(apiUrl(`${exportPath(scope, record.id)}/files/${esc(file.id)}`), {
      headers: { authorization: `Bearer ${scope.token}` },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    })
    if (
      response.status !== 200 ||
      !/^text\/plain\s*;\s*charset=utf-8$/iu.test(response.headers.get('content-type') ?? '')
    ) {
      void response.body?.cancel().catch(() => undefined)
      throw new ApiError(
        response.status,
        'build_source_unavailable',
        'The approved source could not be read.',
        'safe_read',
      )
    }
    const bytes = await exactBytes(response, file.byteCount)
    const blob = await checkedBlob(bytes, file.sha256, 'text/plain;charset=utf-8')
    controller.signal.throwIfAborted()
    return blob
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
