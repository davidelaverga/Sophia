// The render job's source, verified before any browser starts (architecture 14 §5A). The donor kernel guessed its
// root from a directory named `outputs`; here the root is explicit and immutable, with one entry HTML file and an
// enumerated list of assets, each named by a relative path and its SHA-256. Every path resolves to its real path,
// which must stay inside the root's real path. The job fails before launch on an absolute path, a `..` or empty
// segment, a symlink that leads out, a missing or non-regular file, a hash that does not match, a duplicate, an
// extension outside the allowlist, or a file over its size bound.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** Raster images a report may show from its source package (the donor PNG kernel's allowlist). */
export const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const ENTRY_EXTENSIONS = new Set(['.html', '.htm'])
const SHA256 = /^[0-9a-f]{64}$/
export const MAX_ASSETS = 64
const MAX_ENTRY_BYTES = 4 * 1024 * 1024
const MAX_ASSET_BYTES = 16 * 1024 * 1024
const MAX_PATH = 512

/** Why a source package is refused; `code` is stable, `detail` names the path. */
export class ManifestError extends Error {
  /**
   * @param {string} code
   * @param {string} detail
   */
  constructor(code, detail) {
    super(`${code}: ${detail}`)
    this.name = 'ManifestError'
    this.code = code
  }
}

/**
 * @typedef {{ path: string, sha256: string }} FileRef
 * @typedef {{ path: string, sha256: string, real: string, url: string, bytes: number }} VerifiedFile
 * @typedef {{ root: string, entry: VerifiedFile, assets: VerifiedFile[], manifestSha256: string }} VerifiedSource
 */

/** @param {string | Uint8Array} data */
export const sha256Hex = (data) => createHash('sha256').update(data).digest('hex')

/**
 * A relative path as the manifest may name it: forward slashes, no absolute form, no `.`, `..` or empty segment.
 * @param {unknown} value
 * @returns {string}
 */
function relativePathOf(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH || value.includes('\0')) {
    throw new ManifestError('invalid_path', JSON.stringify(value))
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\')) {
    throw new ManifestError('absolute_path', value)
  }
  if (value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new ManifestError('path_escape', value)
  }
  return value
}

/**
 * @param {string} candidate
 * @param {string} root
 */
const inside = (candidate, root) => {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * A manifest entry's relative path and hash, each checked for its form.
 * @param {unknown} ref
 */
function refOf(ref) {
  const item = typeof ref === 'object' && ref !== null ? ref : {}
  const rel = relativePathOf('path' in item ? item.path : undefined)
  const sha256 = 'sha256' in item ? item.sha256 : undefined
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) throw new ManifestError('invalid_hash', rel)
  return { rel, sha256 }
}

/**
 * One manifest entry checked against the disk.
 * @param {string} root the source root's real path
 * @param {unknown} ref
 * @param {{ extensions: Set<string>, maxBytes: number, missing: string }} rule
 * @returns {VerifiedFile}
 */
function verifyFile(root, ref, rule) {
  const { rel, sha256 } = refOf(ref)
  if (!rule.extensions.has(path.extname(rel).toLowerCase())) throw new ManifestError('extension', rel)
  let real
  try {
    real = fs.realpathSync(path.join(root, rel))
  } catch {
    throw new ManifestError(rule.missing, rel)
  }
  if (!inside(real, root)) throw new ManifestError('symlink_escape', rel)
  const stat = fs.statSync(real)
  if (!stat.isFile()) throw new ManifestError('not_file', rel)
  if (stat.size > rule.maxBytes) throw new ManifestError('too_large', rel)
  if (sha256Hex(fs.readFileSync(real)) !== sha256) throw new ManifestError('hash_mismatch', rel)
  return { path: rel, sha256, real, url: pathToFileURL(real).href, bytes: stat.size }
}

/**
 * The source package's identity: its entry and assets, sorted by path, as canonical JSON.
 * @param {FileRef} entry
 * @param {FileRef[]} assets
 */
export function manifestHash(entry, assets) {
  const sorted = assets.map((a) => ({ path: a.path, sha256: a.sha256 })).toSorted((a, b) => (a.path < b.path ? -1 : 1))
  return sha256Hex(JSON.stringify({ entry: { path: entry.path, sha256: entry.sha256 }, assets: sorted }))
}

/**
 * Verify a source package before launch.
 * @param {{ sourceRoot: string, entry: unknown, assets: unknown }} job
 * @returns {VerifiedSource}
 */
export function verifySource(job) {
  if (typeof job.sourceRoot !== 'string' || !path.isAbsolute(job.sourceRoot)) {
    throw new ManifestError('invalid_root', 'sourceRoot must be an absolute directory')
  }
  let root
  try {
    root = fs.realpathSync(job.sourceRoot)
  } catch {
    throw new ManifestError('invalid_root', 'sourceRoot does not exist')
  }
  if (!fs.statSync(root).isDirectory()) throw new ManifestError('invalid_root', 'sourceRoot is not a directory')
  if (!Array.isArray(job.assets) || job.assets.length > MAX_ASSETS) {
    throw new ManifestError('invalid_assets', `at most ${MAX_ASSETS} assets, as a list`)
  }
  const entry = verifyFile(root, job.entry, {
    extensions: ENTRY_EXTENSIONS,
    maxBytes: MAX_ENTRY_BYTES,
    missing: 'missing_entry',
  })
  const assetRule = { extensions: ASSET_EXTENSIONS, maxBytes: MAX_ASSET_BYTES, missing: 'missing_asset' }
  const assets = job.assets.map((/** @type {unknown} */ ref) => verifyFile(root, ref, assetRule))
  const seen = new Set([entry.real])
  for (const asset of assets) {
    if (seen.has(asset.real)) throw new ManifestError('duplicate', asset.path)
    seen.add(asset.real)
  }
  return { root, entry, assets, manifestSha256: manifestHash(entry, assets) }
}

/**
 * Whether the files verified before the render still hold the same bytes after it (the root must be immutable; a
 * change during the render means the output may not be of the verified source).
 * @param {VerifiedSource} source
 */
export function sourceUnchanged(source) {
  return [source.entry, ...source.assets].every((file) => {
    try {
      return sha256Hex(fs.readFileSync(file.real)) === file.sha256
    } catch {
      return false
    }
  })
}
