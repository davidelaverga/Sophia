// SMC-M03 S5a: the confined PDF kernel against a real headless Chromium (the shell playwright-core 1.56.1 pins).
// On a host without it (macOS, no browser installed) the browser tests skip and say why; CI sets
// SOPHIA_RENDERER_REQUIRED=1, which turns a skip into a failure. The source checks need no browser and always run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromiumPath, judgeSandbox, launchConfined, renderHtmlToPdf, renderUserOf } from '../index.mjs'

const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')
// A 2×2 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)
const KERNEL = fileURLToPath(new URL('../render-html.mjs', import.meta.url))

/** Root runs the browser as an unprivileged render user; anyone else runs it as themselves. */
const env: NodeJS.ProcessEnv =
  process.getuid?.() === 0
    ? { ...process.env, SOPHIA_RENDER_UID: process.env.SOPHIA_RENDER_UID ?? '1000' }
    : process.env

function unavailable(): string | null {
  if (process.platform !== 'linux') return `the confined renderer runs on Linux only (here: ${process.platform})`
  const browser = chromiumPath(env)
  if (!fs.existsSync(browser)) return `no headless shell at ${browser}`
  const probe = spawnSync('unshare', ['--user', '--map-current-user', '--net', '--pid', '--fork', 'true'], {
    encoding: 'utf8',
  })
  if (probe.status !== 0) return `user namespaces are not available: ${probe.stderr.trim()}`
  return null
}
const why = unavailable()
/** The browser tests' skip: a reason on a host without the renderer, never in CI (SOPHIA_RENDERER_REQUIRED=1). */
const skip = why ?? false

interface FileRef {
  path: string
  sha256: string
}
interface Job {
  sourceRoot: string
  outputDir: string
  entry: FileRef
  assets: FileRef[]
  language: string
}

/** A source package: files written world-readable (the render user reads them), with its manifest. */
function sourcePackage(
  files: Record<string, string | Buffer>,
  assets = Object.keys(files).filter((f) => !f.endsWith('.html')),
): Job {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-src-'))
  fs.chmodSync(root, 0o755)
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 })
    fs.writeFileSync(file, content, { mode: 0o644 })
  }
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-out-'))
  const ref = (p: string): FileRef => ({ path: p, sha256: sha(fs.readFileSync(path.join(root, p))) })
  return { sourceRoot: root, outputDir, entry: ref('report.html'), assets: assets.map(ref), language: 'it' }
}

/** Processes still running for any render of this file. */
const lingering = () =>
  fs
    .readdirSync('/proc')
    .filter((n) => /^\d+$/.test(n))
    .filter((pid) => {
      try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('sophia-render-')
      } catch {
        return false
      }
    })

type Receipt = Awaited<ReturnType<typeof renderHtmlToPdf>>
const outcome = (receipt: Receipt, name: string) => receipt.checks.find((c) => c.name === name)?.outcome

const LONG_URL = `https://example.org/${'a-very-long-path-segment-without-any-space-'.repeat(8)}end`
const REPORT = `<!doctype html><html><head><meta charset="utf-8"><title>Rapporto</title></head><body>
<h1>Rendere PDF in sicurezza</h1>
<p>Perché la città è più sicura: àèéìòù. ¿Qué pasa? ¡Señal! Ñandú.</p>
<p>Fonte: <a href="${LONG_URL}">${LONG_URL}</a></p>
<svg width="200" height="100" viewBox="0 0 200 100"><rect x="10" y="10" width="80" height="60" fill="#46c"/><text x="100" y="50">42</text></svg>
<p><img src="img/chart.png" width="40" height="40" alt="chart"></p>
</body></html>`

/** Synthetic /proc facts for the sandbox judgement. */
type Facts = Parameters<typeof judgeSandbox>[0][number]
const p = (pid: number, ppid: number, cmdline: string, extra: Partial<Facts> = {}): Facts => ({
  pid,
  ppid,
  uid: 1000,
  seccomp: 0,
  noNewPrivs: 1,
  nsDepth: 2,
  cmdline,
  ns: { user: 'user:[2]', net: 'net:[2]' },
  ...extra,
})
const renderer = (extra: Partial<Facts> = {}) =>
  p(4, 3, 'headless_shell --type=renderer', {
    seccomp: 2,
    nsDepth: 4,
    ns: { user: 'user:[3]', net: 'net:[3]' },
    ...extra,
  })
const tree = (...rest: Facts[]) => [
  p(1, 0, 'unshare --user'),
  p(2, 1, 'headless_shell --user-data-dir=/x'),
  p(3, 2, 'headless_shell --type=zygote'),
  ...rest,
]

describe('the confined PDF kernel', () => {
  it('has a confined browser wherever the renderer is required', () => {
    if (process.env.SOPHIA_RENDERER_REQUIRED === '1') assert.equal(why, null, `the renderer is required here: ${why}`)
  })

  it('renders a report in the confined, sandboxed browser and returns its receipt', { skip }, async () => {
    const job = sourcePackage({ 'report.html': REPORT, 'img/chart.png': PNG })
    const receipt = await renderHtmlToPdf(job, { env })
    assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
    const pdf = fs.readFileSync(path.join(job.outputDir, 'report.pdf'))
    const output = receipt.output!
    assert.deepEqual([output.sha256, output.bytes], [sha(pdf), pdf.byteLength])
    assert.match(output.header!, /^%PDF-1\.\d$/)
    assert.equal(output.eof, true)
    assert.ok(output.pageCount! >= 1)
    assert.ok(output.pdfImages >= 1, 'the PNG is embedded')
    const passed = [
      'source_verified',
      'sandbox_active',
      'assets_complete',
      'requests_contained',
      'pdf_signature',
      'page_count',
      'layout_overflow',
      'source_unchanged',
    ]
    for (const name of passed) assert.equal(outcome(receipt, name), 'passed', name)
    assert.deepEqual([outcome(receipt, 'blank_pages'), outcome(receipt, 'short_pages')], ['unknown', 'unknown'])
    const sandbox = receipt.sandbox!
    assert.equal(sandbox.active, true, sandbox.reasons.join('; '))
    assert.ok(sandbox.renderers >= 1)
    assert.notEqual(sandbox.browserUid, 0)
    const measurements = receipt.measurements!
    assert.deepEqual(measurements.overflow, { measurement: 'measured', px: 0, elements: [] }, 'the long URL wraps')
    assert.deepEqual([measurements.svgVisuals, measurements.domImages], [1, 1])
    assert.match(receipt.renderer.browser!, /^HeadlessChrome\/141\./)
    assert.equal(receipt.renderer.playwrightCore, '1.56.1')
    assert.equal(receipt.source!.manifestSha256.length, 64)
    assert.deepEqual(receipt.warnings, [])
    assert.deepEqual(lingering(), [], 'no browser process is left')
  })

  it(
    'measures overflow that cannot wrap and names it; an unavailable probe is unknown, not a pass',
    { skip },
    async () => {
      const wide = sourcePackage({
        'report.html': '<html lang="it"><body><p>Testo.</p><div id="wide" style="width:2000px">x</div></body></html>',
      })
      const measured = await renderHtmlToPdf(wide, { env })
      assert.equal(measured.status, 'succeeded')
      assert.equal(outcome(measured, 'layout_overflow'), 'failed')
      assert.ok(measured.measurements!.overflow.px! > 1000)
      assert.equal(measured.measurements!.overflow.elements[0]?.element, 'div#wide')

      const blind = sourcePackage({ 'report.html': '<html lang="it"><body><p>Testo.</p></body></html>' })
      const receipt = await renderHtmlToPdf(blind, {
        env,
        layoutMetrics: () => Promise.reject(new Error('Page.getLayoutMetrics failed')),
      })
      assert.equal(receipt.status, 'succeeded', 'the PDF exists; the check says what is not known')
      assert.deepEqual(receipt.measurements!.overflow, { measurement: 'unavailable', px: null, elements: [] })
      assert.equal(outcome(receipt, 'layout_overflow'), 'unknown')
    },
  )

  it('refuses every request outside the package before printing, and keeps no output', { skip }, async () => {
    const job = sourcePackage({
      'report.html': `<html lang="it"><body><p>x</p>
        <img src="https://example.com/remote.png"><link rel="stylesheet" href="https://example.com/a.css">
        <img src="../../../../../../etc/hostname.png"><iframe src="file:///etc/passwd"></iframe>
        <img src="data:image/png;base64,${PNG.toString('base64')}"></body></html>`,
    })
    const receipt = await renderHtmlToPdf(job, { env })
    assert.deepEqual([receipt.status, receipt.error?.code], ['failed', 'blocked_request'])
    const blocked = receipt.blockedRequests
    assert.ok(blocked.includes('image:https://example.com/remote.png'), blocked.join(', '))
    assert.ok(blocked.includes('stylesheet:https://example.com/a.css'))
    assert.ok(blocked.includes('image:file:<outside the source root>'))
    assert.ok(
      blocked.some((r) => r.startsWith('document:file:')),
      'the iframe is not loaded',
    )
    assert.ok(!blocked.some((r) => r.includes('data:')), 'an inline image is allowed')
    assert.equal(outcome(receipt, 'requests_contained'), 'failed')
    assert.equal(receipt.output, null)
    assert.deepEqual(fs.readdirSync(job.outputDir), [])

    const undeclared = sourcePackage(
      { 'report.html': '<html><body><img src="extra.png"></body></html>', 'extra.png': PNG },
      [],
    )
    const second = await renderHtmlToPdf(undeclared, { env })
    assert.deepEqual(
      [second.status, second.error?.code, second.undeclaredAssets],
      ['failed', 'undeclared_asset', ['file:extra.png']],
    )
    assert.deepEqual(lingering(), [])
  })

  it('cancels: the namespace dies, nothing is kept and the scratch is gone', { skip }, async () => {
    const job = sourcePackage({ 'report.html': REPORT, 'img/chart.png': PNG })
    const controller = new AbortController()
    const receipt = await renderHtmlToPdf(job, {
      env,
      signal: controller.signal,
      layoutMetrics: async () => {
        controller.abort()
        await new Promise((resolve) => setTimeout(resolve, 200))
        return { cssContentSize: { width: 10 } }
      },
    })
    assert.deepEqual([receipt.status, receipt.error?.code], ['cancelled', 'cancelled'])
    assert.equal(receipt.output, null)
    assert.deepEqual(fs.readdirSync(job.outputDir), [])
    assert.deepEqual(lingering(), [], 'killed with its namespace')
  })

  it('never starts with the sandbox off: the wrapper refuses the flag before Chromium runs', { skip }, async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-render-'))
    try {
      await assert.rejects(
        launchConfined({ workDir, env, extraArgs: ['--no-sandbox'], timeoutMs: 15_000 }),
        /refusing --no-sandbox|exit|closed/i,
      )
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
    assert.deepEqual(lingering(), [])
  })

  it('refuses a source package before any browser starts', async () => {
    const ok = { 'report.html': '<html><body><img src="a.png"></body></html>', 'a.png': PNG }
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-outside-'))
    fs.writeFileSync(path.join(outside, 'secret.png'), PNG)
    const cases: [string, (job: Job) => void][] = [
      ['missing_asset', (j) => j.assets.push({ path: 'gone.png', sha256: sha('x') })],
      ['path_escape', (j) => j.assets.push({ path: '../a.png', sha256: sha(PNG) })],
      ['absolute_path', (j) => j.assets.push({ path: path.join(j.sourceRoot, 'a.png'), sha256: sha(PNG) })],
      ['hash_mismatch', (j) => (j.assets[0]!.sha256 = sha('other'))],
      ['duplicate', (j) => j.assets.push({ ...j.assets[0]! })],
      ['extension', (j) => j.assets.push({ path: 'report.html', sha256: j.entry.sha256 })],
      ['missing_entry', (j) => (j.entry = { path: 'index.html', sha256: sha('x') })],
      [
        'symlink_escape',
        (j) => {
          fs.symlinkSync(path.join(outside, 'secret.png'), path.join(j.sourceRoot, 'link.png'))
          j.assets.push({ path: 'link.png', sha256: sha(PNG) })
        },
      ],
      ['invalid_language', (j) => (j.language = 'it; rm -rf /')],
    ]
    for (const [code, spoil] of cases) {
      const job = sourcePackage(ok)
      spoil(job)
      const receipt = await renderHtmlToPdf(job, { env })
      assert.deepEqual(
        [receipt.status, receipt.error?.code, receipt.sandbox, receipt.output],
        ['failed', code, null, null],
        code,
      )
    }
  })

  it('judges the sandbox from the process tree and fails closed on any gap', () => {
    const self = { user: 'user:[1]', net: 'net:[1]' }
    assert.equal(judgeSandbox(tree(renderer()), self).active, true)
    const gaps: [Facts[], string][] = [
      [tree(), 'no renderer'],
      [tree(renderer({ seccomp: 0 })), 'no seccomp filter'],
      [tree(renderer({ ns: { user: 'user:[2]', net: 'net:[3]' } })), 'own user namespace'],
      [tree(renderer({ ns: { user: 'user:[3]', net: null } })), 'own network namespace'],
      [tree(renderer({ noNewPrivs: 0 })), 'may gain privileges'],
      [[p(1, 0, 'unshare'), p(2, 1, 'headless_shell', { uid: 0 }), renderer({ ppid: 2 })], 'as root'],
      [
        [
          p(1, 0, 'unshare'),
          p(2, 1, 'headless_shell', { ns: { user: 'user:[1]', net: 'net:[2]' } }),
          renderer({ ppid: 2 }),
        ],
        'shares the user namespace',
      ],
      [[p(1, 0, 'unshare'), p(2, 1, 'headless_shell', { nsDepth: 1 }), renderer({ ppid: 2 })], 'host PID namespace'],
      [tree(renderer(), p(9, 2, 'headless_shell --type=utility --no-sandbox')), '--no-sandbox'],
      [[], 'no browser'],
    ]
    for (const [processes, reason] of gaps) {
      const verdict = judgeSandbox(processes, self)
      assert.equal(verdict.active, false, reason)
      assert.ok(
        verdict.reasons.some((r) => r.includes(reason)),
        `${reason}: ${verdict.reasons.join('; ')}`,
      )
    }
  })

  it(
    'never runs the browser as root: root must name an unprivileged render user',
    { skip: process.getuid?.() !== 0 },
    () => {
      assert.throws(() => renderUserOf({}), /root_without_render_user/)
      assert.throws(() => renderUserOf({ SOPHIA_RENDER_UID: '0' }), /root_without_render_user/)
      assert.deepEqual(renderUserOf({ SOPHIA_RENDER_UID: '1000' }), { uid: 1000, gid: 1000 })
    },
  )

  it('runs as a command: a job file in, report.pdf and receipt.json out, never over an existing file', { skip }, () => {
    const job = sourcePackage({ 'report.html': REPORT, 'img/chart.png': PNG })
    const jobFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-job-')), 'job.json')
    fs.writeFileSync(jobFile, JSON.stringify(job))
    const run = () =>
      spawnSync(process.execPath, [KERNEL, '--job', jobFile], { env, encoding: 'utf8', timeout: 120_000 })
    const receiptOf = () => {
      const receipt: { status: string; error: { code: string } | null } = JSON.parse(
        fs.readFileSync(path.join(job.outputDir, 'receipt.json'), 'utf8'),
      )
      return receipt
    }
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    assert.equal(receiptOf().status, 'succeeded')
    const before = sha(fs.readFileSync(path.join(job.outputDir, 'report.pdf')))
    fs.rmSync(path.join(job.outputDir, 'receipt.json'))
    const second = run()
    assert.equal(second.status, 1, 'a second render into the same place fails')
    assert.equal(receiptOf().error?.code, 'render_error')
    assert.equal(sha(fs.readFileSync(path.join(job.outputDir, 'report.pdf'))), before, 'the first PDF is untouched')
  })
})
