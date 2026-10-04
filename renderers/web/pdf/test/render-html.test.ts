// SMC-M03 S5a: the confined PDF kernel against a real headless Chromium (the shell playwright-core 1.56.1 pins).
// On a host without it (macOS, no browser installed) the browser tests skip and say why; CI sets
// SOPHIA_RENDERER_REQUIRED=1, which turns a skip into a failure. The source checks need no browser and always run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  chromiumPath,
  judgeSandbox,
  JUDGE_PACKAGES,
  KERNEL_FILES,
  launchConfined,
  renderHtmlToPdf,
  rendererSha256,
  renderUserOf,
} from '../index.mjs'
import { pageChecks, pageTexts, SHORT_PAGE_WORDS } from '../pdf-text.mjs'

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
  scratchDir: string
}

/**
 * This file's renders keep their scratch here, so the leftover-process checks see only this file's browsers, never
 * one another test file renders at the same time (host-probe.test.ts). Open to the render user.
 */
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-kernel-test-'))
fs.chmodSync(SCRATCH, 0o755)
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }))

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
  return {
    sourceRoot: root,
    outputDir,
    entry: ref('report.html'),
    assets: assets.map(ref),
    language: 'it',
    scratchDir: SCRATCH,
  }
}

/** Processes still running for any render of this file. */
const lingering = () =>
  fs
    .readdirSync('/proc')
    .filter((n) => /^\d+$/.test(n))
    .filter((pid) => {
      try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(SCRATCH)
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

const words = (n: number, word = 'parola') => Array.from({ length: n }, () => word).join(' ')
const BREAK = '<div style="break-after: page"></div>'
/** Four pages: a full one, an empty one (only its footer), a short one, and a full last one. */
const PAGED = `<!doctype html><html><head><meta charset="utf-8"><title>Pagine</title></head><body>
<p>${words(200)}</p>${BREAK}${BREAK}<p>${words(12, 'breve')}</p>${BREAK}<p>${words(200, 'fine')}</p></body></html>`

/** One page's text facts, for the checks' rules. */
const page = (count: number, images = 0) => ({ words: count, images })

const KERNEL_DIR = fileURLToPath(new URL('..', import.meta.url))

/** Every module a file names with a literal: static, side-effect, re-export, dynamic and require, in either quote. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g
/** Every file a module starts or reads by its own location, with or without './', across lines. */
const STARTED = /new URL\(\s*(['"])((?:\.{1,2}\/)?[^'"\n:]+)\1\s*,\s*import\.meta\.url\s*,?\s*\)/g
/**
 * Anything else that loads code or names a file by the module's location. A kernel file holding one that is neither a
 * literal form above nor a reviewed site below fails the identity test, so a loader the parser cannot follow is never
 * silently outside the identity.
 */
const LOADER =
  /import\.meta|createRequire|getBuiltinModule|\brequire(?:\.resolve)?\s*\(|\bimport\s*\(|\bnew\s+Worker\b|child_process|(?<![.\w])(?:spawn|spawnSync|fork|exec|execFile|execSync|execFileSync)\s*\(|\beval\s*\(|\bnew\s+Function\b|\$\(dirname|^\s*(?:\.|source)\s+\S/m
/** The reviewed sites: each resolves a package's metadata, or names this module's own location for hashing or main. */
const KNOWN_LOADERS: Record<string, readonly string[]> = {
  'render-html.mjs': [
    "import { createRequire } from 'node:module'",
    'const HERE = path.dirname(fileURLToPath(import.meta.url))',
    'const from = via ? createRequire(kernel).resolve(`${via}/package.json`) : kernel',
    'manifest = createRequire(from).resolve(`${name}/package.json`)',
    "return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1] ?? '') === fileURLToPath(import.meta.url)",
  ],
  'confine.mjs': [
    "import { createRequire } from 'node:module'",
    'const require = createRequire(import.meta.url)',
    "const pkg = path.dirname(require.resolve('playwright-core/package.json'))",
  ],
}

/** What a file's text names: modules (relative, package or node:) and the files it starts. */
function namedBy(text: string): { modules: string[]; started: string[] } {
  return {
    modules: [...text.matchAll(SPECIFIER)].map((m) => m[2] ?? ''),
    started: [...text.matchAll(STARTED)].map((m) => m[2] ?? ''),
  }
}

/** The lines of a file that load code in a way the parser does not follow, and are not reviewed sites. */
function unexplainedLoaders(file: string, text: string): string[] {
  const parsed = text.replaceAll(STARTED, 'STARTED').replaceAll(/\bimport\s*\(\s*(['"])[^'"\n]+\1\s*\)/g, 'IMPORTED')
  const known = new Set(KNOWN_LOADERS[file] ?? [])
  return parsed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('#!'))
    .filter((line) => LOADER.test(line) && !known.has(line))
}

/** A path the kernel names, relative to the kernel's directory; it never leaves it. */
function kernelPath(from: string, specifier: string): string {
  const relative = path.relative(KERNEL_DIR, path.resolve(KERNEL_DIR, path.dirname(from), specifier))
  assert.ok(
    !relative.startsWith('..') && !path.isAbsolute(relative),
    `${from} reaches outside the kernel: ${specifier}`,
  )
  return relative.split(path.sep).join('/')
}

/** A bare specifier's package, with its scope. */
const packageOf = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

/**
 * The kernel's own files, from render-html.mjs through everything it imports or starts, transitively; the packages
 * they import (node: builtins aside); and every loader line the parser could not follow.
 */
function importClosure(): { files: Set<string>; packages: Set<string>; unexplained: string[] } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const unexplained: string[] = []
  const queue = ['render-html.mjs']
  while (queue.length > 0) {
    const file = queue.shift() ?? ''
    if (files.has(file)) continue
    files.add(file)
    const text = fs.readFileSync(path.join(KERNEL_DIR, file), 'utf8')
    const { modules, started } = namedBy(text)
    for (const specifier of modules) {
      if (specifier.startsWith('.')) queue.push(kernelPath(file, specifier))
      else if (!specifier.startsWith('node:')) packages.add(packageOf(specifier))
    }
    for (const name of started) queue.push(kernelPath(file, name))
    unexplained.push(...unexplainedLoaders(file, text).map((line) => `${file}: ${line}`))
  }
  return { files, packages, unexplained }
}

/**
 * Every file a judgement loads, recorded by a module hook in a child process that loads the kernel and reads a
 * one-page PDF back: the kernel's own files (relative to it) and, per package, the files loaded from it.
 */
function judgementLoads(): { own: string[]; packages: Map<string, string[]> } {
  const program = `
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
const loaded = []
registerHooks({ load(url, context, nextLoad) { loaded.push(url); return nextLoad(url, context) } })
const dir = pathToFileURL(process.argv[1] + '/')
await import(new URL('render-html.mjs', dir).href)
const { pageTexts } = await import(new URL('pdf-text.mjs', dir).href)
const pdf = '%PDF-1.4\\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\\n' +
  '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>> endobj\\ntrailer <</Root 1 0 R>>\\n%%EOF'
const pages = await pageTexts(Buffer.from(pdf), 10)
if (pages?.length !== 1) throw new Error('the PDF was not read')
process.stdout.write(JSON.stringify(loaded.filter((u) => u.startsWith('file:'))))
`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', program, '--', KERNEL_DIR], {
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.equal(run.status, 0, run.stderr)
  const own: string[] = []
  const packages = new Map<string, string[]>()
  for (const url of JSON.parse(run.stdout) as string[]) {
    const file = fileURLToPath(url)
    const inPackage = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\/(.*)$/.exec(file)
    if (inPackage) packages.set(inPackage[1] ?? '', [...(packages.get(inPackage[1] ?? '') ?? []), inPackage[2] ?? ''])
    else own.push(path.relative(fs.realpathSync(KERNEL_DIR), file).split(path.sep).join('/'))
  }
  return { own, packages }
}

describe('the kernel identity (M03-RF-0018)', () => {
  it('reads every literal way a module names code, and flags every other loader', () => {
    const text = [
      `import a from './a.mjs'`,
      `import "./side-effect.mjs"`,
      `export { b } from "../up/b.mjs"`,
      `const c = await import('./c.mjs')`,
      `const d = require("@scope/pkg/deep.js")`,
      `import e from 'node:fs'`,
      `const f = fileURLToPath(new URL("./bin/f", import.meta.url))`,
      `const g = new URL(\n  'g.json',\n  import.meta.url,\n)`,
    ].join('\n')
    assert.deepEqual(namedBy(text), {
      modules: ['./a.mjs', './side-effect.mjs', '../up/b.mjs', './c.mjs', '@scope/pkg/deep.js', 'node:fs'],
      started: ['./bin/f', 'g.json'],
    })
    assert.equal(packageOf('@scope/pkg/deep.js'), '@scope/pkg')
    assert.equal(packageOf('pdfjs-dist/legacy/build/pdf.mjs'), 'pdfjs-dist')
    // A reviewer's list of loaders the parser cannot follow: each is flagged, so the test fails until it is reviewed.
    for (const line of [
      'const x = await import(`./judge-rules.mjs`)',
      "const x = await import(/* note */ './judge-rules.mjs')",
      "const load = createRequire(import.meta.url); load('./judge-rules.cjs')",
      "const x = await import(import.meta.resolve('./judge-rules.mjs'))",
      "fs.readFileSync(path.join(import.meta.dirname, 'judge-rules.json'))",
      "new Worker(path.join(HERE, 'x.mjs'))",
      "spawn(process.execPath, ['x.mjs'])",
      '. "$(dirname "$0")/x.sh"',
    ]) {
      assert.deepEqual(unexplainedLoaders('pdf-text.mjs', line), [line], line)
    }
    assert.deepEqual(unexplainedLoaders('pdf-text.mjs', `const g = new URL(\n  './g.json',\n  import.meta.url,\n)`), [])
    assert.deepEqual(unexplainedLoaders('pdf-text.mjs', `/** @type {import('./confine.mjs').X} */ (null)`), [])
  })

  it('covers every module the kernel runs, the wrapper it starts the browser through, and the packages that judge', () => {
    const { files, packages, unexplained } = importClosure()
    assert.ok(files.has('pdf-text.mjs'), 'the page judge is part of the kernel')
    assert.ok(files.has('bin/confine-chromium'))
    assert.deepEqual([...files].toSorted(), [...KERNEL_FILES].toSorted())
    assert.deepEqual(unexplained, [], 'every loader is followed by the parser or reviewed')
    // Playwright drives the browser and is reported on its own (its version and the browser's); every other package
    // the kernel imports judges, and is part of the identity.
    assert.ok(packages.has('playwright-core'))
    assert.deepEqual(
      [...packages].filter((name) => name !== 'playwright-core').toSorted(),
      JUDGE_PACKAGES.filter((judge) => !judge.via)
        .map((judge) => judge.name)
        .toSorted(),
    )
  })

  it('a judgement loads nothing the identity leaves out: the kernel’s files and each judging package’s files', () => {
    // Importing the kernel never depends on what the importing process was started with.
    const imported = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(KERNEL)})`, '--', 'file:///not/a/path'],
      { encoding: 'utf8', timeout: 60_000 },
    )
    assert.equal(imported.status, 0, imported.stderr)
    const { own, packages } = judgementLoads()
    assert.ok(own.includes('pdf-text.mjs'))
    for (const file of own) assert.ok(KERNEL_FILES.includes(file), file)
    packages.delete('playwright-core')
    assert.deepEqual(
      Object.fromEntries([...packages].map(([name, files]) => [name, [...new Set(files)].toSorted()])),
      Object.fromEntries(JUDGE_PACKAGES.map((judge) => [judge.name, [...judge.files].toSorted()])),
    )
  })

  it('changes when any of those files changes, the page judge’s thresholds and its pdf.js included', () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-kernel-copy-'))
    try {
      for (const f of KERNEL_FILES) {
        fs.mkdirSync(path.dirname(path.join(copy, f)), { recursive: true })
        fs.copyFileSync(path.join(KERNEL_DIR, f), path.join(copy, f))
      }
      // The copy resolves each judging package from its own node_modules: the installed manifest and loaded files.
      const kernelRequire = createRequire(path.join(KERNEL_DIR, 'render-html.mjs'))
      const copied = JUDGE_PACKAGES.map((judge) => {
        const from = judge.via ? kernelRequire.resolve(`${judge.via}/package.json`) : path.join(KERNEL_DIR, 'x.mjs')
        const installed = path.dirname(createRequire(from).resolve(`${judge.name}/package.json`))
        const root = path.join(copy, 'node_modules', judge.name)
        for (const f of ['package.json', ...judge.files]) {
          fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
          fs.copyFileSync(path.join(installed, f), path.join(root, f))
        }
        return { judge, root }
      })
      const identity = rendererSha256()
      assert.equal(rendererSha256(copy), identity, 'the same bytes, the same identity')
      // Codex's probe: a judge that calls a page blank up to 1000 words is another judge.
      const judgeFile = path.join(copy, 'pdf-text.mjs')
      const original = fs.readFileSync(judgeFile, 'utf8')
      assert.ok(original.includes('p.words <= 1 &&'))
      fs.writeFileSync(judgeFile, original.replace('p.words <= 1 &&', 'p.words <= 1000 &&'))
      assert.notEqual(rendererSha256(copy), identity)
      fs.writeFileSync(judgeFile, original)
      const changed = (file: string, label: string) => {
        const bytes = fs.readFileSync(file)
        fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n')]))
        assert.notEqual(rendererSha256(copy), identity, label)
        fs.writeFileSync(file, bytes)
      }
      for (const f of KERNEL_FILES) changed(path.join(copy, f), f)
      for (const { judge, root } of copied) {
        for (const f of judge.files) changed(path.join(root, f), `${judge.name}/${f}`)
        const manifest = path.join(root, 'package.json')
        const installed = fs.readFileSync(manifest)
        const pkg = JSON.parse(installed.toString('utf8')) as { version: string }
        fs.writeFileSync(manifest, JSON.stringify({ ...pkg, version: `${pkg.version}-other` }))
        assert.notEqual(rendererSha256(copy), identity, `${judge.name}'s version`)
        fs.writeFileSync(manifest, installed)
        const moved = `${root}-moved`
        fs.renameSync(root, moved)
        assert.notEqual(rendererSha256(copy), identity, `${judge.name} absent`)
        fs.renameSync(moved, root)
      }
      assert.equal(rendererSha256(copy), identity, 'restored')
    } finally {
      fs.rmSync(copy, { recursive: true, force: true })
    }
  })
})

describe('the printed pages, read back (pdf-text.mjs)', () => {
  it('names blank pages anywhere and short pages between the first and the last; an image keeps a page', () => {
    const pages = [page(30), page(0), page(1), page(40), page(0, 1), page(200), page(5)]
    assert.deepEqual(pageChecks(pages, 7), {
      blank: { outcome: 'failed', detail: 'pages 2, 3' },
      short: { outcome: 'failed', detail: 'page 4' },
    })
    assert.deepEqual(pageChecks([page(5), page(SHORT_PAGE_WORDS), page(3)], 3), {
      blank: { outcome: 'passed', detail: null },
      short: { outcome: 'passed', detail: null },
    })
    const many = Array.from({ length: 14 }, () => page(0))
    assert.equal(pageChecks(many, 14).blank.detail, 'pages 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …')
  })

  it('is unknown, never passed, when the text could not be read or the pages disagree with the count', () => {
    const unknown = { outcome: 'unknown', detail: 'the PDF text could not be read' }
    assert.deepEqual(pageChecks(null, 2), { blank: unknown, short: unknown })
    assert.deepEqual(pageChecks([], null).blank.outcome, 'unknown')
    assert.deepEqual(pageChecks([page(100)], 2).short, {
      outcome: 'unknown',
      detail: 'the pages read disagree with the page count',
    })
  })

  it('refuses bytes that are not a PDF', async () => {
    await assert.rejects(pageTexts(new TextEncoder().encode('<html>not a pdf</html>'), 45))
  })

  it(
    'counts the body of each printed page, never its footer, and names a blank and a short page',
    { skip },
    async () => {
      const job = sourcePackage({ 'report.html': PAGED })
      const receipt = await renderHtmlToPdf(job, { env })
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      assert.equal(receipt.output?.pageCount, 4)
      const pages = await pageTexts(fs.readFileSync(path.join(job.outputDir, 'report.pdf')), (16 / 25.4) * 72)
      assert.deepEqual(
        pages.map((pg) => pg.words),
        [200, 0, 12, 200],
        'the footer ("2 / 4") is not counted',
      )
      assert.deepEqual(
        receipt.checks.filter((c) => c.name === 'blank_pages' || c.name === 'short_pages'),
        [
          { name: 'blank_pages', outcome: 'failed', detail: 'page 2' },
          { name: 'short_pages', outcome: 'failed', detail: 'page 3' },
        ],
      )
      assert.equal(
        outcome(receipt, 'layout_overflow'),
        'passed',
        'a page check is the service’s to judge, not the kernel’s',
      )
    },
  )
})

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
    for (const name of [...passed, 'blank_pages', 'short_pages']) assert.equal(outcome(receipt, name), 'passed', name)
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
    const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-render-'))
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
