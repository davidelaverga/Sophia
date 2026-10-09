// SDD-01 end-to-end check of the UML render host, run inside the supervisor image (CI: uml-supervisor.yml) from the
// deployed package (/opt/sophia-renderer/uml), as root, with no network but loopback. The real supervisor (UML mode)
// claims from a loopback stand-in of the renderer API and runs each job through the real launchers, the UML kernel, the
// unchanged kernels and the confined Chromium: a PDF job with an image, a capture job at both targets, and a job stopped
// while its guest runs, after which no process of the launchers' uid and no UML kernel may remain. The stand-in API
// checks only the protocol; receipts are judged here as the probe judges them. It holds no credential: the runner
// token is a synthetic file only root can read, which the launchers must show refused before each guest starts. Prints
// one JSON line per step and exits 0 only when every step passed.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import { runOnce } from '../supervisor.mjs'

/**
 * @typedef {{ name: string, outcome: string, target?: string | null, detail?: unknown }} Check
 * @typedef {{ status?: string, error?: unknown, sandbox?: { active?: boolean }, checks?: Check[],
 *   output?: { sha256?: string }, captures?: { name: string, sha256: string }[] }} Receipt
 * @typedef {{ format: 'pdf' | 'png', files: Record<string, { role: string, bytes: Buffer }>, targets?: string[] }} Spec
 */

/** @param {Buffer | string} b */
const sha = (b) => createHash('sha256').update(b).digest('hex')
const TOKEN = 'synthetic-e2e-runner-token'
const TOKEN_FILE = '/run/sophia-e2e-token'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)
const REPORT = Buffer.from(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prova</title></head><body>
<h1>Verifica dell'host di stampa</h1><p>${'Città, señal, naïve façade: àèéìòù ÀÈÉÌÒÙ ñ ¿¡. '.repeat(24)}</p>
<img src="img/chart.png" width="40" height="40" alt="grafico"></body></html>`)
const DESIGN = Buffer.from(`<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Probe</title>
<style>body{margin:0;font:18px/1.5 Georgia,serif;color:#222;background:#fafafa} section{padding:1rem 2rem;max-width:60rem;margin:auto}</style>
</head><body><main><h1>Verifica dell'host di cattura</h1>
<section data-section="s1"><p data-block="b1">${'Città, señal, naïve façade: àèéìòù. '.repeat(8)}</p></section>
<section data-section="s2"><ul><li data-block="b2">Uno.</li><li data-block="b3">Due.</li></ul></section></main></body></html>
`)

/** @type {{ pdf: Spec, png: Spec }} */
const JOBS = {
  pdf: {
    format: 'pdf',
    files: { 'report.html': { role: 'entry', bytes: REPORT }, 'img/chart.png': { role: 'asset', bytes: PNG } },
  },
  png: {
    format: 'png',
    files: { 'index.html': { role: 'entry', bytes: DESIGN } },
    targets: ['w390-light', 'w1280-light'],
  },
}

/** @type {(Spec & { id: string }) | null} */
let next = null
/** @type {Spec | null} */
let current = null
let stopAfterBeats = Infinity
/** @type {{ uploads: { route: string, sha256: string, bytes: number }[], settles: Receipt[], beats: number }} */
const seen = { uploads: [], settles: [], beats: 0 }

/**
 * A field of a parsed JSON value, or undefined.
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
const at = (value, key) =>
  typeof value === 'object' && value !== null ? /** @type {unknown} */ (Reflect.get(value, key)) : undefined
/** @param {unknown} v */
const text = (v) => (typeof v === 'string' ? v : '')

/**
 * The receipt a settlement carries, read field by field.
 * @param {unknown} settlement
 * @returns {Receipt}
 */
function receiptOf(settlement) {
  const r = at(settlement, 'receipt')
  const checks = at(r, 'checks')
  const captures = at(r, 'captures')
  const active = at(at(r, 'sandbox'), 'active')
  return {
    status: text(at(r, 'status')),
    error: at(r, 'error'),
    sandbox: { active: active === true },
    checks: Array.isArray(checks)
      ? checks.map((/** @type {unknown} */ c) => ({
          name: text(at(c, 'name')),
          outcome: text(at(c, 'outcome')),
          target: text(at(c, 'target')) || null,
          detail: at(c, 'detail'),
        }))
      : [],
    output: { sha256: text(at(at(r, 'output'), 'sha256')) },
    captures: Array.isArray(captures)
      ? captures.map((/** @type {unknown} */ c) => ({ name: text(at(c, 'name')), sha256: text(at(c, 'sha256')) }))
      : [],
  }
}

/**
 * The claim's answer: the next job, once, its package described by path, role, hash and size.
 * @returns {{ status: number, value: unknown }}
 */
function claim() {
  const pending = next
  next = null
  if (!pending) return { status: 200, value: { job: null } }
  const files = Object.entries(pending.files).map(([p, f]) => ({
    path: p,
    role: f.role,
    sha256: sha(f.bytes),
    byteLength: f.bytes.length,
  }))
  const job = {
    jobId: pending.id,
    leaseToken: 'lease',
    language: 'it',
    sourceManifestHash: 'synthetic',
    timeoutMs: 180_000,
    format: pending.format,
    targets: pending.targets ?? [],
    sections: null,
    files,
  }
  return { status: 200, value: { job } }
}

/**
 * A heartbeat's answer: continue, or stop once the beats reach `stopAfterBeats`.
 * @returns {{ status: number, value: unknown }}
 */
function heartbeat() {
  seen.beats += 1
  return { status: 200, value: { state: seen.beats >= stopAfterBeats ? 'stop' : 'continue' } }
}

/**
 * The stand-in API's answer to one request.
 * @param {http.IncomingMessage} req
 * @param {Buffer} body
 * @returns {{ status: number, value: unknown, type?: string }}
 */
function answer(req, body) {
  const url = new URL(req.url ?? '/', 'http://x')
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return { status: 401, value: {} }
  if (url.pathname === '/v1/renderer/claim') return claim()
  if (/^\/v1\/renderer\/jobs\/[^/]+\/file$/.test(url.pathname)) {
    const bytes = current?.files[url.searchParams.get('path') ?? '']?.bytes ?? Buffer.alloc(0)
    return { status: 200, value: bytes, type: 'application/octet-stream' }
  }
  if (url.pathname.endsWith('/heartbeat')) return heartbeat()
  if (req.method === 'PUT') {
    seen.uploads.push({ route: url.pathname, sha256: sha(body), bytes: body.length })
    return { status: 200, value: {} }
  }
  if (url.pathname.endsWith('/settle')) {
    seen.settles.push(receiptOf(/** @type {unknown} */ (JSON.parse(body.toString('utf8')))))
    return { status: 200, value: { state: 'settled' } }
  }
  return { status: 404, value: {} }
}

const server = http.createServer((req, res) => {
  /** @type {Buffer[]} */
  const chunks = []
  req.on('data', (/** @type {Buffer} */ c) => chunks.push(c))
  req.on('end', () => {
    const { status, value, type } = answer(req, Buffer.concat(chunks))
    res.writeHead(status, { 'content-type': type ?? 'application/json' })
    res.end(Buffer.isBuffer(value) ? value : JSON.stringify(value))
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)))
const address = server.address()
fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o400 })
const cfg = {
  apiUrl: `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`,
  token: TOKEN,
  tokenFile: TOKEN_FILE,
  workDir: '/work',
  heartbeatMs: 1000,
  isolation: /** @type {const} */ ('uml'),
  uml: { root: '/opt/uml' },
  log: (/** @type {string} */ line) => {
    process.stdout.write(`${JSON.stringify({ event: 'supervisor_log', line: line.slice(0, 400) })}\n`)
  },
}

/** Processes the launchers' uid still owns, and UML kernels still running. */
function leftovers() {
  /** @type {string[]} */
  const found = []
  for (const name of fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
    try {
      const status = fs.readFileSync(`/proc/${name}/status`, 'utf8')
      if (/^State:\s+Z/m.test(status)) continue
      const uid = /^Uid:\s+(\d+)/m.exec(status)?.[1]
      const cmd = fs.readFileSync(`/proc/${name}/cmdline`, 'utf8').replaceAll('\0', ' ').trim()
      if (uid === '10001' || cmd.includes('linux.uml')) found.push(`${name} uid=${String(uid)} ${cmd.slice(0, 80)}`)
    } catch {
      // A process that ended while it was read is not left over.
    }
  }
  return found
}

/** @type {boolean[]} */
const results = []
/**
 * @param {string} name
 * @param {boolean} ok
 * @param {Record<string, unknown>} detail
 */
const step = (name, ok, detail) => {
  results.push(ok)
  process.stdout.write(`${JSON.stringify({ event: 'UML_E2E_STEP', step: name, ok, ...detail })}\n`)
}

/**
 * Hand the supervisor one job and see it through.
 * @param {string} id
 * @param {Spec} spec
 */
async function handOver(id, spec, stopAt = Infinity) {
  current = spec
  next = { id, ...spec }
  stopAfterBeats = stopAt
  seen.uploads = []
  seen.settles = []
  seen.beats = 0
  const started = performance.now()
  const run = await runOnce(cfg)
  return { outcome: run.claimed ? run.outcome : 'unclaimed', ms: Math.round(performance.now() - started) }
}

/**
 * The checks a receipt does not pass, an unmeasured contrast excepted (as the design gate reads it).
 * @param {Receipt | undefined} receipt
 */
const notPassed = (receipt) =>
  (receipt?.checks ?? [])
    .filter((c) => c.outcome !== 'passed' && !(c.name === 'contrast' && c.outcome === 'unknown'))
    .map(
      (c) => `${c.name}${c.target ? `@${c.target}` : ''}=${c.outcome}: ${JSON.stringify(c.detail ?? '').slice(0, 200)}`,
    )

try {
  // A PDF job with an image: delivered, the receipt's PDF uploaded, the sandbox active, every kernel check passed.
  {
    const { outcome, ms } = await handOver('e2e-pdf', JOBS.pdf)
    const receipt = seen.settles[0]
    const failed = notPassed(receipt)
    const upload = seen.uploads[0]
    const ok =
      outcome === 'settled' &&
      receipt?.status === 'succeeded' &&
      receipt.sandbox?.active === true &&
      failed.length === 0 &&
      seen.uploads.length === 1 &&
      upload?.sha256 === receipt.output?.sha256
    step('pdf', ok, { outcome, ms, status: receipt?.status, sandbox: receipt?.sandbox, failed, uploads: seen.uploads })
  }
  // A capture job at both targets: every capture uploaded matches its receipt, every check passed, the width sweep
  // among them.
  {
    const { outcome, ms } = await handOver('e2e-png', JOBS.png)
    const receipt = seen.settles[0]
    const failed = notPassed(receipt)
    const captures = receipt?.captures ?? []
    const uploaded = captures.every((c) =>
      seen.uploads.some((u) => u.route.endsWith(`/captures/${c.name}`) && u.sha256 === c.sha256),
    )
    const ok =
      outcome === 'settled' &&
      receipt?.status === 'succeeded' &&
      receipt.sandbox?.active === true &&
      failed.length === 0 &&
      (receipt.checks ?? []).some((c) => c.name === 'widths_visible' && c.outcome === 'passed') &&
      captures.length > 0 &&
      captures.length === seen.uploads.length &&
      uploaded
    const detail = { outcome, ms, status: receipt?.status, error: receipt?.error, sandbox: receipt?.sandbox, failed }
    step('capture', ok, { ...detail, captures: captures.length })
  }
  // A Stop while the guest renders: cancelled, nothing uploaded or settled, and within 15 s no process of the
  // launchers' uid and no UML kernel remains.
  {
    const { outcome, ms } = await handOver('e2e-stop', JOBS.png, 6)
    let left = leftovers()
    const until = Date.now() + 15_000
    while (left.length > 0 && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 250))
      left = leftovers()
    }
    const ok = outcome === 'cancelled' && seen.uploads.length === 0 && seen.settles.length === 0 && left.length === 0
    step('stop', ok, { outcome, ms, uploads: seen.uploads.length, settles: seen.settles.length, leftovers: left })
  }
} catch (error) {
  step('error', false, { message: error instanceof Error ? error.message : String(error) })
} finally {
  server.close()
  fs.rmSync(TOKEN_FILE, { force: true })
}
const ok = results.length === 3 && results.every(Boolean)
process.stdout.write(`${JSON.stringify({ event: 'UML_E2E_DONE', ok, qualification: false })}\n`)
process.exit(ok ? 0 : 1)
