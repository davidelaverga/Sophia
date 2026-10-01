#!/usr/bin/env node
// Render one static HTML report and its verified assets to an A4 PDF in a confined headless Chromium (SMC-M03 S5,
// architecture 14). Adapted from Sophia-Agent's render_html_to_pdf.mjs (davidelaverga/Sophia-Agent@d467ab97, blob
// f2e808cf; MIT, THIRD_PARTY_LEGACY_LICENSE.txt). Kept from the donor: page JavaScript off, a deny-by-default
// request policy where a blocked or missing asset is fatal, print media, A4 with backgrounds and a page-number
// footer, the visible-SVG count. Changed:
// - the root is explicit and every file is verified by hash before launch (source-manifest.mjs), not guessed;
// - the browser runs confined with its sandbox on and a self-test that fails closed (confine.mjs), never
//   `--no-sandbox`;
// - `data:` and `blob:` load only as images, and a file loads only as one of the manifest's images;
// - the document gets its language and CSS that wraps long URLs and code, and a CDP probe measures horizontal
//   overflow at the printable width ("unavailable" when it cannot, never a zero);
// - the result is a structured receipt (receipt.json) instead of a line of prose, and cancelling kills the
//   namespace.
// Usage: render-html.mjs --job <job.json>. The job names sourceRoot, entry, assets, language and outputDir; the
// receipt and report.pdf land in outputDir. Exit 0 when the render succeeded, 1 when it failed or was cancelled.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { launchConfined, playwrightVersion } from './confine.mjs'
import { pdfFacts } from './pdf-facts.mjs'
import { ASSET_EXTENSIONS, ManifestError, sha256Hex, sourceUnchanged, verifySource } from './source-manifest.mjs'

export const RECEIPT_SCHEMA = 'sophia.pdf-render-receipt.v1'
export const OUTPUT_NAME = 'report.pdf'
const DONOR = {
  repository: 'davidelaverga/Sophia-Agent',
  commit: 'd467ab97464908b4e7c7752701eee9d24db7faf6',
  path: 'backend/packages/harness/deerflow/sophia/js/render_html_to_pdf.mjs',
  blob: 'f2e808cf5e7c4f6514c1bb912c361dd6c21eba7d',
}
const HERE = path.dirname(fileURLToPath(import.meta.url))
const KERNEL_FILES = ['render-html.mjs', 'confine.mjs', 'source-manifest.mjs', 'pdf-facts.mjs', 'bin/confine-chromium']

// Right-aligned page numbers so the author never computes pagination (the donor's footer); the header stays empty.
const FOOTER_TEMPLATE =
  '<div style="width:100%;font-size:8px;color:#888;padding:0 12mm;text-align:right;">' +
  '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
const HEADER_TEMPLATE = '<div></div>'
const MARGIN_MM = 16
/** The printable width of an A4 page with these margins, in CSS pixels (96 per inch). */
export const PRINT_WIDTH_PX = Math.floor(((210 - 2 * MARGIN_MM) / 25.4) * 96)
const PRINT_HEIGHT_PX = Math.floor(((297 - 2 * MARGIN_MM) / 25.4) * 96)
// Long URLs, identifiers and code wrap instead of running off the page (the forensics' overflow cause).
const WRAP_CSS =
  'a, code, kbd, samp, td, th { overflow-wrap: anywhere; } ' +
  'pre { white-space: pre-wrap; overflow-wrap: anywhere; } img { max-width: 100%; height: auto; }'
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const MAX_LISTED = 20
const DEFAULT_TIMEOUT_MS = 120_000

/** Why a render failed; `code` is stable and lands in the receipt. */
export class RenderFailure extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'RenderFailure'
    this.code = code
  }
}

/** The kernel's identity: its own files' bytes, in a fixed order. */
export function rendererSha256() {
  return sha256Hex(KERNEL_FILES.map((f) => `${f}\0${sha256Hex(fs.readFileSync(path.join(HERE, f)))}\n`).join(''))
}

/**
 * A request named without host paths: a file inside the root by its relative path, any other by scheme and a
 * bounded address.
 * @param {string} url
 * @param {string} root
 */
function describe(url, root) {
  if (!url.startsWith('file:')) return url.slice(0, 200)
  try {
    const relative = path.relative(root, fileURLToPath(url))
    return relative.startsWith('..') || path.isAbsolute(relative)
      ? 'file:<outside the source root>'
      : `file:${relative}`
  } catch {
    return 'file:<unreadable>'
  }
}

/**
 * Whether a file request is one of the manifest's images, by its real path.
 * @param {string} url
 * @param {Map<string, unknown>} images real path → asset
 */
function isManifestImage(url, images) {
  try {
    const real = fs.realpathSync(fileURLToPath(url))
    return images.has(real) && ASSET_EXTENSIONS.has(path.extname(real).toLowerCase())
  } catch {
    return false
  }
}

/**
 * Deny by default: the entry document, `about:blank`, images from `data:`/`blob:`, and the manifest's images.
 * A request for a file inside the root that the manifest does not list is an undeclared asset; anything else is
 * blocked. Both are fatal after the load.
 * @param {import('playwright-core').Page} page
 * @param {import('./source-manifest.mjs').VerifiedSource} source
 */
async function installRequestPolicy(page, source) {
  const images = new Map(source.assets.map((a) => [a.real, a]))
  /** @type {{ blocked: string[], undeclared: string[] }} */
  const seen = { blocked: [], undeclared: [] }
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = request.url()
    const type = request.resourceType()
    const allowed =
      (type === 'document' && (url === source.entry.url || url === 'about:blank')) ||
      (type === 'image' && (url.startsWith('data:') || url.startsWith('blob:'))) ||
      (type === 'image' && url.startsWith('file:') && isManifestImage(url, images))
    if (allowed) return route.continue()
    const named = describe(url, source.root)
    if (named.startsWith('file:') && !named.startsWith('file:<')) seen.undeclared.push(named)
    else seen.blocked.push(`${type}:${named}`)
    return route.abort('blockedbyclient')
  })
  return seen
}

/**
 * The document's language: set from the job when the source names none; a different one is kept and warned about.
 * @param {import('playwright-core').Page} page
 * @param {string} language
 * @returns {Promise<string[]>} warnings
 */
async function applyLanguage(page, language) {
  const declared = await page.evaluate((lang) => {
    const html = document.documentElement
    const current = html.getAttribute('lang')
    if (!current) html.setAttribute('lang', lang)
    return current
  }, language)
  return declared && declared.toLowerCase() !== language.toLowerCase()
    ? [`lang_mismatch: the source declares ${declared.slice(0, 20)}, the job ${language}`]
    : []
}

/**
 * @typedef {{ measurement: 'measured' | 'unavailable', px: number | null, elements: { element: string, rightPx: number }[] }} Overflow
 */

/**
 * Horizontal overflow at the printable width, by CDP (page JavaScript is off): the layout's content width beyond
 * the viewport, and the elements that reach past it. A probe that fails is "unavailable", never a measured zero.
 * @param {import('playwright-core').Page} page
 * @param {(page: import('playwright-core').Page) => Promise<{ cssContentSize?: { width: number } }>} layoutMetrics
 * @returns {Promise<Overflow>}
 */
async function measureOverflow(page, layoutMetrics) {
  let width
  try {
    width = (await layoutMetrics(page)).cssContentSize?.width
  } catch {
    width = undefined
  }
  if (typeof width !== 'number' || !Number.isFinite(width))
    return { measurement: 'unavailable', px: null, elements: [] }
  const px = Math.max(0, Math.ceil(width - PRINT_WIDTH_PX))
  const elements =
    px === 0
      ? []
      : await page.evaluate(
          ({ limit, max }) =>
            [...document.body.querySelectorAll('*')]
              .map((el) => ({ el, right: el.getBoundingClientRect().right }))
              .filter(
                ({ el, right }) =>
                  right > limit + 1 &&
                  !(el.parentElement && el.parentElement.getBoundingClientRect().right > limit + 1),
              )
              .slice(0, max)
              .map(({ el, right }) => ({
                element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`.slice(0, 80),
                rightPx: Math.ceil(right),
              })),
          { limit: PRINT_WIDTH_PX, max: MAX_LISTED },
        )
  return { measurement: 'measured', px, elements }
}

/** @param {import('playwright-core').Page} page */
const cdpLayoutMetrics = async (page) => {
  const cdp = await page.context().newCDPSession(page)
  try {
    return /** @type {{ cssContentSize?: { width: number } }} */ (await cdp.send('Page.getLayoutMetrics'))
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

/**
 * Visible inline SVGs with at least one visible mark (the donor's count) and visible images.
 * @param {import('playwright-core').Page} page
 */
function countVisuals(page) {
  return page.evaluate(() => {
    const marks = 'path,rect,circle,ellipse,line,polyline,polygon,text,image,use,foreignObject'
    /** @param {Element} el */
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, which sees only this callback
    const visible = (el) => {
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
      if (Number.parseFloat(style.opacity || '1') === 0) return false
      const rect = el.getBoundingClientRect()
      return el.getClientRects().length > 0 && rect.width > 0 && rect.height > 0
    }
    const svgs = [...document.querySelectorAll('svg')].filter(
      (svg) => visible(svg) && [...svg.querySelectorAll(marks)].some(visible),
    )
    return {
      svgVisuals: svgs.length,
      domImages: [...document.images].filter((img) => img.complete && visible(img)).length,
    }
  })
}

/** @param {import('playwright-core').Page} page */
function printPdf(page) {
  const margin = `${MARGIN_MM}mm`
  return page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: margin, bottom: margin, left: margin, right: margin },
    displayHeaderFooter: true,
    headerTemplate: HEADER_TEMPLATE,
    footerTemplate: FOOTER_TEMPLATE,
  })
}

/**
 * @param {string} name
 * @param {'passed' | 'failed' | 'unknown'} outcome
 * @param {string | null} [detail]
 */
const check = (name, outcome, detail = null) => ({ name, outcome, detail })

/**
 * The checks a produced PDF carries. An unknown check never passes; blank and short pages wait for S5b's text
 * extraction.
 * @param {import('./pdf-facts.mjs').PdfFacts} facts
 * @param {Overflow} overflow
 */
function outputChecks(facts, overflow) {
  return [
    check('pdf_signature', facts.header && facts.eof ? 'passed' : 'failed', facts.header),
    check(
      'page_count',
      facts.pageCount === null ? 'unknown' : facts.pageCount > 0 ? 'passed' : 'failed',
      String(facts.pageCount),
    ),
    check(
      'layout_overflow',
      overflow.measurement === 'unavailable' ? 'unknown' : overflow.px === 0 ? 'passed' : 'failed',
      overflow.px === null ? 'measurement unavailable' : `${overflow.px}px past the printable width`,
    ),
    check('blank_pages', 'unknown', 'needs text extraction (S5b)'),
    check('short_pages', 'unknown', 'needs text extraction (S5b)'),
  ]
}

/**
 * @typedef {{ sourceRoot: string, entry: unknown, assets: unknown, language: string, outputDir: string,
 *   jobId?: string, scratchDir?: string, timeoutMs?: number }} PdfJob
 * @typedef {{ signal?: AbortSignal, env?: NodeJS.ProcessEnv,
 *   layoutMetrics?: (page: import('playwright-core').Page) => Promise<{ cssContentSize?: { width: number } }> }} RenderOptions
 */

/**
 * @param {PdfJob} job
 */
function newReceipt(job) {
  return {
    schema: RECEIPT_SCHEMA,
    jobId: job.jobId ?? null,
    status: /** @type {'succeeded' | 'failed' | 'cancelled'} */ ('failed'),
    error: /** @type {{ code: string, message: string } | null} */ (null),
    renderer: {
      kernel: 'renderers/web/pdf/render-html.mjs',
      rendererSha256: rendererSha256(),
      donor: DONOR,
      playwrightCore: playwrightVersion(),
      browser: /** @type {string | null} */ (null),
    },
    source:
      /** @type {{ manifestSha256: string, entry: { path: string, sha256: string }, assets: { path: string, sha256: string }[] } | null} */ (
        null
      ),
    language: job.language,
    sandbox: /** @type {import('./confine.mjs').SandboxVerdict | null} */ (null),
    output:
      /** @type {(import('./pdf-facts.mjs').PdfFacts & { path: string, sha256: string, bytes: number }) | null} */ (
        null
      ),
    measurements: /** @type {{ overflow: Overflow, svgVisuals: number | null, domImages: number | null } | null} */ (
      null
    ),
    undeclaredAssets: /** @type {string[]} */ ([]),
    blockedRequests: /** @type {string[]} */ ([]),
    checks: /** @type {ReturnType<typeof check>[]} */ ([]),
    warnings: /** @type {string[]} */ ([]),
    elapsedMs: 0,
  }
}

/** @typedef {ReturnType<typeof newReceipt>} PdfReceipt */

/**
 * Load the entry in the confined browser and refuse anything the policy stopped or a sandbox that is not active.
 * @param {import('./confine.mjs').ConfinedBrowser} browser
 * @param {import('./source-manifest.mjs').VerifiedSource} source
 * @param {PdfReceipt} receipt
 * @param {number} timeoutMs
 */
async function loadEntry(browser, source, receipt, timeoutMs) {
  const page = browser.context.pages()[0] ?? (await browser.context.newPage())
  const seen = await installRequestPolicy(page, source)
  await page.setViewportSize({ width: PRINT_WIDTH_PX, height: PRINT_HEIGHT_PX })
  await page.emulateMedia({ media: 'print' })
  await page.goto(source.entry.url, { waitUntil: 'load', timeout: timeoutMs })
  receipt.renderer.browser =
    (await page.evaluate(() => navigator.userAgent)).match(/HeadlessChrome\/[\d.]+/)?.[0] ?? null
  receipt.sandbox = browser.selfTest()
  receipt.checks.push(
    check('sandbox_active', receipt.sandbox.active ? 'passed' : 'failed', receipt.sandbox.reasons.join('; ') || null),
  )
  if (!receipt.sandbox.active) throw new RenderFailure('sandbox_inactive', 'Chromium is not confined and sandboxed')
  receipt.undeclaredAssets = [...new Set(seen.undeclared)].slice(0, MAX_LISTED)
  receipt.blockedRequests = [...new Set(seen.blocked)].slice(0, MAX_LISTED)
  receipt.checks.push(check('assets_complete', receipt.undeclaredAssets.length === 0 ? 'passed' : 'failed'))
  receipt.checks.push(check('requests_contained', receipt.blockedRequests.length === 0 ? 'passed' : 'failed'))
  if (receipt.blockedRequests.length > 0)
    throw new RenderFailure('blocked_request', 'the report asked for a resource outside its source package')
  if (receipt.undeclaredAssets.length > 0)
    throw new RenderFailure('undeclared_asset', 'the report uses a file its manifest does not list')
  return page
}

/**
 * Print the loaded page and keep the PDF, measured and checked.
 * @param {import('playwright-core').Page} page
 * @param {PdfJob} job
 * @param {PdfReceipt} receipt
 * @param {RenderOptions} opts
 */
async function printAndKeep(page, job, receipt, opts) {
  receipt.warnings.push(...(await applyLanguage(page, job.language)))
  // Not addStyleTag: it waits for the style's load event, which never fires with page JavaScript off.
  await page.evaluate((css) => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
  }, WRAP_CSS)
  const overflow = await measureOverflow(page, opts.layoutMetrics ?? cdpLayoutMetrics)
  receipt.measurements = { overflow, ...(await countVisuals(page)) }
  const pdf = await printPdf(page)
  const facts = pdfFacts(pdf)
  const file = path.join(job.outputDir, OUTPUT_NAME)
  fs.writeFileSync(file, pdf, { flag: 'wx', mode: 0o644 })
  receipt.output = { path: OUTPUT_NAME, sha256: sha256Hex(pdf), bytes: pdf.byteLength, ...facts }
  receipt.checks.push(...outputChecks(facts, overflow))
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
 * The receipt's ending for an error, by its kind: a cancel, a timeout, a stable failure code or an internal error.
 * @param {PdfReceipt} receipt
 * @param {unknown} error
 * @param {{ cancelled: boolean, timedOut: boolean }} how
 */
function settleError(receipt, error, how) {
  if (how.cancelled) {
    receipt.status = 'cancelled'
    receipt.error = { code: 'cancelled', message: 'The render was cancelled.' }
    return
  }
  receipt.status = 'failed'
  if (how.timedOut) receipt.error = { code: 'timeout', message: 'The render ran past its time limit.' }
  else if (error instanceof RenderFailure || error instanceof ManifestError)
    receipt.error = { code: error.code, message: error.message }
  else if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.name === 'ConfinementError'
  ) {
    receipt.error = { code: error.code, message: error.message }
  } else
    receipt.error = {
      code: 'render_error',
      message: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
    }
}

/** @typedef {{ job: PdfJob, opts: RenderOptions, signal: AbortSignal, receipt: PdfReceipt }} Run */

/**
 * The job's language and source package, verified before any browser starts, and recorded in the receipt.
 * @param {Run} run
 */
function verified(run) {
  if (typeof run.job.language !== 'string' || !LANGUAGE.test(run.job.language)) {
    throw new RenderFailure('invalid_language', 'language is a BCP 47 tag')
  }
  const source = verifySource(run.job)
  run.receipt.source = {
    manifestSha256: source.manifestSha256,
    entry: { path: source.entry.path, sha256: source.entry.sha256 },
    assets: source.assets.map((a) => ({ path: a.path, sha256: a.sha256 })),
  }
  run.receipt.checks.push(check('source_verified', 'passed'))
  return source
}

/**
 * Launch the confined browser in a scratch directory of its own, render, and always shut it down and remove the
 * scratch. A cancel or a timeout kills the namespace; one during the launch ends the job once it returns.
 * @param {Run} run
 * @param {import('./source-manifest.mjs').VerifiedSource} source
 */
async function inConfinedBrowser(run, source) {
  const workDir = fs.mkdtempSync(path.join(run.job.scratchDir ?? os.tmpdir(), 'sophia-render-'))
  /** @type {import('./confine.mjs').ConfinedBrowser | null} */
  let browser = null
  const onAbort = () => browser?.kill()
  run.signal.addEventListener('abort', onAbort, { once: true })
  try {
    browser = await launchConfined({ workDir, env: run.opts.env })
    run.signal.throwIfAborted()
    const page = await loadEntry(browser, source, run.receipt, run.job.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    await printAndKeep(page, run.job, run.receipt, run.opts)
    run.signal.throwIfAborted()
    const unchanged = sourceUnchanged(source)
    run.receipt.checks.push(check('source_unchanged', unchanged ? 'passed' : 'failed'))
    if (!unchanged) throw new RenderFailure('source_changed', 'the source changed while it was rendered')
  } finally {
    run.signal.removeEventListener('abort', onAbort)
    if (browser) await shutDown(browser)
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

/**
 * Render one report. Never throws for a job's own failure: the receipt says what happened, and a failed or
 * cancelled render keeps no output.
 * @param {PdfJob} job
 * @param {RenderOptions} [opts]
 * @returns {Promise<PdfReceipt>}
 */
export async function renderHtmlToPdf(job, opts = {}) {
  const started = Date.now()
  const receipt = newReceipt(job)
  const timeout = AbortSignal.timeout(job.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const run = { job, opts, signal, receipt }
  try {
    const source = verified(run)
    signal.throwIfAborted()
    await inConfinedBrowser(run, source)
    receipt.status = 'succeeded'
  } catch (error) {
    const cancelled = opts.signal?.aborted === true
    settleError(receipt, error, { cancelled, timedOut: timeout.aborted && !cancelled })
    if (receipt.output) fs.rmSync(path.join(job.outputDir, OUTPUT_NAME), { force: true })
    receipt.output = null
  }
  receipt.elapsedMs = Date.now() - started
  return receipt
}

/**
 * A job file's contents as a job, or why not. The browser is the operator's (SOPHIA_CHROMIUM_PATH), never a job's.
 * @param {unknown} value
 * @returns {PdfJob}
 */
export function asJob(value) {
  if (typeof value !== 'object' || value === null) throw new RenderFailure('invalid_job', 'a job is a JSON object')
  /** @type {Record<string, unknown>} */
  const fields = { ...value }
  /** @param {string} key */
  const text = (key) => {
    const v = fields[key]
    if (typeof v !== 'string') throw new RenderFailure('invalid_job', `${key} is a string`)
    return v
  }
  return {
    sourceRoot: text('sourceRoot'),
    outputDir: text('outputDir'),
    language: text('language'),
    entry: fields.entry,
    assets: fields.assets,
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
    process.stderr.write('usage: render-html.mjs --job <job.json>\n')
    return 2
  }
  const job = asJob(JSON.parse(fs.readFileSync(jobFile, 'utf8')))
  const controller = new AbortController()
  process.once('SIGTERM', () => controller.abort())
  process.once('SIGINT', () => controller.abort())
  const receipt = await renderHtmlToPdf(job, { signal: controller.signal })
  fs.writeFileSync(path.join(job.outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
  process.stderr.write(
    `[render-html] ${receipt.status}${receipt.error ? ` ${receipt.error.code}` : ''} ${receipt.output?.bytes ?? 0} bytes\n`,
  )
  return receipt.status === 'succeeded' ? 0 : 1
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
