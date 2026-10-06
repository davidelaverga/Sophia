#!/usr/bin/env node
// Capture one designed HTML page at the admitted screen targets in the confined headless Chromium (SDD-01 §7, pack 05
// §5): real screenshots a model can look at and the measures the hard gate reads. The same confinement as the PDF
// kernel (confine.mjs: namespaces, the sandbox self-test that fails closed, page JavaScript off) and the same verified
// source (source-manifest.mjs). A designed page is self-contained, so every request but its own document is refused
// and fails the capture.
// For each target, the page is loaded at the target's width and colour scheme, measured (capture-page.mjs), and
// captured:
// - overview tiles of the whole page, scaled down, for its rhythm;
// - readable tiles of each `[data-section]` at full scale, cut into pieces no taller than the target's tile height;
// - readable tiles of every stretch of the page outside the sections (its head, gaps and foot).
// Captures stop at a bounded count and size; whatever is left uncaptured is named in the coverage, never dropped.
// Usage: capture-html.mjs --job <job.json>. The job names sourceRoot, entry, language, targets, outputDir and
// optionally sections (the ones to capture; every one by default); the receipt and the PNGs land in outputDir.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { conditionsScript, MAX_LINES, MAX_LOOK_MS, MAX_MEASURED, MAX_POINTS, pageScript } from './capture-page.mjs'
import { launchConfined, playwrightVersion } from './confine.mjs'
import { generatedAt, layoutAt, layoutChanges, placementStep, structureScript } from './placement.mjs'
import { ManifestError, sha256Hex, sourceUnchanged, verifySource } from './source-manifest.mjs'

export const CAPTURE_RECEIPT_SCHEMA = 'sophia.html-capture-receipt.v1'
const HERE = path.dirname(fileURLToPath(import.meta.url))
/** The files whose code decides a capture and its measures (the capture kernel's identity). */
export const CAPTURE_KERNEL_FILES = [
  'capture-html.mjs',
  'capture-page.mjs',
  'confine.mjs',
  'placement.mjs',
  'source-manifest.mjs',
  'bin/confine-chromium',
]

/**
 * @typedef {{ id: string, width: number, height: number, scheme: 'light' | 'dark', tileHeight: number,
 *   overviewScale: number }} Target
 */

/** The targets a capture may name (html-design-v1 admits the two light ones). */
export const CAPTURE_TARGETS = /** @type {Readonly<Record<string, Target>>} */ ({
  'w390-light': { id: 'w390-light', width: 390, height: 844, scheme: 'light', tileHeight: 1200, overviewScale: 0.5 },
  'w1280-light': {
    id: 'w1280-light',
    width: 1280,
    height: 800,
    scheme: 'light',
    tileHeight: 900,
    overviewScale: 0.375,
  },
})
/** How much one capture job may produce. */
export const CAPTURE_LIMITS = Object.freeze({
  /** Captures across every target. */
  captures: 72,
  /** The tallest image an overview tile becomes, in pixels. */
  overviewTilePx: 2400,
  /** The deepest a page is captured, in CSS pixels; below that it is named uncaptured. */
  pageHeight: 48_000,
  imageBytes: 8 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
})
/**
 * The most one target's measure may weigh in the receipt, as PostgreSQL writes it (jsonbBytes): two targets, the
 * captures and the checks then stay within RECEIPT_BYTES, so a page with many labels, texts or sections fails its
 * checks in a receipt the service takes, never in one it refuses after the work is done and runs again (#117).
 */
export const MEASURE_BYTES = 360 * 1024
/** The most a receipt may weigh, as PostgreSQL writes it: under the 1 MiB a capture receipt may hold (0038). */
export const RECEIPT_BYTES = 1_000_000
/**
 * The window widths the width sweep measures between, its window height, the most width breakpoints a page's
 * stylesheets may set, and how long the sweep may take (#117, CX-0039). Between two breakpoints the page's media
 * conditions hold or fail alike, so the rules its captures show at 390 and 1280px are not the only ones a reader can
 * meet: the sweep measures, without capturing, both ends of every band the breakpoints make, from a narrow phone to a
 * wide screen. A breakpoint past these widths, more breakpoints, a condition it cannot read, or a band end it has no
 * time left to measure fails the sweep, never a band left out.
 */
export const SWEEP = Object.freeze({ minWidth: 320, maxWidth: 2560, height: 800, maxBreakpoints: 8, maxMs: 60_000 })
/** A stretch of the page outside every section shorter than this is not captured on its own. */
const MARGIN_MIN_PX = 24
const SECTION_ID = /^[a-z][a-z0-9-]{0,63}$/
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const MAX_LISTED = 20
const DEFAULT_TIMEOUT_MS = 180_000

/** Why a capture failed; `code` is stable and lands in the receipt. */
export class CaptureFailure extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'CaptureFailure'
    this.code = code
  }
}

/**
 * The capture kernel's identity: its files' bytes in a fixed order. Playwright and the browser are reported on their
 * own.
 * @param {string} [dir]
 */
export function captureSha256(dir = HERE) {
  return sha256Hex(CAPTURE_KERNEL_FILES.map((f) => `${f}\0${sha256Hex(fs.readFileSync(path.join(dir, f)))}\n`).join(''))
}

/**
 * @typedef {{ sourceRoot: string, entry: unknown, language: string, targets: string[], outputDir: string,
 *   sections?: string[] | null, jobId?: string, scratchDir?: string, timeoutMs?: number }} CaptureJob
 * @typedef {{ name: string, target: string, kind: 'overview' | 'section' | 'margin', section: string | null,
 *   tile: number, tiles: number, clip: import('./capture-page.mjs').Box, scale: number, width: number,
 *   height: number, sha256: string, bytes: number }} Capture
 * @typedef {{ name: string, target: string | null, outcome: 'passed' | 'failed' | 'unknown', detail: string | null }} Check
 * @typedef {{ requested: string[] | null, captured: string[], missing: string[], margins: number,
 *   marginsCaptured: number, truncated: boolean }} Coverage
 * @typedef {{ target: Target, page: import('./capture-page.mjs').PageMeasure, coverage: Coverage }} TargetResult
 */

/** @param {CaptureJob} job */
function newReceipt(job) {
  return {
    schema: CAPTURE_RECEIPT_SCHEMA,
    jobId: job.jobId ?? null,
    status: /** @type {'succeeded' | 'failed' | 'cancelled'} */ ('failed'),
    error: /** @type {{ code: string, message: string } | null} */ (null),
    renderer: {
      kernel: 'renderers/web/pdf/capture-html.mjs',
      rendererSha256: captureSha256(),
      playwrightCore: playwrightVersion(),
      browser: /** @type {string | null} */ (null),
    },
    source: /** @type {{ manifestSha256: string, entry: { path: string, sha256: string } } | null} */ (null),
    language: job.language,
    sandbox: /** @type {import('./confine.mjs').SandboxVerdict | null} */ (null),
    fonts: /** @type {string[]} */ ([]),
    targets:
      /** @type {{ id: string, width: number, height: number, scheme: string, page: import('./capture-page.mjs').PageMeasure, coverage: Coverage }[]} */ ([]),
    captures: /** @type {Capture[]} */ ([]),
    blockedRequests: /** @type {string[]} */ ([]),
    checks: /** @type {Check[]} */ ([]),
    warnings: /** @type {string[]} */ ([]),
    elapsedMs: 0,
  }
}

/** @typedef {ReturnType<typeof newReceipt>} CaptureReceipt */

/**
 * @param {string} name
 * @param {Check['outcome']} outcome
 * @param {string | null} [detail]
 * @param {string | null} [target]
 * @returns {Check}
 */
const check = (name, outcome, detail = null, target = null) => ({ name, target, outcome, detail })

/**
 * The PNG's size from its header.
 * @param {Buffer} png
 */
function pngSize(png) {
  if (png.length < 24 || png.toString('latin1', 1, 4) !== 'PNG')
    throw new CaptureFailure('bad_image', 'a capture is not a PNG')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/**
 * Deny by default: only the entry document itself loads. Anything else is recorded and fails the capture.
 * @param {import('playwright-core').Page} page
 * @param {string} entryUrl
 * @param {string[]} blocked
 */
async function installRequestPolicy(page, entryUrl, blocked) {
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = request.url()
    if (request.resourceType() === 'document' && (url === entryUrl || url === 'about:blank')) return route.continue()
    blocked.push(`${request.resourceType()}:${url.startsWith('file:') ? 'file:<local>' : url.slice(0, 200)}`)
    return route.abort('blockedbyclient')
  })
}

/**
 * The tiles a span of the page is cut into: equal steps of at most `step`, the last one shorter.
 * @param {number} top
 * @param {number} height
 * @param {number} step
 */
export function tilesOf(top, height, step) {
  /** @type {{ y: number, height: number }[]} */
  const out = []
  for (let y = top; y < top + height; y += step) out.push({ y, height: Math.min(step, top + height - y) })
  return out
}

/**
 * The stretches of the page outside every section: each at least MARGIN_MIN_PX tall, or shorter but holding text the
 * page shows (a one-line footer), which a full-size capture must show too (#117).
 * @param {{ y: number, height: number }[]} sections
 * @param {number} pageHeight
 * @param {{ y: number, height: number }[]} [texts] the boxes of the text the page shows
 */
export function marginsOf(sections, pageHeight, texts = []) {
  /** @type {{ y: number, height: number }[]} */
  const out = []
  const holdsText = (/** @type {number} */ top, /** @type {number} */ bottom) =>
    texts.some((t) => Math.min(bottom, t.y + t.height) - Math.max(top, t.y) > 2)
  const keep = (/** @type {number} */ top, /** @type {number} */ bottom) => {
    if (bottom - top >= MARGIN_MIN_PX || (bottom > top && holdsText(top, bottom)))
      out.push({ y: top, height: bottom - top })
  }
  let at = 0
  for (const s of sections.toSorted((a, b) => a.y - b.y)) {
    keep(at, s.y)
    at = Math.max(at, s.y + s.height)
  }
  keep(at, pageHeight)
  return out
}

/**
 * @typedef {{ cdp: import('playwright-core').CDPSession, job: CaptureJob, receipt: CaptureReceipt,
 *   budget: { captures: number, bytes: number } }} Shot
 */

/**
 * Take one capture through the protocol (beyond the viewport, without resizing it) and keep it, or say the budget is
 * spent.
 * @param {Shot} shot
 * @param {Omit<Capture, 'name' | 'width' | 'height' | 'sha256' | 'bytes'>} what
 * @returns {Promise<boolean>} whether it was kept
 */
async function take(shot, what) {
  if (shot.budget.captures <= 0) return false
  const { data } = await shot.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...what.clip, scale: what.scale },
    captureBeyondViewport: true,
    fromSurface: true,
  })
  const png = Buffer.from(data, 'base64')
  if (png.byteLength > CAPTURE_LIMITS.imageBytes || png.byteLength > shot.budget.bytes) return false
  const name = `${what.target}.${what.kind}${what.section ? `.${what.section}` : ''}.${what.tile}.png`
  fs.writeFileSync(path.join(shot.job.outputDir, name), png, { flag: 'wx', mode: 0o644 })
  shot.budget.captures -= 1
  shot.budget.bytes -= png.byteLength
  shot.receipt.captures.push({ name, ...what, ...pngSize(png), sha256: sha256Hex(png), bytes: png.byteLength })
  return true
}

/**
 * Capture every tile of one span; whether all of them were kept.
 * @param {Shot} shot
 * @param {{ target: Target, kind: Capture['kind'], section: string | null, y: number, height: number,
 *   step: number, scale: number }} span
 */
async function takeSpan(shot, span) {
  const tiles = tilesOf(span.y, span.height, span.step)
  for (const [i, t] of tiles.entries()) {
    const clip = { x: 0, y: t.y, width: span.target.width, height: t.height }
    const kept = await take(shot, {
      target: span.target.id,
      kind: span.kind,
      section: span.section,
      tile: i + 1,
      tiles: tiles.length,
      clip,
      scale: span.scale,
    })
    if (!kept) return false
  }
  return true
}

/**
 * The sections this job captures at a target, in page order, and the requested ones the page does not have.
 * @param {CaptureJob} job
 * @param {import('./capture-page.mjs').PageMeasure} page
 */
function sectionsToCapture(job, page) {
  const wanted = job.sections ?? null
  const present = page.sections.filter((s) => s.height > 0 && (wanted === null || wanted.includes(s.id)))
  const absent = wanted === null ? [] : wanted.filter((id) => !page.sections.some((s) => s.id === id))
  return { present, absent }
}

/**
 * The overview, the sections and (when every section is asked for) the margins of one target, within the budget.
 * @param {Shot} shot
 * @param {Target} target
 * @param {import('./capture-page.mjs').PageMeasure} page
 * @returns {Promise<Coverage>}
 */
async function captureTarget(shot, target, page) {
  const depth = Math.min(page.height, CAPTURE_LIMITS.pageHeight)
  const overviewStep = Math.floor(CAPTURE_LIMITS.overviewTilePx / target.overviewScale)
  let complete = page.height <= CAPTURE_LIMITS.pageHeight
  complete =
    (await takeSpan(shot, {
      target,
      kind: 'overview',
      section: null,
      y: 0,
      height: depth,
      step: overviewStep,
      scale: target.overviewScale,
    })) && complete
  const { present, absent } = sectionsToCapture(shot.job, page)
  /** @type {string[]} */
  const captured = []
  for (const s of present) {
    const height = Math.min(s.height, depth - s.y)
    if (
      height > 0 &&
      (await takeSpan(shot, {
        target,
        kind: 'section',
        section: s.id,
        y: s.y,
        height,
        step: target.tileHeight,
        scale: 1,
      }))
    )
      captured.push(s.id)
  }
  const margins = shot.job.sections ? [] : marginsOf(page.sections, depth, shownBoxes(page))
  let marginsCaptured = 0
  for (const [i, m] of margins.entries()) {
    if (
      await takeSpan(shot, {
        target,
        kind: 'margin',
        section: `m${i + 1}`,
        y: m.y,
        height: m.height,
        step: target.tileHeight,
        scale: 1,
      })
    )
      marginsCaptured += 1
  }
  const missing = [...present.filter((s) => !captured.includes(s.id)).map((s) => s.id), ...absent]
  const truncated = !complete || missing.length > 0 || marginsCaptured < margins.length
  return {
    requested: shot.job.sections ?? null,
    captured,
    missing,
    margins: margins.length,
    marginsCaptured,
    truncated,
  }
}

/**
 * The checks one target's measures and coverage carry. An unknown contrast is unknown, never passed; labels or texts
 * left unmeasured past the receipt's bound, or whose lines the cover check's bounds did not reach, fail
 * blocks_visible.
 * @param {Target} target
 * @param {import('./capture-page.mjs').PageMeasure} page
 * @param {Coverage} coverage
 * @param {number} [unmeasured]
 * @param {number} [unsampled]
 * @returns {Check[]}
 */
export function targetChecks(target, page, coverage, unmeasured = 0, unsampled = 0) {
  const escaped = outsideScope(page, coverage.requested)
  // A shown label (one a tooltip, an accessible name or an ID reference rests on), and every other text outside the
  // blocks, is held to what a block is, at every target (#117). Text a target hides is text its capture does not show:
  // kept for print, for another width, or for assistive technology, or shown at one width and hidden at another so
  // that pieces seen apart compose a claim nowhere reviewed; and, held tighter than a block, text a scrolling container
  // does not show where the page starts (textHiddenHere). Text outside the blocks that a target hides is not read for
  // contrast there.
  const unseen = [
    ...new Set([
      ...page.blocks.filter(hiddenHere),
      ...[...page.shown, ...page.framing].filter(textHiddenHere),
      ...escaped,
    ]),
  ]
  const read = [...page.blocks, ...page.shown, ...page.framing.filter((m) => !textHiddenHere(m))]
  const low = read.filter((b) => b.issues.includes('low_contrast'))
  const unknown = read.filter((b) => b.contrast.ratio === null)
  const ids = (/** @type {{ id: string }[]} */ list) =>
    list
      .slice(0, MAX_LISTED)
      .map((b) => b.id)
      .join(', ')
  const hidden = [ids(unseen), ...unreached(unmeasured, unsampled)].filter(Boolean)
  return [
    check(
      'layout_overflow',
      page.overflowPx === 0 ? 'passed' : 'failed',
      `${page.overflowPx}px past the ${target.width}px width`,
      target.id,
    ),
    check(
      'blocks_visible',
      hidden.length === 0 ? 'passed' : 'failed',
      hidden.length === 0 ? null : hidden.join('; '),
      target.id,
    ),
    check(
      'contrast',
      low.length > 0 ? 'failed' : unknown.length > 0 ? 'unknown' : 'passed',
      low.length > 0 ? ids(low) : unknown.length > 0 ? `unmeasured: ${ids(unknown)}` : null,
      target.id,
    ),
    check(
      'captures_complete',
      coverage.truncated ? 'failed' : 'passed',
      coverage.missing.length > 0 ? `uncaptured: ${listed(coverage.missing)}` : null,
      target.id,
    ),
  ]
}

/**
 * Names, at most MAX_LISTED of them, and how many more there are.
 * @param {string[]} names
 */
function listed(names) {
  const more = names.length - MAX_LISTED
  return `${names.slice(0, MAX_LISTED).join(', ')}${more > 0 ? ` and ${more} more` : ''}`
}

/**
 * How many bytes PostgreSQL writes a value's JSON in: jsonb's text puts a space after every `:` and `,`, counted over
 * the compact JSON (strings included), so never less.
 * @param {unknown} value
 */
export function jsonbBytes(value) {
  const json = JSON.stringify(value)
  return Buffer.byteLength(json) + (json.match(/[:,]/gu)?.length ?? 0)
}

/**
 * A target's measure within MEASURE_BYTES: texts outside the blocks, then labels, then sections, then blocks, are left
 * out from the end until it fits. Every text, label or block left out is counted unmeasured, which fails the target's
 * blocks_visible, and a block left out fails the gate, which needs each one measured (0039). A section left out stays
 * in the coverage, which names every one the captures miss.
 * @param {import('./capture-page.mjs').PageMeasure} measured
 * @param {number} unmeasured
 * @returns {{ measured: import('./capture-page.mjs').PageMeasure, unmeasured: number }}
 */
export function fitMeasure(measured, unmeasured) {
  let over = jsonbBytes(measured) - MEASURE_BYTES
  if (over <= 0) return { measured, unmeasured }
  const kept = {
    framing: [...measured.framing],
    shown: [...measured.shown],
    sections: [...measured.sections],
    blocks: [...measured.blocks],
  }
  let left = 0
  for (const key of /** @type {const} */ (['framing', 'shown', 'sections', 'blocks'])) {
    /** @type {unknown[]} */
    const items = kept[key]
    while (over > 0 && items.length > 0) {
      over -= jsonbBytes(items.pop()) + 2
      if (key !== 'sections') left += 1
    }
  }
  return { measured: { ...measured, ...kept }, unmeasured: unmeasured + left }
}

/**
 * What a target's measure left out, as blocks_visible names it: labels, texts and runs past the receipt's bound, and texts
 * whose lines the cover check's bounds (of points, of lines a text, and of time) did not reach, that lie past what a
 * scroll of the window shows, or that are not set along the page's lines, which it cannot look along (#117).
 * @param {number} unmeasured
 * @param {number} unsampled
 */
function unreached(unmeasured, unsampled) {
  return [
    unmeasured > 0
      ? `${unmeasured} labels, texts, runs or blocks left out of the measure (at most ${MAX_MEASURED} of each kind, within ${MEASURE_BYTES / 1024} KiB a target)`
      : '',
    unsampled > 0
      ? `${unsampled} texts the cover check did not reach: past its bounds (${MAX_POINTS} points, under ${MAX_LINES} lines a text, ${MAX_LOOK_MS / 1000} s), off the window, or not set along the page's lines (vertical, turned or mirrored)`
      : '',
  ]
}

/**
 * The platform fonts the page's text was actually drawn with (CSS.getPlatformFontsForNode), over its headings and up
 * to forty of its blocks.
 * @param {import('playwright-core').CDPSession} cdp
 * @returns {Promise<string[]>}
 */
async function fontsUsed(cdp) {
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'h1, h2, h3, [data-block]',
  })
  /** @type {Set<string>} */
  const names = new Set()
  for (const nodeId of nodeIds.slice(0, 40)) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    for (const f of fonts) names.add(f.familyName)
  }
  return [...names].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Load the entry at one target and wait for its fonts.
 * @param {import('playwright-core').Page} page
 * @param {Target} target
 * @param {string} url
 * @param {number} timeoutMs
 */
async function loadAt(page, target, url, timeoutMs) {
  await page.setViewportSize({ width: target.width, height: target.height })
  await page.emulateMedia({ media: 'screen', colorScheme: target.scheme, reducedMotion: 'reduce' })
  await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
  await page.evaluate('document.fonts.ready.then(() => true)')
}

/**
 * Whether the page script's answer has the shape the kernel relies on (the script is this package's own code).
 * @param {unknown} value
 * @returns {value is import('./capture-page.mjs').PageAnswer}
 */
function isMeasure(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['width', 'height', 'overflowPx', 'unmeasured'].every((k) => typeof Reflect.get(value, k) === 'number') &&
    ['blocks', 'sections', 'overflowing'].every((k) => Array.isArray(Reflect.get(value, k)))
  )
}

/**
 * The page's measure at the current target, or band end, within a look budget. Where the page's generated boxes lie is
 * read first through the protocol, within the same budget, for the measure to read the paint beneath a text by
 * (placement.mjs generatedAt, #117); unread, the paint beneath any text whose element or an element around it draws
 * one is unread, and that text's contrast unknown.
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').CDPSession} cdp
 * @param {number} [maxLookMs]
 */
async function measure(page, cdp, maxLookMs = MAX_LOOK_MS) {
  const until = Date.now() + maxLookMs
  const generated = await generatedAt(cdp, until)
  const left = Math.max(0, until - Date.now())
  /** @type {unknown} */
  const value = await page.evaluate(pageScript({ maxListed: MAX_LISTED, maxLookMs: left, generated }))
  if (!isMeasure(value)) throw new CaptureFailure('measure_failed', 'the page could not be measured')
  return value
}

/**
 * What is drawn over a text where only the DevTools protocol can tell: the text's element draws generated content that
 * could reach it, and a pseudo-element hit-tests as that element (capture-page.mjs coverOf). The protocol names the
 * pseudo-element when one is on top at a point, whatever its pointer-events, and the text is then covered (#117). Each
 * point is hit-tested on the page as it opens, the window scrolled to it and back to the top, within a budget of
 * points and of time; the points, and whether the page's budget ran out, are then dropped from the measure, which
 * counts the texts it did not reach.
 * @param {Shot} shot
 * @param {import('playwright-core').Page} page
 * @param {Omit<import('./capture-page.mjs').PageAnswer, 'unmeasured'>} answer
 * @param {number} [deadline] Date.now() by which to stop, at most MAX_LOOK_MS from now (a sweep's own, when less)
 * @returns {Promise<{ measured: import('./capture-page.mjs').PageMeasure, unsampled: number }>}
 */
async function generatedCover(shot, page, answer, deadline = Date.now() + MAX_LOOK_MS) {
  const all = [...answer.blocks, ...answer.shown, ...answer.framing]
  const probed = all.filter((m) => m.probes.length > 0)
  if (probed.length > 0) {
    await shot.cdp.send('DOM.enable')
    /** @type {View} */
    const view = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, w: innerWidth, h: innerHeight }))
    const look = { plain: new Set(), until: Math.min(Date.now() + MAX_LOOK_MS, deadline) }
    let left = MAX_PROBES
    for (const m of probed) {
      if (m.probes.length > left || Date.now() > look.until) {
        m.unsampled = true
        continue
      }
      left -= m.probes.length
      const verdict = await pseudoOnTop(shot, page, m.probes, view, look)
      if (verdict === 'covered') m.issues.push('covered')
      if (verdict === 'unreached') m.unsampled = true
    }
    await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }))
  }
  const measured = {
    ...answer,
    blocks: withoutProbe(answer.blocks),
    shown: withoutProbe(answer.shown),
    framing: withoutProbe(answer.framing),
  }
  return { measured, unsampled: all.filter((m) => m.unsampled).length }
}

/** @typedef {{ x: number, y: number, w: number, h: number }} View the window's scroll and size */

/**
 * The most points the DevTools protocol hit-tests on one page, at one target, within the cover check's time: a text
 * whose points do not fit in what is left of them is not reached, and its target fails as unmeasured (#117).
 */
const MAX_PROBES = 20_000

/**
 * Whether a pseudo-element is the topmost thing at any of a text's points, by the protocol's hit test. It hit-tests
 * only what the viewport shows, and takes page coordinates: the points the viewport shows are hit-tested together,
 * and the window scrolls to the next one it does not; a point no scroll brings into view leaves the text 'unreached'
 * (the target then fails as unmeasured), as does the check's time running out. Nodes already known to be no
 * pseudo-element are not described again.
 * @param {Shot} shot
 * @param {import('playwright-core').Page} page
 * @param {{ x: number, y: number }[]} points in page coordinates
 * @param {View} view updated as the window scrolls
 * @param {{ plain: Set<number>, until: number }} look the nodes known to be no pseudo-element, and the time (Date.now)
 *   the check must stop by
 * @returns {Promise<'clear' | 'covered' | 'unreached'>}
 */
async function pseudoOnTop(shot, page, points, view, look) {
  const seen = (/** @type {{ x: number, y: number }} */ p) =>
    p.x >= view.x && p.x < view.x + view.w && p.y >= view.y && p.y < view.y + view.h
  let rest = points
  while (rest.length > 0) {
    if (Date.now() > look.until) return 'unreached'
    const shown = rest.filter(seen)
    if (shown.length === 0) {
      Object.assign(view, await scrollTo(page, rest[0] ?? { x: 0, y: 0 }))
      if (!rest.some(seen)) return 'unreached'
      continue
    }
    rest = rest.filter((p) => !seen(p))
    const hits = await Promise.all(
      shown.map((p) => shot.cdp.send('DOM.getNodeForLocation', { ...p, ignorePointerEventsNone: true })),
    )
    const fresh = [...new Set(hits.map((h) => h.backendNodeId))].filter((id) => !look.plain.has(id))
    const nodes = await Promise.all(fresh.map((id) => shot.cdp.send('DOM.describeNode', { backendNodeId: id })))
    if (nodes.some(({ node }) => node.pseudoType)) return 'covered'
    for (const id of fresh) look.plain.add(id)
  }
  return 'clear'
}

/**
 * Scroll the window so a point is in the middle of the viewport, as far as the page allows.
 * @param {import('playwright-core').Page} page
 * @param {{ x: number, y: number }} point in page coordinates
 * @returns {Promise<View>}
 */
function scrollTo(page, point) {
  return page.evaluate(({ x, y }) => {
    window.scrollTo({ left: x - innerWidth / 2, top: y - innerHeight / 2, behavior: 'instant' })
    return { x: window.scrollX, y: window.scrollY, w: innerWidth, h: innerHeight }
  }, point)
}

/**
 * Measures as the receipt holds them: the probe points and the budget flag are the kernel's own.
 * @param {import('./capture-page.mjs').ProbedMeasure[]} list
 * @returns {import('./capture-page.mjs').BlockMeasure[]}
 */
function withoutProbe(list) {
  return list.map(({ probes: _probes, unsampled: _unsampled, ...m }) => m)
}

/**
 * The widths at which a media condition can change, in CSS pixels, or null when it tests anything but a screen's width
 * in pixels: the profile holds a page to those (css.ts), and the sweep reads no other.
 * @param {string} condition as the browser serializes it
 * @returns {number[] | null}
 */
export function breakpointsOf(condition) {
  const rest = condition
    .toLowerCase()
    .replaceAll(/-?\d+(?:\.\d+)?px/gu, ' ')
    .replaceAll(/\b(?:only|screen|all|and|or|not|min-width|max-width|width)\b/gu, ' ')
    .replaceAll(/[\s():<>=,]/gu, '')
  if (rest !== '') return null
  return [...condition.matchAll(/(-?\d+(?:\.\d+)?)px/giu)].map((m) => Number(m[1]))
}

/**
 * The widths the sweep measures: both ends of every band of window widths in which the page's media conditions hold
 * or fail alike. A breakpoint v is crossed between v−1 and v, or v and v+1 (min-, max-, < or >), so every band's ends
 * are among those widths and the sweep's own ends; the conditions are read at each, and widths that agree in a row are
 * one band.
 * @param {number[]} breakpoints
 * @param {(width: number) => Promise<string>} stateAt which conditions hold at a width
 * @returns {Promise<number[]>}
 */
export async function bandEnds(breakpoints, stateAt) {
  /** @type {Set<number>} */
  const widths = new Set([SWEEP.minWidth, SWEEP.maxWidth])
  for (const v of breakpoints)
    for (const w of [Math.floor(v) - 1, Math.floor(v), Math.floor(v) + 1])
      if (w >= SWEEP.minWidth && w <= SWEEP.maxWidth) widths.add(w)
  const sorted = [...widths].toSorted((a, b) => a - b)
  /** @type {number[]} */
  const ends = []
  let state = ''
  for (const [i, width] of sorted.entries()) {
    const now = await stateAt(width)
    if (i > 0 && now === state) continue
    const before = sorted[i - 1]
    if (before !== undefined) ends.push(before)
    ends.push(width)
    state = now
  }
  ends.push(SWEEP.maxWidth)
  return [...new Set(ends)].toSorted((a, b) => a - b)
}

/**
 * Why a page's media conditions keep the sweep from measuring its bands, or null when it can: a condition it cannot
 * read, a breakpoint past the widths it measures, or more breakpoints than it measures.
 * @param {{ conditions: string[], unreadable: string[] }} media
 * @returns {{ issue: string } | { breakpoints: number[] }}
 */
export function sweepPlan(media) {
  const points = media.conditions.map((c) => ({ c, at: breakpointsOf(c) }))
  const unread = [...media.unreadable, ...points.filter((p) => p.at === null).map((p) => p.c)]
  if (unread.length > 0) return { issue: `width conditions the sweep cannot read: ${listed(unread)}` }
  const breakpoints = [...new Set(points.flatMap((p) => p.at ?? []))]
  const outside = breakpoints.filter((v) => v < SWEEP.minWidth || v > SWEEP.maxWidth)
  if (outside.length > 0)
    return {
      issue: `breakpoints past the ${SWEEP.minWidth}–${SWEEP.maxWidth}px the sweep measures: ${outside.join(', ')}px`,
    }
  if (breakpoints.length > SWEEP.maxBreakpoints)
    return {
      issue: `${breakpoints.length} width breakpoints, more than the ${SWEEP.maxBreakpoints} the sweep measures`,
    }
  return { breakpoints }
}

/**
 * What a measure at a band end shows wrong, or null: a block or a text outside the blocks hidden, cut, covered, set
 * beside other text or off the page, or in low contrast, horizontal overflow, text the measure did not reach, or (when
 * the job names its sections) text of one drawn outside it (outsideScope).
 * A contrast it cannot read is a limitation, as at a target.
 * @param {import('./capture-page.mjs').PageMeasure} page
 * @param {number} missed labels, texts and runs left out, and texts the cover check did not reach
 * @param {string[] | null} requested the sections the job names, or null for every one (outsideScope)
 * @returns {string | null}
 */
function bandIssue(page, missed, requested) {
  const unseen = [
    ...new Set([
      ...page.blocks.filter((m) => hiddenHere(m) || m.issues.includes('low_contrast')),
      // A text outside the blocks is held to what a block is at a band end as at a target, its contrast included (#117).
      ...[...page.shown, ...page.framing].filter((m) => textHiddenHere(m) || m.issues.includes('low_contrast')),
      ...outsideScope(page, requested),
    ]),
  ]
  const parts = [
    unseen.length > 0 ? listed(unseen.map((m) => m.id)) : '',
    page.overflowPx > 0 ? `${page.overflowPx}px past the width` : '',
    missed > 0 ? `${missed} texts not measured` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Measure each band end, as at a target, and read and compare its placements (placement.mjs), within the sweep's time:
 * each band end's placements, the last's included, fail when read or compared past it (placementStep). What is wrong
 * goes to `wrong`.
 * @param {import('playwright-core').Page} page
 * @param {Shot} shot
 * @param {{ ends: number[], conditions: string[], until: number, sweepMs: number }} sweep
 * @param {string[]} wrong
 */
async function measureEnds(page, shot, sweep, wrong) {
  /** @type {import('./placement.mjs').BandEnd | null} */
  let before = null
  for (const [i, width] of sweep.ends.entries()) {
    const left = sweep.until - Date.now()
    if (left <= 0) {
      wrong.push(`${sweep.ends.length - i} band ends not measured within ${sweep.sweepMs / 1000} s`)
      return
    }
    await page.setViewportSize({ width, height: SWEEP.height })
    const { unmeasured, ...answer } = await measure(page, shot.cdp, left)
    const { measured, unsampled } = await generatedCover(shot, page, answer, sweep.until)
    const issue = bandIssue(measured, unmeasured + unsampled, shot.job.sections ?? null)
    if (issue) wrong.push(`at ${width}px: ${issue}`)
    /** @type {{ state: string }} */
    const { state } = await page.evaluate(structureScript(sweep.conditions, false))
    const step = await placementStep(() => layoutAt(shot.cdp), { width, state }, before, sweep.until)
    if (step.issue) wrong.push(step.issue)
    before = step.end
  }
}

/**
 * The width sweep (SWEEP): the page measured, without capturing, at both ends of every band its media conditions
 * make, and of every band a container's lines changing inside one make where it holds placed boxes (layoutChanges),
 * as at a target. Its check fails on what any band end shows wrong, on placed boxes and texts that may meet between a
 * band's ends, and on any band end it could not measure.
 * @param {import('playwright-core').Page} page
 * @param {Shot} shot
 * @param {number} sweepMs
 * @returns {Promise<Check>}
 */
async function sweepWidths(page, shot, sweepMs) {
  const until = Date.now() + sweepMs
  /** @type {{ conditions: string[], unreadable: string[] }} */
  const media = await page.evaluate(conditionsScript())
  const plan = sweepPlan(media)
  if ('issue' in plan) return check('widths_visible', 'failed', plan.issue)
  const holding = `(${JSON.stringify(media.conditions)}).map((q) => matchMedia(q).matches).join()`
  const bands = await bandEnds(plan.breakpoints, async (width) => {
    await page.setViewportSize({ width, height: SWEEP.height })
    return String(await page.evaluate(holding))
  })
  /** @type {import('./placement.mjs').Probe} */
  const probe = async (width, withPlaced) => {
    await page.setViewportSize({ width, height: SWEEP.height })
    /** @type {{ state: string, placed: boolean }} */
    const structure = await page.evaluate(structureScript(media.conditions, withPlaced))
    return structure
  }
  const { ends, issue } = await layoutChanges(probe, bands, until)
  /** @type {string[]} */
  const wrong = issue ? [issue] : []
  await measureEnds(page, shot, { ends, conditions: media.conditions, until, sweepMs }, wrong)
  return wrong.length > 0
    ? check('widths_visible', 'failed', wrong.join('; ').slice(0, 2000))
    : check('widths_visible', 'passed', `measured at ${ends.join(', ')}px`.slice(0, 2000))
}

/**
 * Measure and capture every target of the job.
 * @param {import('playwright-core').Page} page
 * @param {Shot} shot
 * @param {{ url: string, timeoutMs: number, sweepMs: number }} entry
 */
async function captureAll(page, shot, entry) {
  for (const id of shot.job.targets) {
    const target = CAPTURE_TARGETS[id]
    if (!target) throw new CaptureFailure('invalid_target', id)
    await loadAt(page, target, entry.url, entry.timeoutMs)
    const { unmeasured, ...answer } = await measure(page, shot.cdp)
    const { measured, unsampled } = await generatedCover(shot, page, answer)
    if (shot.receipt.fonts.length === 0) shot.receipt.fonts = await fontsUsed(shot.cdp)
    const coverage = await captureTarget(shot, target, measured)
    const fit = fitMeasure(measured, unmeasured)
    shot.receipt.targets.push({
      id,
      width: target.width,
      height: target.height,
      scheme: target.scheme,
      page: fit.measured,
      coverage,
    })
    shot.receipt.checks.push(...targetChecks(target, measured, coverage, fit.unmeasured, unsampled))
  }
  shot.receipt.checks.push(await sweepWidths(page, shot, entry.sweepMs))
}

/**
 * What a capture that names its sections would not show at full size: in an edit that may change those sections only,
 * a block, label or text of one of them drawn outside that section's box, where no tile of it reaches. Without this, a
 * heading placed with `position: absolute` past its section was seen only in the scaled-down overview (#117).
 * @param {import('./capture-page.mjs').PageMeasure} page
 * @param {string[] | null} requested the sections the job names, or null for every one
 */
function outsideScope(page, requested) {
  if (!requested) return []
  const boxes = new Map(page.sections.map((s) => [s.id, s]))
  return [...page.blocks, ...page.shown, ...page.framing].filter((m) => {
    const section = m.section !== null && requested.includes(m.section) ? boxes.get(m.section) : undefined
    return section !== undefined && (m.box.width > 0 || m.box.height > 0) && !within(m.box, section)
  })
}

/**
 * Whether one box lies inside another, give or take a pixel.
 * @param {{ x: number, y: number, width: number, height: number }} inner
 * @param {{ x: number, y: number, width: number, height: number }} outer
 */
function within(inner, outer) {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  )
}

/**
 * Whether a measured block is not shown at this target: hidden, cut, covered or off the page. Low contrast still shows
 * it, and so does a scrolling container: the reader scrolls to it, and its text is the research's.
 * @param {import('./capture-page.mjs').BlockMeasure} m
 */
function hiddenHere(m) {
  return m.issues.some((i) => i !== 'low_contrast' && i !== 'scrolls')
}

/**
 * Where the text a target shows sits: its blocks, and the texts outside them, that it does not hide (marginsOf).
 * @param {import('./capture-page.mjs').PageMeasure} page
 */
function shownBoxes(page) {
  return [
    ...page.blocks.filter((m) => !hiddenHere(m)),
    ...[...page.shown, ...page.framing].filter((m) => !textHiddenHere(m)),
  ].map((m) => m.box)
}

/**
 * Whether a measured text outside the blocks (a shown label, a heading, a caption…) is not shown at this target. Held
 * tighter than a block: one a scrolling container does not show where the page starts is in no capture, so no one
 * reviewed it (#117).
 * @param {import('./capture-page.mjs').BlockMeasure} m
 */
function textHiddenHere(m) {
  return m.issues.some((i) => i !== 'low_contrast')
}

/**
 * Close the browser; if it does not close in time, kill its namespace.
 * @param {import('./confine.mjs').ConfinedBrowser} browser
 */
async function shutDown(browser) {
  const timer = setTimeout(() => browser.kill(), 5000)
  try {
    await browser.close()
  } catch {
    browser.kill()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @typedef {{ job: CaptureJob, signal: AbortSignal, receipt: CaptureReceipt, env: NodeJS.ProcessEnv | undefined,
 *   sweepMs: number }} Run
 */

/**
 * The browser's first page with the request policy, after the sandbox self-test.
 * @param {import('./confine.mjs').ConfinedBrowser} browser
 * @param {Run} run
 * @param {string} entryUrl
 */
async function confinedPage(browser, run, entryUrl) {
  const page = browser.context.pages()[0] ?? (await browser.context.newPage())
  await installRequestPolicy(page, entryUrl, run.receipt.blockedRequests)
  run.receipt.renderer.browser = browser.version
  run.receipt.sandbox = browser.selfTest()
  run.receipt.checks.push(
    check(
      'sandbox_active',
      run.receipt.sandbox.active ? 'passed' : 'failed',
      run.receipt.sandbox.reasons.join('; ') || null,
    ),
  )
  if (!run.receipt.sandbox.active)
    throw new CaptureFailure('sandbox_inactive', 'Chromium is not confined and sandboxed')
  return page
}

/**
 * Launch, capture, and always shut the browser down and remove its scratch.
 * @param {Run} run
 * @param {import('./source-manifest.mjs').VerifiedSource} source
 */
async function inConfinedBrowser(run, source) {
  const workDir = fs.mkdtempSync(path.join(run.job.scratchDir ?? os.tmpdir(), 'sophia-capture-'))
  /** @type {import('./confine.mjs').ConfinedBrowser | null} */
  let browser = null
  const onAbort = () => browser?.kill()
  run.signal.addEventListener('abort', onAbort, { once: true })
  try {
    browser = await launchConfined({ workDir, env: run.env })
    run.signal.throwIfAborted()
    const page = await confinedPage(browser, run, source.entry.url)
    const cdp = await page.context().newCDPSession(page)
    const shot = {
      cdp,
      job: run.job,
      receipt: run.receipt,
      budget: { captures: CAPTURE_LIMITS.captures, bytes: CAPTURE_LIMITS.totalBytes },
    }
    await captureAll(page, shot, {
      url: source.entry.url,
      timeoutMs: run.job.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      sweepMs: run.sweepMs,
    })
    run.signal.throwIfAborted()
    finalChecks(run.receipt, source)
    if (jsonbBytes(run.receipt) > RECEIPT_BYTES)
      throw new CaptureFailure('receipt_too_large', "the page's measures and coverage do not fit a receipt")
  } finally {
    run.signal.removeEventListener('abort', onAbort)
    if (browser) await shutDown(browser)
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

/**
 * Requests and source integrity, after every target: either fails the capture.
 * @param {CaptureReceipt} receipt
 * @param {import('./source-manifest.mjs').VerifiedSource} source
 */
function finalChecks(receipt, source) {
  receipt.blockedRequests = [...new Set(receipt.blockedRequests)].slice(0, MAX_LISTED)
  receipt.checks.push(check('requests_contained', receipt.blockedRequests.length === 0 ? 'passed' : 'failed'))
  if (receipt.blockedRequests.length > 0)
    throw new CaptureFailure('blocked_request', 'the page asked for a resource outside itself')
  const unchanged = sourceUnchanged(source)
  receipt.checks.push(check('source_unchanged', unchanged ? 'passed' : 'failed'))
  if (!unchanged) throw new CaptureFailure('source_changed', 'the source changed while it was captured')
}

/**
 * The job's language, targets and sections, and its source, verified before any browser starts.
 * @param {Run} run
 */
function verified(run) {
  const { job } = run
  if (typeof job.language !== 'string' || !LANGUAGE.test(job.language))
    throw new CaptureFailure('invalid_language', 'language is a BCP 47 tag')
  if (
    job.targets.length === 0 ||
    new Set(job.targets).size !== job.targets.length ||
    job.targets.some((t) => !(t in CAPTURE_TARGETS))
  ) {
    throw new CaptureFailure('invalid_target', 'targets name each admitted target at most once')
  }
  if (job.sections && (job.sections.length === 0 || job.sections.some((s) => !SECTION_ID.test(s)))) {
    throw new CaptureFailure('invalid_sections', 'sections name section ids')
  }
  const source = verifySource({ sourceRoot: job.sourceRoot, entry: job.entry, assets: [] })
  run.receipt.source = {
    manifestSha256: source.manifestSha256,
    entry: { path: source.entry.path, sha256: source.entry.sha256 },
  }
  run.receipt.checks.push(check('source_verified', 'passed'))
  return source
}

/**
 * The receipt's ending for an error, by its kind.
 * @param {CaptureReceipt} receipt
 * @param {unknown} error
 * @param {{ cancelled: boolean, timedOut: boolean }} how
 */
function settleError(receipt, error, how) {
  receipt.status = how.cancelled ? 'cancelled' : 'failed'
  if (how.cancelled) receipt.error = { code: 'cancelled', message: 'The capture was cancelled.' }
  else if (how.timedOut) receipt.error = { code: 'timeout', message: 'The capture ran past its time limit.' }
  else if (error instanceof CaptureFailure || error instanceof ManifestError)
    receipt.error = { code: error.code, message: error.message }
  else if (
    error instanceof Error &&
    error.name === 'ConfinementError' &&
    'code' in error &&
    typeof error.code === 'string'
  )
    receipt.error = { code: error.code, message: error.message }
  else
    receipt.error = {
      code: 'capture_error',
      message: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
    }
}

/**
 * Capture one page. Never throws for a job's own failure: the receipt says what happened, and a failed or cancelled
 * capture keeps no image.
 * @param {CaptureJob} job
 * @param {{ signal?: AbortSignal, env?: NodeJS.ProcessEnv, sweepMs?: number }} [opts] `sweepMs`: the width sweep's
 *   time, SWEEP.maxMs unless a test gives less
 * @returns {Promise<CaptureReceipt>}
 */
export async function captureHtml(job, opts = {}) {
  const started = Date.now()
  const receipt = newReceipt(job)
  const timeout = AbortSignal.timeout(job.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const run = { job, signal, receipt, env: opts.env, sweepMs: Math.min(opts.sweepMs ?? SWEEP.maxMs, SWEEP.maxMs) }
  try {
    const source = verified(run)
    signal.throwIfAborted()
    await inConfinedBrowser(run, source)
    receipt.status = 'succeeded'
  } catch (error) {
    const cancelled = opts.signal?.aborted === true
    settleError(receipt, error, { cancelled, timedOut: timeout.aborted && !cancelled })
    for (const c of receipt.captures) fs.rmSync(path.join(job.outputDir, c.name), { force: true })
    receipt.captures = []
    // A failed receipt still settles: what would not fit is not kept.
    if (jsonbBytes(receipt) > RECEIPT_BYTES) receipt.targets = []
  }
  receipt.elapsedMs = Date.now() - started
  return receipt
}

/**
 * A list of strings, or null when the value is not one.
 * @param {unknown} v
 */
const list = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.map(String) : null)

/**
 * A job file's contents as a job, or why not. The browser is the operator's (SOPHIA_CHROMIUM_PATH), never a job's.
 * @param {unknown} value
 * @returns {CaptureJob}
 */
export function asCaptureJob(value) {
  if (typeof value !== 'object' || value === null) throw new CaptureFailure('invalid_job', 'a job is a JSON object')
  /** @type {Record<string, unknown>} */
  const fields = { ...value }
  const text = (/** @type {string} */ key) => {
    const v = fields[key]
    if (typeof v !== 'string') throw new CaptureFailure('invalid_job', `${key} is a string`)
    return v
  }
  const targets = list(fields.targets)
  if (!targets) throw new CaptureFailure('invalid_job', 'targets is a list of target ids')
  return {
    sourceRoot: text('sourceRoot'),
    outputDir: text('outputDir'),
    language: text('language'),
    entry: fields.entry,
    targets,
    sections: list(fields.sections),
    ...(typeof fields.jobId === 'string' ? { jobId: fields.jobId } : {}),
    ...(typeof fields.scratchDir === 'string' ? { scratchDir: fields.scratchDir } : {}),
    ...(typeof fields.timeoutMs === 'number' ? { timeoutMs: fields.timeoutMs } : {}),
  }
}

/** @param {string[]} argv */
async function main(argv) {
  const at = argv.indexOf('--job')
  const jobFile = at >= 0 ? argv[at + 1] : undefined
  if (!jobFile || argv.length !== 2) {
    process.stderr.write('usage: capture-html.mjs --job <job.json>\n')
    return 2
  }
  const job = asCaptureJob(JSON.parse(fs.readFileSync(jobFile, 'utf8')))
  const controller = new AbortController()
  process.once('SIGTERM', () => controller.abort())
  process.once('SIGINT', () => controller.abort())
  const receipt = await captureHtml(job, { signal: controller.signal })
  fs.writeFileSync(path.join(job.outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
  process.stderr.write(
    `[capture-html] ${receipt.status}${receipt.error ? ` ${receipt.error.code}` : ''} ${receipt.captures.length} captures\n`,
  )
  return receipt.status === 'succeeded' ? 0 : 1
}

/** Whether this file is the command being run: never an error, whatever the process's first argument is. */
function isMain() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1] ?? '') === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isMain()) process.exitCode = await main(process.argv.slice(2))
