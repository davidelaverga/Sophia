import { callApi } from './client.ts'
import { isDateTime } from './shape.ts'

const invalid = () => new Error('Invalid Explore response')
const field = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid()
  return Reflect.get(value, key)
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw invalid()
  return value
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw invalid()
  return value
}
function digest(value: unknown): string {
  const hash = text(value)
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw invalid()
  return hash
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalid()
  return value.map(parse)
}
function choice<const T extends string>(value: unknown, allowed: readonly T[]): T {
  const selected = allowed.find((candidate) => candidate === value)
  if (selected === undefined) throw invalid()
  return selected
}
const nullableText = (value: unknown) => (value === null ? null : text(value))
const kind = (value: unknown) => choice(value, ['text', 'directions', 'prototype', 'revision'])

const parseSeed = (value: unknown) => ({
  entryId: text(field(value, 'entryId')),
  revision: integer(field(value, 'revision')),
  text: text(field(value, 'text')),
  sha256: digest(field(value, 'sha256')),
})
export interface ExploreAccountSnapshot {
  balanceCents: number | null
  currency: 'USD'
  autoRechargeEnabled: boolean | null
  observedAt: string
}

function accountSnapshot(value: unknown): ExploreAccountSnapshot | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const observedAt = field(value, 'observedAt')
  const currency = field(value, 'currency')
  if (typeof observedAt !== 'string' || !isDateTime(observedAt) || currency !== 'USD') return undefined
  const balance = field(value, 'balanceCents')
  const autoRecharge = field(value, 'autoRechargeEnabled')
  return {
    observedAt,
    currency,
    balanceCents: typeof balance === 'number' && Number.isSafeInteger(balance) ? balance : null,
    autoRechargeEnabled: typeof autoRecharge === 'boolean' ? autoRecharge : null,
  }
}

function parseFunding(value: unknown) {
  const snapshot = accountSnapshot(field(value, 'accountSnapshot'))
  return {
    routeId: text(field(value, 'routeId')),
    label: choice(field(value, 'label'), ['OpenAI API credits']),
    ...(snapshot ? { accountSnapshot: snapshot } : {}),
  }
}

export type ExploreFunding = ReturnType<typeof parseFunding>

const parsePreflight = (value: unknown) => ({
  seed: parseSeed(field(value, 'seed')),
  funding: parseFunding(field(value, 'funding')),
  sessionId: nullableText(field(value, 'sessionId')),
})
const parseTurn = (value: unknown) => ({
  id: text(field(value, 'id')),
  kind: kind(field(value, 'kind')),
  status: choice(field(value, 'status'), [
    'queued',
    'running',
    'retaining',
    'completed',
    'failed',
    'cancelled',
    'outcome_unknown',
  ]),
  instruction: text(field(value, 'instruction')),
  reply: nullableText(field(value, 'reply')),
  resultVersionId: nullableText(field(value, 'resultVersionId')),
  error: nullableText(field(value, 'error')),
})
const parseStep = (value: unknown) => ({
  id: text(field(value, 'id')),
  label: text(field(value, 'label')),
  lane: choice(field(value, 'lane'), ['vessel', 'shore']),
})
const parseEdge = (value: unknown) => ({ from: text(field(value, 'from')), to: text(field(value, 'to')) })
function parseDirection(value: unknown) {
  const steps = list(field(value, 'steps'), parseStep)
  const edges = list(field(value, 'edges'), parseEdge)
  const ids = new Set(steps.map((step) => step.id))
  if (steps.length < 2 || steps.length > 6 || ids.size !== steps.length || edges.length > 8) throw invalid()
  if (edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) throw invalid()
  return {
    id: text(field(value, 'id')),
    revision: integer(field(value, 'revision')),
    label: text(field(value, 'label')),
    firstActor: text(field(value, 'firstActor')),
    nextStep: text(field(value, 'nextStep')),
    rationale: text(field(value, 'rationale')),
    tradeoff: text(field(value, 'tradeoff')),
    steps,
    edges,
  }
}
const parseVersion = (value: unknown) => ({
  id: text(field(value, 'id')),
  number: integer(field(value, 'number')),
  parentVersionId: nullableText(field(value, 'parentVersionId')),
  directionId: text(field(value, 'directionId')),
  entrySha256: digest(field(value, 'entrySha256')),
  manifestSha256: digest(field(value, 'manifestSha256')),
  changeSummary: text(field(value, 'changeSummary')),
  acceptanceCriteria: list(field(value, 'acceptanceCriteria'), text),
  mockReplacements: list(field(value, 'mockReplacements'), text),
})
const parseApproval = (value: unknown) => ({
  id: text(field(value, 'id')),
  versionId: text(field(value, 'versionId')),
  manifestSha256: digest(field(value, 'manifestSha256')),
  approvedAt: text(field(value, 'approvedAt')),
  acceptanceCriteria: list(field(value, 'acceptanceCriteria'), text),
})
function parseSession(value: unknown) {
  const directions = list(field(value, 'directions'), parseDirection)
  if (directions.length !== 0 && (directions.length !== 2 || directions[0]?.id === directions[1]?.id)) throw invalid()
  return {
    id: text(field(value, 'id')),
    revision: integer(field(value, 'revision')),
    seed: parseSeed(field(value, 'seed')),
    funding: parseFunding(field(value, 'funding')),
    turns: list(field(value, 'turns'), parseTurn),
    directions,
    selectedDirectionId: nullableText(field(value, 'selectedDirectionId')),
    versions: list(field(value, 'versions'), parseVersion),
    approvals: list(field(value, 'approvals'), parseApproval),
  }
}
const parsePermit = (value: unknown) => ({
  url: text(field(value, 'url')),
  expiresAt: text(field(value, 'expiresAt')),
  versionId: text(field(value, 'versionId')),
  manifestSha256: digest(field(value, 'manifestSha256')),
  entrySha256: digest(field(value, 'entrySha256')),
})
const readStart = (value: unknown) => ({ sessionId: text(field(value, 'sessionId')) })
const readTurn = (value: unknown) => ({ turnId: text(field(value, 'turnId')) })
const readRevision = (value: unknown) => ({ revision: integer(field(value, 'revision')) })

export const parseExploreStart = (value: unknown) => ({
  seedEntryId: text(field(value, 'seedEntryId')),
  expectedSeedRevision: integer(field(value, 'expectedSeedRevision')),
  routeId: text(field(value, 'routeId')),
})
const parseExploreTurn = (value: unknown) => {
  const directionId = field(value, 'directionId')
  const parentVersionId = field(value, 'parentVersionId')
  return {
    kind: kind(field(value, 'kind')),
    instruction: text(field(value, 'instruction')),
    expectedSessionRevision: integer(field(value, 'expectedSessionRevision')),
    ...(directionId === undefined ? {} : { directionId: text(directionId) }),
    ...(parentVersionId === undefined ? {} : { parentVersionId: text(parentVersionId) }),
  }
}
const parseExploreDirection = (value: unknown) => ({
  directionId: text(field(value, 'directionId')),
  expectedDirectionRevision: integer(field(value, 'expectedDirectionRevision')),
  expectedSessionRevision: integer(field(value, 'expectedSessionRevision')),
})
const parseExploreApproval = (value: unknown) => ({
  prototypeVersionId: text(field(value, 'prototypeVersionId')),
  expectedManifestDigest: digest(field(value, 'expectedManifestDigest')),
  expectedSessionRevision: integer(field(value, 'expectedSessionRevision')),
  acceptanceCriteria: list(field(value, 'acceptanceCriteria'), text),
})

export type ExploreSession = ReturnType<typeof parseSession>
export type ExploreVersion = ReturnType<typeof parseVersion>
export type ExploreTurn = ReturnType<typeof parseTurn>
export type ExploreDirection = ReturnType<typeof parseDirection>
export type ExploreApproval = ReturnType<typeof parseApproval>
export type ExploreStart = ReturnType<typeof parseExploreStart>
export type ExploreAction =
  | { type: 'turn'; body: ReturnType<typeof parseExploreTurn> }
  | { type: 'select'; body: ReturnType<typeof parseExploreDirection> }
  | { type: 'approve'; body: ReturnType<typeof parseExploreApproval> }

export function parseExploreAction(value: unknown): ExploreAction {
  const type = choice(field(value, 'type'), ['turn', 'select', 'approve'])
  const body = field(value, 'body')
  switch (type) {
    case 'turn':
      return { type, body: parseExploreTurn(body) }
    case 'select':
      return { type, body: parseExploreDirection(body) }
    case 'approve':
      return { type, body: parseExploreApproval(body) }
    default:
      throw invalid()
  }
}

export interface ExploreScope {
  projectId: string
  token: string
}
const esc = encodeURIComponent
const base = (projectId: string) => `/api/v1/projects/${esc(projectId)}/explore` as const
const sessionPath = (projectId: string, sessionId: string) => `${base(projectId)}/sessions/${esc(sessionId)}` as const

export const getExplorePreflight = (
  { projectId, token }: ExploreScope,
  seedEntryId: string,
  expectedSeedRevision: number,
  signal: AbortSignal,
) =>
  callApi(
    `${base(projectId)}/preflight?seedEntryId=${esc(seedEntryId)}&expectedSeedRevision=${String(expectedSeedRevision)}`,
    { method: 'GET', token, signal, memberRead: true },
    parsePreflight,
  )

export const startExplore = ({ projectId, token }: ExploreScope, body: ExploreStart, key: string) =>
  callApi(`${base(projectId)}/sessions`, { token, body, key }, readStart)

export async function getExploreSession({ projectId, token }: ExploreScope, sessionId: string, signal: AbortSignal) {
  const session = await callApi(
    sessionPath(projectId, sessionId),
    { method: 'GET', token, signal, memberRead: true },
    parseSession,
  )
  if (session.id !== sessionId) throw invalid()
  return session
}

export async function sendExploreAction(
  { projectId, token }: ExploreScope,
  sessionId: string,
  action: ExploreAction,
  key: string,
) {
  const path = sessionPath(projectId, sessionId)
  const init = { token, key, body: action.body }
  switch (action.type) {
    case 'turn':
      return callApi(`${path}/turns`, init, readTurn)
    case 'select':
      return callApi(`${path}/direction-selection`, init, readRevision)
    case 'approve':
      return callApi(`${path}/approvals`, init, parseApproval)
    default:
      throw invalid()
  }
}

export const mintExplorePreview = (
  { projectId, token }: ExploreScope,
  sessionId: string,
  { id, entrySha256, manifestSha256 }: ExploreVersion,
  signal: AbortSignal,
) =>
  callApi(
    `${sessionPath(projectId, sessionId)}/versions/${esc(id)}/preview-permits`,
    { token, body: { entrySha256, manifestSha256 }, key: crypto.randomUUID(), signal },
    parsePermit,
  )

const parseHandoffFile = (value: unknown) => ({
  path: choice(field(value, 'path'), ['index.html']),
  mime: choice(field(value, 'mime'), ['text/html']),
  byteCount: integer(field(value, 'byteCount')),
  sha256: digest(field(value, 'sha256')),
})
const parseHandoff = (value: unknown) => ({
  approvalId: text(field(value, 'approvalId')),
  versionId: text(field(value, 'versionId')),
  manifestSha256: digest(field(value, 'manifestSha256')),
  seedText: text(field(value, 'seedText')),
  acceptanceCriteria: list(field(value, 'acceptanceCriteria'), text),
  mockReplacements: list(field(value, 'mockReplacements'), text),
  limitations: list(field(value, 'limitations'), text),
  files: list(field(value, 'files'), parseHandoffFile),
})
export async function getExploreHandoff(
  { projectId, token }: ExploreScope,
  sessionId: string,
  approval: ExploreApproval,
  version: ExploreVersion,
  signal: AbortSignal,
) {
  const read = await callApi(
    `${sessionPath(projectId, sessionId)}/handoff/${esc(approval.id)}`,
    { method: 'GET', token, signal, memberRead: true },
    parseHandoff,
  )
  if (
    read.approvalId !== approval.id ||
    read.versionId !== approval.versionId ||
    read.manifestSha256 !== approval.manifestSha256 ||
    read.files.length !== 1 ||
    read.files[0]?.sha256 !== version.entrySha256
  )
    throw invalid()
  return read
}
