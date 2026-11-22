import { createHash } from 'node:crypto'
import { hasOnlyLocalPrototypeResources } from '@sophia/design'
import type { ManagedExploreRetentionOutput } from '@sophia/persistence'
import type { ManagedExploreRetentionCallback } from './managed-explore-dispatch.ts'
import { ManagedExploreProviderError, type ManagedExplorePrototype } from './managed-explore-provider.ts'

const MAX_METADATA_BYTES = 65_536
const MAX_ENTRY_BYTES = 2 * 1024 * 1024
const NODE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/
const PROVIDER_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,255}$/

type DirectionOutput = Extract<ManagedExploreRetentionOutput, { kind: 'directions' }>
type Direction = DirectionOutput['directions'][number]
type PrototypeOutput = Extract<ManagedExploreRetentionOutput, { kind: 'prototype' }>
type PrototypeNotes = Pick<PrototypeOutput, 'changeSummary' | 'acceptanceCriteria' | 'mockReplacements' | 'limitations'>
type JsonObject = Record<string, unknown>

function exact(value: unknown, keys: readonly string[]): value is JsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

function bounded(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.isWellFormed() &&
    value.length > 0 &&
    value === value.trim() &&
    !value.includes('\0') &&
    Buffer.byteLength(value) <= 1_000
  )
}

function nodeId(value: unknown): value is string {
  return typeof value === 'string' && NODE_ID.test(value)
}

function graphSteps(value: unknown): value is Direction['steps'] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) return false
  const ids = new Set<string>()
  for (const step of value) {
    if (!exact(step, ['id', 'label', 'lane']) || !nodeId(step.id) || !bounded(step.label)) return false
    if ((step.lane !== 'vessel' && step.lane !== 'shore') || ids.has(step.id)) return false
    ids.add(step.id)
  }
  return true
}

function graphEdges(value: unknown, steps: Direction['steps']): value is Direction['edges'] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return false
  const ids = new Set(steps.map(({ id }) => id))
  const seen = new Set<string>()
  for (const edge of value) {
    if (!exact(edge, ['from', 'to']) || !nodeId(edge.from) || !nodeId(edge.to)) return false
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to)) return false
    const key = `${edge.from}\0${edge.to}`
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

function direction(value: unknown): Direction | null {
  if (!exact(value, ['label', 'firstActor', 'nextStep', 'rationale', 'tradeoff', 'steps', 'edges'])) return null
  const { label, firstActor, nextStep, rationale, tradeoff, steps, edges } = value
  if (!bounded(label) || !bounded(firstActor) || !bounded(nextStep) || !bounded(rationale) || !bounded(tradeoff))
    return null
  if (!graphSteps(steps) || !graphEdges(edges, steps)) return null
  return { label, firstActor, nextStep, rationale, tradeoff, steps, edges }
}

function parseBoundedJson(text: string): unknown {
  if (Buffer.byteLength(text) > MAX_METADATA_BYTES) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function parseManagedExploreDirections(text: string): DirectionOutput['directions'] | null {
  const value = parseBoundedJson(text)
  if (!exact(value, ['directions']) || !Array.isArray(value.directions) || value.directions.length !== 2) return null
  const first = direction(value.directions[0])
  const second = direction(value.directions[1])
  if (!first || !second || first.label.toLowerCase() === second.label.toLowerCase()) return null
  if (
    first.firstActor.toLowerCase() === second.firstActor.toLowerCase() &&
    first.nextStep.toLowerCase() === second.nextStep.toLowerCase()
  )
    return null
  return [first, second]
}

function notesList(value: unknown, min: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= 16 && value.every((item) => bounded(item))
}

export function parseManagedExplorePrototypeNotes(text: string): PrototypeNotes | null {
  const value = parseBoundedJson(text)
  if (!exact(value, ['changeSummary', 'acceptanceCriteria', 'mockReplacements', 'limitations'])) return null
  const { changeSummary, acceptanceCriteria, mockReplacements, limitations } = value
  if (
    !bounded(changeSummary) ||
    !notesList(acceptanceCriteria, 1) ||
    !notesList(mockReplacements, 0) ||
    !notesList(limitations, 0)
  )
    return null
  return { changeSummary, acceptanceCriteria, mockReplacements, limitations }
}

// The transport promises these values after verification. Keep the retention boundary's runtime checks explicit.
type Entry = Omit<ManagedExplorePrototype, 'path' | 'mimeType'> & { path: string; mimeType: string }

export function validManagedExploreEntry(artifact: Entry): boolean {
  const { artifactId, bytes, path, mimeType, byteLength, sha256 } = artifact
  if (
    !PROVIDER_ID.test(artifactId) ||
    path !== '/workspace/outputs/index.html' ||
    mimeType !== 'text/html; charset=utf-8'
  )
    return false
  if (
    !(bytes instanceof Uint8Array) ||
    byteLength !== bytes.byteLength ||
    byteLength < 1 ||
    byteLength > MAX_ENTRY_BYTES
  )
    return false
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) return false
  try {
    const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return (
      !html.includes('\0') &&
      /<(?:!doctype\s+html\b|[a-z][a-z\d-]*(?=[\s/>]))/i.test(html) &&
      hasOnlyLocalPrototypeResources(bytes)
    )
  } catch {
    return false
  }
}

type ArtifactOutput = Extract<Parameters<ManagedExploreRetentionCallback>[1], { kind: 'prototype' | 'revision' }>

function isExactArtifact({ artifact, root, environmentId, outputRequestId }: ArtifactOutput): boolean {
  return (
    artifact.turnId === root.id &&
    artifact.sessionId === root.sessionId &&
    artifact.environmentId === environmentId &&
    (outputRequestId === null || PROVIDER_ID.test(outputRequestId)) &&
    validManagedExploreEntry(artifact)
  )
}

export function managedExploreRetention({
  readTurnText,
  write,
}: {
  readTurnText: (sessionId: string, rootId: string) => Promise<{ value: string | null }>
  write: (
    identity: Parameters<ManagedExploreRetentionCallback>[0],
    output: ManagedExploreRetentionOutput,
  ) => Promise<void>
}): ManagedExploreRetentionCallback {
  return async (identity, output) => {
    const { root, event, environmentId } = output
    const reference = { ...event, rootId: root.id, environmentId }
    if (root.status !== 'completed' || root.sessionId !== event.providerSessionId || root.id === event.previousRootId)
      return 'invalid'
    if (output.kind === 'directions') {
      const directions = parseManagedExploreDirections(output.text)
      if (!directions) return 'invalid'
      await write(identity, { kind: 'directions', ...reference, directions })
      return 'settled'
    }
    if (!isExactArtifact(output)) return 'invalid'
    const { artifact } = output
    const receipt = await readTurnText(root.sessionId, root.id).catch((error: unknown): 'invalid' | 'pending' =>
      error instanceof ManagedExploreProviderError && error.disposition === 'terminal' ? 'invalid' : 'pending',
    )
    if (typeof receipt === 'string') return receipt
    if (!receipt.value?.trim()) return 'missing'
    const notes = parseManagedExplorePrototypeNotes(receipt.value)
    if (!notes) return 'invalid'
    await write(identity, {
      kind: 'prototype',
      ...reference,
      ...notes,
      artifactId: artifact.artifactId,
      path: artifact.path,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      ...(output.outputRequestId === null ? {} : { artifactRequestId: output.outputRequestId }),
    })
    return 'settled'
  }
}
