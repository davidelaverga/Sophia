/**
 * The native design roles' bundle assets (SDD-01, binding map §3): the prompt sections and native skills each preset
 * loads explicitly, and the reference texts and images its skills name, all shipped in the bundle under `skills/`
 * with the SHA-256 `skills/manifest.json` records (scripts/design-skills.mjs keeps the manifest equal to the files).
 *
 * Nothing here is discovered: a role names its sections, skills and reference scope in the registry
 * (config/specialists.json), and an asset whose bytes do not match the manifest makes the role unavailable rather than
 * loaded with something else. The references are read-only and scoped by the registry, not by which skill holds them
 * (SDD-01-RF-0002): the reviewer reads the gallery and the precedents without loading any maker's instructions.
 * @module @sophia/dsh-bundle/design-assets
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** Where the bundle's skills live: next to `dist/`, in the package. */
const SKILLS_DIR = new URL('../skills/', import.meta.url)

interface ManifestFile {
  readonly id: string
  readonly path: string
  readonly sha256: string
}

interface ManifestReference extends ManifestFile {
  readonly skill: string
  readonly kind: 'text' | 'image'
  readonly mediaType: string
  readonly bytes: number
}

interface Manifest {
  readonly promptSections: readonly ManifestFile[]
  readonly skills: readonly ManifestFile[]
  readonly references: readonly ManifestReference[]
}

/** What a design role composes from the registry: its sections, its skills and the references it may read. */
export interface DesignRoleAssets {
  readonly promptSections: readonly string[]
  readonly skills: readonly string[]
  /** Reference ids, or `prefix/*` patterns; a pattern that names no reference in the bundle makes the role unavailable. */
  readonly references: readonly string[]
}

/** Whether a reference id is inside a role's scope. */
export const inReferenceScope = (scope: readonly string[], id: string): boolean =>
  scope.some((p) => (p.endsWith('/*') ? id.startsWith(p.slice(0, -1)) : id === p))

/** One prompt section the preset installs, in order. */
export interface DesignPrompt {
  readonly name: string
  readonly order: number
  readonly text: string
  readonly sha256: string
}

/** One reference a role may read. */
export type DesignReference =
  | { readonly id: string; readonly kind: 'text'; readonly mediaType: string; readonly sha256: string; readonly text: string }
  | { readonly id: string; readonly kind: 'image'; readonly mediaType: string; readonly sha256: string; readonly data: Uint8Array }

export interface LoadedAssets {
  readonly prompts: readonly DesignPrompt[]
  readonly references: ReadonlyMap<string, DesignReference>
  /** The skills' own texts, readable whole by their ids (the prompt sections carry them too). */
  readonly skillIds: readonly string[]
}

export type AssetsOutcome = { readonly ok: true; readonly assets: LoadedAssets } | { readonly ok: false; readonly reason: string }

/** Where the role's sections sit among dsh's: after team policy (600), before PTC (800), apart from research's (650). */
const FIRST_ORDER = 640

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function isFile(value: unknown): value is ManifestFile {
  const v = value as Partial<ManifestFile> | null
  return typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.path === 'string' && typeof v.sha256 === 'string'
}

function readManifest(dir: URL): Manifest {
  const raw = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as Partial<Manifest> | null
  const list = (value: unknown) => (Array.isArray(value) && value.every(isFile) ? value : null)
  const promptSections = list(raw?.promptSections)
  const skills = list(raw?.skills)
  const references = list(raw?.references) as ManifestReference[] | null
  if (!promptSections || !skills || !references) throw new Error('skills/manifest.json is not a design skills manifest')
  return { promptSections, skills, references }
}

/** One file's bytes, checked against the hash the manifest records; a path never leaves the skills directory. */
function verified(dir: URL, file: ManifestFile): Uint8Array {
  if (file.path.split('/').some((part) => part === '..' || part === '')) throw new Error(`${file.id}: ${file.path} leaves the skills directory`)
  const bytes = readFileSync(new URL(file.path, dir))
  if (sha256(bytes) !== file.sha256) throw new Error(`${file.id}: ${file.path} does not match its recorded SHA-256`)
  return bytes
}

function find(list: readonly ManifestFile[], id: string): ManifestFile {
  const file = list.find((f) => f.id === id)
  if (!file) throw new Error(`${id} is not in the bundle's skills manifest`)
  return file
}

/** The manifest's references inside a role's scope; every pattern must name at least one. */
function scoped(manifest: Manifest, scope: readonly string[]): ManifestReference[] {
  for (const p of scope) {
    if (!manifest.references.some((r) => inReferenceScope([p], r.id))) throw new Error(`${p} names no reference in the bundle`)
  }
  return manifest.references.filter((r) => inReferenceScope(scope, r.id))
}

/**
 * Load and verify everything a design role composes: its prompt sections, then its skills (both as prompt sections, in
 * the registry's order), and the references its scope names. Any missing or changed byte makes the outcome `ok: false`
 * with the reason; the bridge then does not advertise the role.
 * @param role - the registry's sections and skills for the role.
 * @param dir - the skills directory (the bundle's own by default; a test passes a copy).
 */
export function loadDesignAssets(role: DesignRoleAssets, dir: URL = SKILLS_DIR): AssetsOutcome {
  try {
    const manifest = readManifest(dir)
    const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const sections = role.promptSections.map((id) => ({ id, file: find(manifest.promptSections, id) }))
    const skills = role.skills.map((id) => ({ id, file: find(manifest.skills, id) }))
    const prompts = [...sections, ...skills].map(({ id, file }, i) => {
      const bytes = verified(dir, file)
      return { name: id, order: FIRST_ORDER + i, text: decode(bytes), sha256: file.sha256 }
    })
    const references = new Map<string, DesignReference>()
    for (const ref of scoped(manifest, role.references)) {
      const bytes = verified(dir, ref)
      references.set(
        ref.id,
        ref.kind === 'image'
          ? { id: ref.id, kind: 'image', mediaType: ref.mediaType, sha256: ref.sha256, data: bytes }
          : { id: ref.id, kind: 'text', mediaType: ref.mediaType, sha256: ref.sha256, text: decode(bytes) },
      )
    }
    for (const { id, file } of skills) {
      references.set(id, { id, kind: 'text', mediaType: 'text/markdown', sha256: file.sha256, text: decode(verified(dir, file)) })
    }
    return { ok: true, assets: { prompts, references, skillIds: role.skills } }
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  }
}
