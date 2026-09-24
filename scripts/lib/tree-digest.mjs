/**
 * Content identity of a deployed directory, independent of archive tooling.
 *
 * Every regular file and symlink under `root` becomes one line
 * `<type> <relpath> <x|-> <sha256|link-target>`; lines are sorted bytewise
 * and the digest is the SHA-256 of the joined listing. Directories are not
 * content: non-empty ones are implied by their paths, and empty ones are
 * scratch space (dependency install scripts leave `node_modules/.tmp` on some
 * hosts and not others; v1 hashed them, v2 does not). Timestamps, owners and
 * pnpm bookkeeping that records install time or the checkout location are excluded, and so are
 * package-manager `.bin` shims, which embed the absolute install location.
 * Two installs from the same lock, at any location, produce the same digest.
 * Launchers therefore run the package's declared bin file directly
 * (common.mjs `DSH_ENTRY`), never a shim.
 */

import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Scheme prefix recorded in config/runtime-unit.json. */
export const TREE_DIGEST_SCHEME = 'sophia-tree-v2'

/**
 * pnpm bookkeeping that records install time, the store path, or (for the
 * lock `pnpm deploy` writes) absolute file: URLs of the source checkout.
 * None of it is read at runtime; the installed tree it describes is covered.
 */
export const VOLATILE_PATHS = new Set([
  'pnpm-lock.yaml',
  'node_modules/.modules.yaml',
  'node_modules/.pnpm-workspace-state-v1.json',
  'node_modules/.pnpm/lock.yaml',
])

/**
 * @param {string} root - directory to digest.
 * @param {{ exclude?: Set<string> }} [options] - extra relative paths to skip.
 * @returns {{ digest: string, entries: string[] }} `digest` is `sophia-tree-v2:sha256:<hex>`.
 */
export function treeDigest(root, options = {}) {
  const exclude = new Set([...VOLATILE_PATHS, ...(options.exclude ?? [])])
  const entries = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const rel = relative(root, abs).split(sep).join('/')
      if (exclude.has(rel)) continue
      if (name === '.bin' && rel.split('/').at(-2) === 'node_modules') continue
      const stat = lstatSync(abs)
      if (stat.isSymbolicLink()) {
        entries.push(`l ${rel} - ${readlinkSync(abs)}`)
      } else if (stat.isDirectory()) {
        walk(abs)
      } else if (stat.isFile()) {
        const hash = createHash('sha256').update(readFileSync(abs)).digest('hex')
        entries.push(`f ${rel} ${stat.mode & 0o111 ? 'x' : '-'} ${hash}`)
      } else {
        throw new Error(`unsupported file type at ${rel}`)
      }
    }
  }
  walk(root)
  entries.sort()
  const digest = createHash('sha256').update(entries.join('\n') + '\n').digest('hex')
  return { digest: `${TREE_DIGEST_SCHEME}:sha256:${digest}`, entries }
}

/**
 * @param {string} file - file to hash.
 * @param {'sha256'|'sha512'} [algorithm] - hash algorithm.
 * @returns {string} lowercase hex digest.
 */
export function fileDigest(file, algorithm = 'sha256') {
  return createHash(algorithm).update(readFileSync(file)).digest('hex')
}

/**
 * @param {string} file - file to hash.
 * @returns {string} Subresource-Integrity sha512, the form pnpm locks record.
 */
export function fileIntegrity(file) {
  return `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`
}
