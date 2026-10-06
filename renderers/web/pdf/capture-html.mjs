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
import { MAX_MEASURED, pageScript } from './capture-page.mjs'
import { launchConfined, playwrightVersion } from './confine.mjs'
import { ManifestError, sha256Hex, sourceUnchanged, verifySource } from './source-manifest.mjs'

export const CAPTURE_RECEIPT_SCHEMA = 'sophia.html-capture-receipt.v1'
const HERE = path.dirname(fileURLToPath(import.meta.url))
/** The files whose code decides a capture and its measures (the capture kernel's identity). */
export const CAPTURE_KERNEL_FILES = [
  'capture-html.mjs',
  'capture-page.mjs',
  'confine.mjs',
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
 * The stretches of the page outside every section, at least MARGIN_MIN_PX tall.
 * @param {{ y: number, height: number }[]} sections
 * @param {number} pageHeight
 */
export function marginsOf(sections, pageHeight) {
  /** @type {{ y: number, height: number }[]} */
  const out = []
  let at = 0
  for (const s of sections.toSorted((a, b) => a.y - b.y)) {
    if (s.y - at >= MARGIN_MIN_PX) out.push({ y: at, height: s.y - at })
    at = Math.max(at, s.y + s.height)
  }
  if (pageHeight - at >= MARGIN_MIN_PX) out.push({ y: at, height: pageHeight - at })
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
  const margins = shot.job.sections ? [] : marginsOf(page.sections, depth)
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
 * left unmeasured past the receipt's bound fail blocks_visible.
 * @param {Target} target
 * @param {import('./capture-page.mjs').PageMeasure} page
 * @param {Coverage} coverage
 * @param {number} [unmeasured]
 * @returns {Check[]}
 */
export function targetChecks(target, page, coverage, unmeasured = 0) {
  // A shown label (one a tooltip, an accessible name or an ID reference rests on) is held to what a block is. Other
  // text outside the blocks is read for contrast wherever this target shows it (#117); where it is shown at no target
  // at all, captureAll fails it.
  const measured = [...page.blocks, ...page.shown]
  const read = [...measured, ...page.framing.filter((m) => !hiddenHere(m))]
  const unseen = measured.filter(hiddenHere)
  const low = read.filter((b) => b.issues.includes('low_contrast'))
  const unknown = read.filter((b) => b.contrast.ratio === null)
  const ids = (/** @type {{ id: string }[]} */ list) =>
    list
      .slice(0, MAX_LISTED)
      .map((b) => b.id)
      .join(', ')
  const hidden = [
    ids(unseen),
    unmeasured > 0 ? `${unmeasured} more labels or texts outside the blocks than the ${MAX_MEASURED} measured` : '',
  ].filter(Boolean)
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
      coverage.missing.length > 0 ? `uncaptured: ${coverage.missing.join(', ')}` : null,
      target.id,
    ),
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
 * The page's measure at the current target.
 * @param {import('playwright-core').Page} page
 */
async function measure(page) {
  /** @type {unknown} */
  const value = await page.evaluate(pageScript({ maxListed: MAX_LISTED }))
  if (!isMeasure(value)) throw new CaptureFailure('measure_failed', 'the page could not be measured')
  return value
}

/**
 * Measure and capture every target of the job.
 * @param {import('playwright-core').Page} page
 * @param {Shot} shot
 * @param {{ url: string, timeoutMs: number }} entry
 */
async function captureAll(page, shot, entry) {
  for (const id of shot.job.targets) {
    const target = CAPTURE_TARGETS[id]
    if (!target) throw new CaptureFailure('invalid_target', id)
    await loadAt(page, target, entry.url, entry.timeoutMs)
    const { unmeasured, ...measured } = await measure(page)
    if (shot.receipt.fonts.length === 0) shot.receipt.fonts = await fontsUsed(shot.cdp)
    const coverage = await captureTarget(shot, target, measured)
    shot.receipt.targets.push({
      id,
      width: target.width,
      height: target.height,
      scheme: target.scheme,
      page: measured,
      coverage,
    })
    shot.receipt.checks.push(...targetChecks(target, measured, coverage, unmeasured))
  }
  // Text outside the blocks that no target shows (kept for print, for a width no capture takes, or for assistive
  // technology alone) is text no reviewer saw: each target's blocks_visible names it (#117).
  const unseen = hiddenEverywhere(shot.receipt.targets.map((t) => t.page))
  if (unseen.length > 0)
    for (const c of shot.receipt.checks.filter((k) => k.name === 'blocks_visible')) {
      c.outcome = 'failed'
      c.detail = [c.detail, `text hidden at every target: ${unseen.slice(0, MAX_LISTED).join(', ')}`]
        .filter(Boolean)
        .join('; ')
        .slice(0, 2000)
    }
}

/**
 * Whether a measured element is not shown at this target: hidden, cut, covered or off the page. Low contrast, or a
 * scrolling container, still shows it.
 * @param {import('./capture-page.mjs').BlockMeasure} m
 */
function hiddenHere(m) {
  return m.issues.some((i) => i !== 'low_contrast' && i !== 'scrolls')
}

/**
 * Whether a measured element's text is not seen: not shown here, or all but invisible against what is behind it.
 * @param {import('./capture-page.mjs').BlockMeasure} m
 */
function isUnseen(m) {
  return hiddenHere(m) || (m.contrast.ratio !== null && m.contrast.ratio < 1.5)
}

/**
 * The text outside the blocks that is not seen at any measured target: hidden, cut, covered, off the page, or all but
 * invisible against what is behind it at each one.
 * @param {import('./capture-page.mjs').PageMeasure[]} pages
 * @returns {string[]}
 */
export function hiddenEverywhere(pages) {
  const [first, ...rest] = pages.map((p) => new Set(p.framing.filter(isUnseen).map((m) => m.id)))
  return first ? [...first].filter((id) => rest.every((at) => at.has(id))) : []
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

/** @typedef {{ job: CaptureJob, signal: AbortSignal, receipt: CaptureReceipt, env: NodeJS.ProcessEnv | undefined }} Run */

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
    await captureAll(page, shot, { url: source.entry.url, timeoutMs: run.job.timeoutMs ?? DEFAULT_TIMEOUT_MS })
    run.signal.throwIfAborted()
    finalChecks(run.receipt, source)
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
 * @param {{ signal?: AbortSignal, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<CaptureReceipt>}
 */
export async function captureHtml(job, opts = {}) {
  const started = Date.now()
  const receipt = newReceipt(job)
  const timeout = AbortSignal.timeout(job.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const run = { job, signal, receipt, env: opts.env }
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
