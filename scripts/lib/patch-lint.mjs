/**
 * Static checks for Cordis patch layers, run before dsh sees them.
 *
 * At the pin, dsh skips a bundle whose patch is empty/comments-only (bundle
 * layer) or fails boot (profile layer), and only warns about a row patch
 * whose target id does not exist. Sophia treats all of these as errors: a
 * layer that silently contributes nothing, or a disable that lands on no row,
 * is not the intended configuration. [DSH-03, DSH-04, DSH-05]
 */

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

/** `!!js` expressions stay opaque; only their presence matters here. */
const JS_TAG = { tag: 'tag:yaml.org,2002:js', resolve: (source) => ({ $js: source }) }

/** Parse Cordis patch/dump YAML, keeping `!!js` expressions as `{ $js }`. */
export function parseCordisYaml(text) {
  return parse(text, { customTags: [JS_TAG], strict: true, uniqueKeys: true })
}

/**
 * A lint finding.
 * @typedef {{ code: string, layer: string, message: string }} Finding
 */

/**
 * Parse one patch file into rows.
 * @param {string} text - file contents.
 * @param {string} layer - label for findings.
 * @returns {{ rows: any[] | null, findings: Finding[] }}
 */
export function parsePatch(text, layer) {
  let value
  try {
    value = parseCordisYaml(text)
  } catch (error) {
    return { rows: null, findings: [{ code: 'patch_unparsable', layer, message: String(error.message ?? error) }] }
  }
  if (value === null || value === undefined) {
    return { rows: null, findings: [{ code: 'patch_comments_only', layer, message: 'empty or comments-only patch; write a literal [] for an intentionally empty layer' }] }
  }
  if (!Array.isArray(value)) {
    return { rows: null, findings: [{ code: 'patch_not_array', layer, message: 'a patch must be a top-level YAML array of loader patch entries' }] }
  }
  const findings = []
  value.forEach((row, index) => {
    const hasId = row !== null && typeof row === 'object' && typeof row.id === 'string'
    const hasInsert = row !== null && typeof row === 'object' && Array.isArray(row.insert)
    if (hasId === hasInsert) {
      findings.push({ code: 'patch_row_invalid', layer, message: `row ${index} must have exactly one of \`id\` (patch) or \`insert\` (list)` })
    }
  })
  return { rows: value, findings }
}

/**
 * @returns {string[]} top-level ids inserted by `rows`. The pinned base and
 * Sophia patches contain no native groups or includes; the composition gate
 * cross-checks this list against the real `--dump-config` output.
 */
export function insertedIds(rows) {
  const ids = []
  for (const row of rows) {
    if (!Array.isArray(row?.insert)) continue
    for (const entry of row.insert) if (typeof entry?.id === 'string') ids.push(entry.id)
  }
  return ids
}

/**
 * Check a layer's rows against the ids composed below it.
 * @param {any[]} rows - parsed rows of this layer.
 * @param {Set<string>} knownIds - ids present before this layer.
 * @param {{ layer: string, requireRows: boolean }} options - label and whether `[]` is an error.
 * @returns {{ findings: Finding[], ids: Set<string> }} findings and the ids after this layer.
 */
export function lintLayer(rows, knownIds, { layer, requireRows }) {
  const findings = []
  const ids = new Set(knownIds)
  if (requireRows && rows.length === 0) {
    findings.push({ code: 'patch_no_rows', layer, message: 'layer contributes no rows; the bundle would compose as if absent' })
  }
  for (const row of rows) {
    if (typeof row?.id === 'string' && !Array.isArray(row.insert)) {
      if (!ids.has(row.id)) {
        findings.push({ code: 'patch_unmatched_row', layer, message: `patch targets "${row.id}", which no lower layer defines` })
      }
    } else if (Array.isArray(row?.insert)) {
      for (const id of insertedIds([row])) {
        if (ids.has(id)) findings.push({ code: 'patch_duplicate_insert', layer, message: `inserts "${id}", which a lower layer already defines` })
        ids.add(id)
      }
    }
  }
  return { findings, ids }
}

/**
 * Lint the Sophia composition layers in profile order.
 * @param {{ basePatch: string, bundlePatch: string, profilePatch?: string }} files - absolute paths.
 * @returns {Finding[]} every finding; empty means the layers are as intended.
 */
export function lintComposition({ basePatch, bundlePatch, profilePatch }) {
  const base = parsePatch(readFileSync(basePatch, 'utf8'), '@deepseek-ai/dsh-base')
  if (base.rows === null) return base.findings
  const findings = [...base.findings]
  let ids = new Set(insertedIds(base.rows))

  const bundle = parsePatch(readFileSync(bundlePatch, 'utf8'), '@sophia/dsh-bundle')
  findings.push(...bundle.findings)
  if (bundle.rows !== null) {
    const layer = lintLayer(bundle.rows, ids, { layer: '@sophia/dsh-bundle', requireRows: true })
    findings.push(...layer.findings)
    ids = layer.ids
  }

  if (profilePatch !== undefined) {
    const profile = parsePatch(readFileSync(profilePatch, 'utf8'), 'profile cordis.patch.yml')
    findings.push(...profile.findings)
    if (profile.rows !== null) findings.push(...lintLayer(profile.rows, ids, { layer: 'profile cordis.patch.yml', requireRows: false }).findings)
  }
  return findings
}
