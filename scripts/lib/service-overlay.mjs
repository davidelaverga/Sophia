/**
 * The operator's service overlay, admitted against the recorded bundle (FND-B114, 4325334689 and 4325334698).
 *
 * The initial normal opt-in is the recorded bridge row, whole and unchanged, plus its service replies on the one
 * recorded conversation route. The only other row admitted is the recorded `llm-pi-ai` row restated exactly with that
 * route's provider pointed at a numeric loopback endpoint: the same-host fake provider of the shipped-entry tests.
 * A provider, credential, route, price, cap or row the recorded unit does not declare is refused, and the bridge is
 * parsed by the bundle's own parseConfig, so nothing the bridge would refuse at start is printed or launched.
 */

import { createHash } from 'node:crypto'
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { REPO_ROOT, bundleArchivePath } from './common.mjs'
import { parseCordisYaml } from './patch-lint.mjs'
import { tarballFiles } from './profile.mjs'

const BRIDGE = 'sophia-control-bridge'
const PROVIDERS = 'llm-pi-ai'
/** The recorded conversation route (config/runtime-unit.json) and its provider alias in the bundle patch. */
export const SERVICE_ROUTE = 'conversation-service-luna-high-v1'
const SERVICE_PROVIDER = 'openai-conversation'
const LOOPBACK = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})(\/v1)?$/
const BUNDLE_DIR = join(REPO_ROOT, 'packages', 'dsh-bundle')

/**
 * The recorded bundle's bridge and provider rows, and its own parseConfig: read from the archive whose sha256 the unit
 * records, and the built `dist/` imported only when every one of its files is that archive's.
 * @param {any} unit - config/runtime-unit.json.
 */
export async function recordedBridge(unit) {
  const archive = bundleArchivePath(unit)
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== unit.sophia_bundle.archive_sha256) {
    throw new Error('the bundle archive is not the recorded one; run `pnpm artifacts`')
  }
  const files = tarballFiles(archive)
  for (const [path, bytes] of files) {
    if (path.startsWith('dist/') && !bytes.equals(readFileSync(join(BUNDLE_DIR, path)))) {
      throw new Error('the built bundle is not the recorded archive; run `pnpm artifacts`')
    }
  }
  const rows = parseCordisYaml(files.get('cordis.patch.yml').toString('utf8'))
  const all = rows.flatMap((row) => [row, ...(row.insert ?? [])])
  const only = (id) => {
    const found = all.filter((row) => row.id === id)
    if (found.length !== 1) throw new Error(`the recorded bundle patch has ${found.length} ${id} rows`)
    return found[0].config
  }
  const { parseConfig } = await import(pathToFileURL(join(BUNDLE_DIR, 'dist', 'index.js')).href)
  return { bridge: only(BRIDGE), providers: only(PROVIDERS), parseConfig }
}

/**
 * The overlay's rows, admitted or refused: unique, known, exactly one bridge row carrying service replies.
 * @param {unknown[]} rows - the overlay, already checked config-only.
 * @returns {{ bridge: any, providers: any }} the two rows' configs (providers may be undefined).
 */
export function overlayRows(rows) {
  const ids = rows.map((row) => row.id)
  if (new Set(ids).size !== ids.length) throw new Error('the service overlay names a row twice')
  const other = ids.filter((id) => id !== BRIDGE && id !== PROVIDERS)
  if (other.length > 0) throw new Error(`the service overlay may set only ${BRIDGE} (and ${PROVIDERS} for a loopback test endpoint), not ${other.join(', ')}`)
  const bridge = rows.find((row) => row.id === BRIDGE)?.config
  if (bridge?.replies?.mode !== 'service') throw new Error(`the service overlay sets no service replies on ${BRIDGE}`)
  return { bridge, providers: rows.find((row) => row.id === PROVIDERS)?.config }
}

/**
 * Refuse a bridge the bundle cannot parse, or one that differs from the recorded row beyond its service replies; and
 * a provider row that is not the recorded one with only the service route's endpoint moved to loopback.
 * @param {{ bridge: any, providers: any }} overlay - from overlayRows.
 * @param {Awaited<ReturnType<typeof recordedBridge>>} recorded - from recordedBridge.
 */
export function assertRecordedComposition(overlay, recorded) {
  try {
    recorded.parseConfig(overlay.bridge)
  } catch (error) {
    throw new Error(`the service overlay's bridge configuration is invalid: ${error.message}`)
  }
  const { replies, ...rest } = overlay.bridge
  if (replies.routeId !== SERVICE_ROUTE) throw new Error(`replies.routeId must be ${SERVICE_ROUTE}, the recorded conversation route`)
  if (!isDeepStrictEqual(rest, recorded.bridge)) throw new Error(`the service overlay's ${BRIDGE} differs from the recorded bundle's beyond its service replies`)
  if (overlay.providers === undefined) return
  const declared = recorded.providers.providers[SERVICE_PROVIDER]
  const baseURL = overlay.providers?.providers?.[SERVICE_PROVIDER]?.baseURL
  const expected = { ...recorded.providers, providers: { ...recorded.providers.providers, [SERVICE_PROVIDER]: { ...declared, baseURL } } }
  const port = typeof baseURL === 'string' ? LOOPBACK.exec(baseURL)?.[1] : undefined
  if (port === undefined || Number(port) > 65535 || !isDeepStrictEqual(overlay.providers, expected)) {
    throw new Error(`${PROVIDERS} may only restate the recorded providers with ${SERVICE_PROVIDER} pointed at a numeric loopback test endpoint`)
  }
}

/**
 * The admitted bytes, staged for dsh under the leased root (FND-B115, 4326076019): the launch, and every supervisor
 * restart, composes exactly what was admitted and digested, never the operator's file, which may change afterwards.
 * @param {string} root - the project root, leased by this process.
 * @param {Buffer} bytes - the admitted overlay.
 * @returns {string} the staged file, owner-only.
 */
export function stageAdmittedOverlay(root, bytes) {
  const path = join(root, 'service-overlay.admitted.json')
  rmSync(path, { force: true })
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
  if (!readFileSync(path).equals(bytes)) throw new Error('the staged service overlay is not the admitted one')
  return path
}
