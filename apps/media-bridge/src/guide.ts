// The mission guide (M01_PROMPT_LOADING, SMC-M01 binding §5): the exact system prompt and the complete
// mission-lifecycle skill, read from this package's content folder, checked against their release manifest and
// assembled as prompt + one LF + skill. The result must equal the checked snapshot byte for byte. A missing,
// re-encoded or altered file, or a manifest whose operations differ from the declared tools, stops the bridge before it
// serves an exchange: there is no fallback prompt. Project data never enters this text; it arrives through tools.
// Each guide version has its own manifest: v1.1 is M01's, v1.2 (SMC-M03 S6) is v1.1's skill with a prompt that adds
// the research operations. The bridge runs one version, chosen at start; rolling back is starting with v1.1.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the deployed bridge finds its assets: inside the package, never the docs folder or the network. */
export const GUIDE_DIR = fileURLToPath(new URL('./content/mission-guide/', import.meta.url))
export type GuideVersion = 'v1.1' | 'v1.2'
export const GUIDE_MANIFESTS: Readonly<Record<GuideVersion, string>> = {
  'v1.1': 'M01_ASSETS.v1.1.json',
  'v1.2': 'M01_ASSETS.v1.2.json',
}
/** M01's manifest. */
export const GUIDE_MANIFEST = GUIDE_MANIFESTS['v1.1']
/** The version a bridge runs when SOPHIA_GUIDE_VERSION names none. */
export const DEFAULT_GUIDE_VERSION: GuideVersion = 'v1.2'

export interface AssetIdentity {
  id: string
  sha256: string
  bytes: number
}

export interface MissionGuide {
  version: GuideVersion
  /** The exact provider-facing system instruction. */
  instruction: string
  prompt: AssetIdentity
  skill: AssetIdentity
  combined: { sha256: string; bytes: number }
  /** The model-facing operation names the manifest fixes, in its order. */
  operationNames: readonly string[]
}

/** A guide asset that cannot be activated. Its message names the file and the check, never the content. */
export class GuideAssetError extends Error {
  constructor(message: string) {
    super(`mission guide not activated: ${message}`)
    this.name = 'GuideAssetError'
  }
}

/** SOPHIA_GUIDE_VERSION: unset is the default; anything but a known version stops the bridge. */
export function guideVersionOf(raw: string | undefined): GuideVersion {
  if (raw === undefined || raw === '') return DEFAULT_GUIDE_VERSION
  if (raw === 'v1.1' || raw === 'v1.2') return raw
  throw new GuideAssetError('SOPHIA_GUIDE_VERSION names no known guide version')
}

interface Component {
  id: string
  kind: string
  path: string
  sha256: string
  bytes: number
}

interface Manifest {
  prompt: Component
  skill: Component
  assembled: { path: string; sha256: string; bytes: number }
  operationNames: string[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'

function component(v: unknown): Component {
  if (!isRecord(v)) throw new GuideAssetError('manifest component is not an object')
  const { id, kind, path, sha256, bytes } = v
  if (!isString(id) || !isString(kind) || !isString(path) || !isString(sha256) || typeof bytes !== 'number')
    throw new GuideAssetError('manifest component is incomplete')
  return { id, kind, path, sha256, bytes }
}

function assembled(v: unknown): Manifest['assembled'] {
  if (!isRecord(v) || !isString(v.path) || !isString(v.sha256) || typeof v.bytes !== 'number')
    throw new GuideAssetError('manifest assembly is incomplete')
  return { path: v.path, sha256: v.sha256, bytes: v.bytes }
}

/** The manifest's order and assembly rule must be exactly M01's contract: prompt, LF, skill, nothing else. */
function assemblyRule(v: unknown): void {
  if (!isRecord(v)) throw new GuideAssetError('manifest has no assembly rule')
  const order = Array.isArray(v.source_order) ? v.source_order.join(',') : ''
  const verbatim = v.operation === 'concatenate_verbatim' && v.separator_hex === '0a' && order === 'system_prompt,skill'
  const untouched = [v.frontmatter_stripping, v.interpolation, v.summarization, v.duplicate_skill_injection].every(
    (flag) => flag === false,
  )
  if (!verbatim || !untouched) throw new GuideAssetError('manifest assembly rule is not the v1.1 rule')
}

function parseManifest(raw: unknown, version: GuideVersion): Manifest {
  if (!isRecord(raw) || raw.schema !== 'sophia.m01-prompt-assets.v1' || raw.version !== version.slice(1))
    throw new GuideAssetError(`${GUIDE_MANIFESTS[version]} is not the ${version} asset manifest`)
  assemblyRule(raw.assembly)
  const components = Array.isArray(raw.components) ? raw.components.map(component) : []
  const prompt = components.find((c) => c.kind === 'system_prompt')
  const skill = components.find((c) => c.kind === 'skill')
  const names = raw.model_facing_operation_names
  if (!prompt || !skill || components.length !== 2)
    throw new GuideAssetError('manifest must name one prompt and one skill')
  if (!Array.isArray(names) || !names.every(isString)) throw new GuideAssetError('manifest has no operation names')
  return { prompt, skill, assembled: assembled(raw.assembled), operationNames: names }
}

/** The hex SHA-256 of these bytes. */
export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function readAsset(dir: string, path: string): Buffer {
  try {
    return readFileSync(join(dir, basename(path)))
  } catch {
    throw new GuideAssetError(`${basename(path)} is missing`)
  }
}

/** Strict UTF-8 without a BOM, LF only, one final newline; the bytes must match the manifest's hash and length. */
function checkedText(bytes: Buffer, expected: { path: string; sha256: string; bytes: number }): string {
  const name = basename(expected.path)
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)
    throw new GuideAssetError(`${name} does not match its manifest hash or length`)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new GuideAssetError(`${name} is not valid UTF-8`)
  }
  if (text.startsWith('﻿') || text.includes('\r') || !text.endsWith('\n') || text.endsWith('\n\n'))
    throw new GuideAssetError(`${name} is not LF text with one final newline and no BOM`)
  return text
}

/**
 * Load, check and assemble one version of the guide (M01's v1.1 unless named). `declared` is the bridge's own function
 * declarations for that version, in order: they must be exactly the operations the manifest fixes, or the guide would
 * name tools the connection does not have.
 */
export function loadMissionGuide(
  declared: readonly string[],
  dir = GUIDE_DIR,
  version: GuideVersion = 'v1.1',
): MissionGuide {
  const file = GUIDE_MANIFESTS[version]
  let raw: unknown
  try {
    raw = JSON.parse(readAsset(dir, file).toString('utf8'))
  } catch (err: unknown) {
    throw err instanceof GuideAssetError ? err : new GuideAssetError(`${file} is not JSON`)
  }
  const manifest = parseManifest(raw, version)
  const promptBytes = readAsset(dir, manifest.prompt.path)
  const skillBytes = readAsset(dir, manifest.skill.path)
  const prompt = checkedText(promptBytes, manifest.prompt)
  const skill = checkedText(skillBytes, manifest.skill)
  const combined = Buffer.concat([promptBytes, Buffer.from([0x0a]), skillBytes])
  const instruction = checkedText(combined, manifest.assembled)
  if (!readAsset(dir, manifest.assembled.path).equals(combined))
    throw new GuideAssetError(`${basename(manifest.assembled.path)} is not the assembly of the prompt and the skill`)
  if (instruction !== `${prompt}\n${skill}`) throw new GuideAssetError('assembly is not prompt + LF + skill')
  if (declared.join(',') !== manifest.operationNames.join(','))
    throw new GuideAssetError('the declared tools are not the operations the guide names')
  return {
    version,
    instruction,
    prompt: { id: manifest.prompt.id, sha256: manifest.prompt.sha256, bytes: manifest.prompt.bytes },
    skill: { id: manifest.skill.id, sha256: manifest.skill.sha256, bytes: manifest.skill.bytes },
    combined: { sha256: manifest.assembled.sha256, bytes: manifest.assembled.bytes },
    operationNames: manifest.operationNames,
  }
}

/** Content-safe identity for logs and release evidence: ids, hashes and lengths, never text. */
export function guideIdentity(guide: MissionGuide) {
  return { version: guide.version, prompt: guide.prompt, skill: guide.skill, combined: guide.combined }
}
