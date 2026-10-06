// SDD-01: the confined capture kernel against a real headless Chromium. Like the PDF kernel's tests, the browser tests
// skip on a host without the renderer and say why; CI sets SOPHIA_RENDERER_REQUIRED=1, which turns a skip into a
// failure. The pure parts (tiling, margins, the job's checks, the identity) need no browser and always run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  asCaptureJob,
  CAPTURE_KERNEL_FILES,
  CAPTURE_LIMITS,
  CAPTURE_TARGETS,
  captureHtml,
  captureSha256,
  marginsOf,
  targetChecks,
  tilesOf,
} from '../capture-html.mjs'
import { MARK_CLASS, MAX_MEASURED } from '../capture-page.mjs'
import { chromiumPath } from '../confine.mjs'

const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')
const KERNEL_DIR = fileURLToPath(new URL('..', import.meta.url))
const KERNEL = path.join(KERNEL_DIR, 'capture-html.mjs')

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
const skip = why ?? false

/** This file's captures keep their scratch here, so the leftover-process check sees only its own browsers. */
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-capture-test-'))
fs.chmodSync(SCRATCH, 0o755)
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }))

/** A one-file designed page, world-readable, and its job. */
function job(html: string, extra: Record<string, unknown> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-capture-src-'))
  fs.chmodSync(root, 0o755)
  fs.writeFileSync(path.join(root, 'index.html'), html, { mode: 0o644 })
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-capture-out-'))
  return {
    sourceRoot: root,
    outputDir,
    entry: { path: 'index.html', sha256: sha(html) },
    language: 'en',
    targets: ['w390-light', 'w1280-light'],
    scratchDir: SCRATCH,
    ...extra,
  }
}

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

type Receipt = Awaited<ReturnType<typeof captureHtml>>
const outcome = (r: Receipt, name: string, target: string | null = null) =>
  r.checks.find((c) => c.name === name && c.target === target)?.outcome
/** The kernel's name for the element outside the blocks that holds `text`, by its order on the page. */
function framingId(r: Receipt, text: string): string | undefined {
  const order = [
    'Seen everywhere',
    'Printed only',
    'Between the widths',
    'Read aloud only',
    'On wide screens',
    'On narrow screens',
  ]
  const n = order.findIndex((t) => t.startsWith(text)) + 1
  return r.targets[0]?.page.framing.find((m) => m.id.startsWith(`text ${n} `))?.id
}
/** Whether a check's detail lists an element among its ids. */
const lists = (detail: string, id: string) => detail.split(/[,;] /u).includes(id)
const issuesOf = (r: Receipt, target: string) =>
  Object.fromEntries((r.targets.find((t) => t.id === target)?.page.blocks ?? []).map((b) => [b.id, b.issues]))

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`
const page = (style: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">${CSP}<title>Report</title><style>${style}</style></head><body>${body}</body></html>`

const BASE =
  'body{margin:0;font:18px/1.5 Georgia,serif;color:#222;background:#fafafa} section{padding:1rem 2rem;max-width:60rem;margin:auto}'
/** A page with one defect of each kind the measures name, and a 100vh hero on a gradient. */
const DEFECTS = page(
  `${BASE} .hero{min-height:100vh;background:linear-gradient(#123,#345);color:#fff} .low{color:#bbb}
   .clip{height:1.2em;overflow:hidden} .gone{display:none} .over{position:absolute;left:0;top:0;width:100%;height:3em;background:#fff}
   .box{width:120px;overflow:hidden} .box p{width:400px}`,
  `<header><h1>Title</h1></header><main>
  <section data-section="intro" class="hero"><p data-block="b1">On the gradient.</p></section>
  <section data-section="body"><p data-block="b2">Plain text.</p><p data-block="b3" class="low">Low contrast.</p>
  <p data-block="b4" class="clip">${'Cut text that runs on. '.repeat(30)}</p><p data-block="b5" class="gone">Hidden.</p>
  <div style="position:relative"><p data-block="b6">Covered text.</p><div class="over"></div></div>
  <div class="box"><p data-block="b7">Clipped by its container, which hides what overflows it.</p></div></section>
  <section data-section="tall"><div style="height:2600px"><p data-block="b8">Tall.</p></div></section>
  </main><footer><p>Foot</p></footer>`,
)
const CLEAN = page(
  `${BASE} h1{font-size:2.4rem} .note{color:#555}`,
  `<main><h1>A clean report</h1><section data-section="s1"><p data-block="b1">First paragraph.</p>
  <ul><li data-block="b2">An item.</li></ul></section><section data-section="sources"><ol><li data-source="s1" class="note">Source.</li></ol></section></main>`,
)

/** One element's measures outside the blocks, and a target's page holding them. */
const framed = (id: string, issues: string[] = [], ratio: number | null = 12) => ({
  id,
  section: null,
  box: { x: 0, y: 0, width: 100, height: 20 },
  fontPx: 18,
  issues,
  contrast: { ratio, floor: 4.5, large: false, detail: null },
})

describe('the capture plan (pure)', () => {
  it('cuts a span into equal tiles, the last one shorter', () => {
    assert.deepEqual(tilesOf(100, 2500, 1000), [
      { y: 100, height: 1000 },
      { y: 1100, height: 1000 },
      { y: 2100, height: 500 },
    ])
    assert.deepEqual(tilesOf(0, 10, 1000), [{ y: 0, height: 10 }])
  })

  it('names every stretch of the page outside the sections, ignoring slivers', () => {
    const sections = [
      { y: 300, height: 500 },
      { y: 100, height: 210 },
      { y: 900, height: 100 },
    ]
    assert.deepEqual(marginsOf(sections, 1200), [
      { y: 0, height: 100 },
      { y: 800, height: 100 },
      { y: 1000, height: 200 },
    ])
    assert.deepEqual(marginsOf([{ y: 10, height: 1180 }], 1200), [])
    // #117: a sliver that holds text the page shows (a one-line footer) is a margin too; a box that only grazes it is not.
    const footer = { y: 1184, height: 14 }
    assert.deepEqual(marginsOf([{ y: 10, height: 1170 }], 1200, [footer]), [{ y: 1180, height: 20 }])
    assert.deepEqual(marginsOf([{ y: 10, height: 1170 }], 1200, [{ y: 1170, height: 12 }]), [])
    assert.deepEqual(marginsOf([{ y: 10, height: 1170 }], 1200), [])
  })

  it('admits the two light targets of html-design-v1 and bounds every job', () => {
    assert.deepEqual(Object.keys(CAPTURE_TARGETS), ['w390-light', 'w1280-light'])
    assert.ok(CAPTURE_LIMITS.captures > 0 && CAPTURE_LIMITS.totalBytes > CAPTURE_LIMITS.imageBytes)
  })

  it('reads a job file and refuses one that is malformed', () => {
    const read = asCaptureJob({ sourceRoot: '/s', outputDir: '/o', language: 'en', entry: {}, targets: ['w390-light'] })
    assert.deepEqual([read.targets, read.sections], [['w390-light'], null])
    assert.throws(
      () => asCaptureJob({ sourceRoot: '/s', outputDir: '/o', language: 'en', targets: 'w390-light' }),
      /targets/,
    )
    assert.throws(() => asCaptureJob(null), /JSON object/)
  })

  it('refuses a bad target, section list, language or source before any browser starts', async () => {
    for (const [extra, code] of [
      [{ targets: ['w1920-dark'] }, 'invalid_target'],
      [{ targets: ['w390-light', 'w390-light'] }, 'invalid_target'],
      [{ targets: [] }, 'invalid_target'],
      [{ sections: ['Bad Id'] }, 'invalid_sections'],
      [{ sections: [] }, 'invalid_sections'],
      [{ language: 'english!' }, 'invalid_language'],
      [{ entry: { path: 'index.html', sha256: '0'.repeat(64) } }, 'hash_mismatch'],
    ] as const) {
      const receipt = await captureHtml(job(CLEAN, extra), { env })
      assert.deepEqual([receipt.status, receipt.error?.code], ['failed', code], JSON.stringify(extra))
      assert.equal(receipt.sandbox, null, 'no browser was started')
    }
  })

  it('holds text outside the blocks to what a block is at each target: shown, readable, and measured (#117)', () => {
    const coverage = { requested: null, captured: [], missing: [], margins: 0, marginsCaptured: 0, truncated: false }
    const measures = (framing: ReturnType<typeof framed>[]) =>
      ({ overflowPx: 0, blocks: [framed('b1')], shown: [], framing }) as unknown as Parameters<typeof targetChecks>[1]
    const at = (framing: ReturnType<typeof framed>[], unmeasured = 0) =>
      Object.fromEntries(
        targetChecks(CAPTURE_TARGETS['w390-light']!, measures(framing), coverage, unmeasured).map((c) => [
          c.name,
          [c.outcome, c.detail],
        ]),
      )
    const muted = at([framed('text 1 h2'), framed('text 2 p', ['low_contrast'], 2.4)])
    assert.deepEqual(muted.contrast, ['failed', 'text 2 p'])
    assert.deepEqual(muted.blocks_visible, ['passed', null], 'shown here, only hard to read')
    const elsewhere = at([framed('text 1 h2', ['not_rendered', 'low_contrast'], 2.4), framed('text 2 a', ['scrolls'])])
    assert.deepEqual(
      elsewhere.blocks_visible,
      ['failed', 'text 1 h2, text 2 a'],
      'hidden at this target, or scrolled out of view where the page starts: its capture lacks it',
    )
    assert.deepEqual(elsewhere.contrast, ['passed', null], 'a hidden text is not read for contrast')
    for (const issue of ['clipped', 'off_page', 'text_cut', 'covered', 'no_visible_text', 'transparent', 'hidden'])
      assert.equal(at([framed('text 1 h2', [issue])]).blocks_visible?.[0], 'failed', issue)
    const scrolling = { overflowPx: 0, blocks: [framed('b1', ['scrolls'])], shown: [], framing: [] }
    const block = targetChecks(
      CAPTURE_TARGETS['w390-light']!,
      scrolling as unknown as Parameters<typeof targetChecks>[1],
      coverage,
    ).find((c) => c.name === 'blocks_visible')
    assert.equal(block?.outcome, 'passed', 'a block the reader scrolls to is the research: shown')
    assert.deepEqual(at([framed('text 1 h2', [], null)]).contrast, ['unknown', 'unmeasured: text 1 h2'])
    const over = at([framed('text 1 h2')], 3)
    assert.equal(over.blocks_visible?.[0], 'failed')
    assert.match(String(over.blocks_visible?.[1]), new RegExp(`3 more .* than the ${String(MAX_MEASURED)} measured`))
  })

  it('takes the marks that say nothing from the design profile, so both judge the same text (#117)', () => {
    const css = fs.readFileSync(
      fileURLToPath(new URL('../../../../packages/design/src/css.ts', import.meta.url)),
      'utf8',
    )
    const profile = /const MARK_TEXT = \/\^\[(.*)\]\*\$\/u/.exec(css)?.[1]
    assert.equal(MARK_CLASS, profile)
    const words = new RegExp(`[^\\s${MARK_CLASS}]`, 'u')
    assert.deepEqual(
      ['·', ' | ', '• — →', '[1]', 'Ⓗ', 'Sources', '§ 3'].map((t) => words.test(t)),
      [false, false, false, true, true, true, true],
    )
  })

  it('keeps nothing when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const j = job(CLEAN)
    const receipt = await captureHtml(j, { env, signal: controller.signal })
    assert.deepEqual([receipt.status, receipt.error?.code, receipt.captures], ['cancelled', 'cancelled', []])
    assert.deepEqual(fs.readdirSync(j.outputDir), [])
  })
})

describe('the capture kernel identity', () => {
  it('is every module the kernel imports, transitively, and the wrapper it starts the browser through', () => {
    const files = new Set<string>()
    const queue = ['capture-html.mjs']
    while (queue.length > 0) {
      const file = queue.shift() ?? ''
      if (files.has(file)) continue
      files.add(file)
      const text = fs.readFileSync(path.join(KERNEL_DIR, file), 'utf8')
      for (const m of text.matchAll(/\bfrom\s*(['"])(\.[^'"]+)\1/g))
        queue.push(path.join(path.dirname(file), m[2] ?? ''))
      for (const m of text.matchAll(/new URL\(\s*(['"])(\.{0,2}\/?[^'":]+)\1\s*,\s*import\.meta\.url/g)) {
        queue.push(path.join(path.dirname(file), m[2] ?? ''))
      }
    }
    assert.deepEqual([...files].toSorted(), [...CAPTURE_KERNEL_FILES].toSorted())
  })

  it('changes when any of its files changes', () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-capture-kernel-'))
    try {
      for (const f of CAPTURE_KERNEL_FILES) {
        fs.mkdirSync(path.dirname(path.join(copy, f)), { recursive: true })
        fs.copyFileSync(path.join(KERNEL_DIR, f), path.join(copy, f))
      }
      const base = captureSha256(copy)
      assert.equal(base, captureSha256(KERNEL_DIR))
      for (const f of CAPTURE_KERNEL_FILES) {
        const file = path.join(copy, f)
        const original = fs.readFileSync(file)
        fs.appendFileSync(file, '\n')
        assert.notEqual(captureSha256(copy), base, f)
        fs.writeFileSync(file, original)
      }
    } finally {
      fs.rmSync(copy, { recursive: true, force: true })
    }
  })
})

describe('the confined capture kernel', () => {
  it('has a confined browser wherever the renderer is required', () => {
    if (process.env.SOPHIA_RENDERER_REQUIRED === '1') assert.equal(why, null, `the renderer is required here: ${why}`)
  })

  it(
    'captures a clean page at both targets: overview, sections and margins, every check passed',
    { skip },
    async () => {
      const j = job(CLEAN)
      const receipt = await captureHtml(j, { env })
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        for (const name of ['layout_overflow', 'blocks_visible', 'contrast', 'captures_complete']) {
          assert.equal(outcome(receipt, name, target), 'passed', `${name} at ${target}`)
        }
      }
      for (const name of ['source_verified', 'sandbox_active', 'requests_contained', 'source_unchanged']) {
        assert.equal(outcome(receipt, name), 'passed', name)
      }
      assert.equal(receipt.sandbox?.active, true)
      assert.match(receipt.renderer.browser ?? '', /^\d+\./)
      assert.ok(receipt.fonts.length > 0, 'the fonts the text was drawn with are named')
      const names = receipt.captures.map((c) => c.name)
      for (const t of ['w390-light', 'w1280-light']) {
        assert.ok(names.includes(`${t}.overview.1.png`))
        assert.ok(names.includes(`${t}.section.s1.1.png`))
        assert.ok(names.includes(`${t}.section.sources.1.png`))
      }
      for (const c of receipt.captures) {
        const png = fs.readFileSync(path.join(j.outputDir, c.name))
        assert.deepEqual([sha(png), png.byteLength], [c.sha256, c.bytes], c.name)
        assert.equal(png.readUInt32BE(16), c.width)
        const target = CAPTURE_TARGETS[c.target]!
        assert.equal(c.width, Math.round(target.width * c.scale), `${c.name} is the target's width at its scale`)
      }
      assert.deepEqual(lingering(), [], 'no browser process is left')
    },
  )

  it('names each defect: cut text, hidden, covered, clipped by a container and low contrast', { skip }, async () => {
    const receipt = await captureHtml(job(DEFECTS), { env })
    assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
    for (const target of ['w390-light', 'w1280-light']) {
      assert.deepEqual(issuesOf(receipt, target), {
        b1: [],
        b2: [],
        b3: ['low_contrast'],
        b4: ['text_cut'],
        b5: ['not_rendered'],
        b6: ['covered'],
        b7: ['clipped'],
        b8: [],
      })
      assert.equal(outcome(receipt, 'blocks_visible', target), 'failed')
      assert.equal(outcome(receipt, 'contrast', target), 'failed')
      const measured = receipt.targets.find((t) => t.id === target)!
      const b1 = measured.page.blocks.find((b) => b.id === 'b1')!
      assert.ok(b1.contrast.ratio! > 7, 'white on the dark gradient, at its worst stop')
      const hero = measured.page.sections.find((s) => s.id === 'intro')!
      assert.ok(hero.height < 1000, 'the 100vh hero keeps the viewport height while the page is captured')
      const tall = receipt.captures.filter((c) => c.target === target && c.section === 'tall')
      assert.ok(tall.length >= 3, 'a tall section is cut into readable tiles')
      assert.ok(tall.every((c) => c.clip.height <= CAPTURE_TARGETS[target]!.tileHeight))
      assert.ok(
        receipt.captures.some((c) => c.target === target && c.kind === 'margin'),
        'the header and footer',
      )
    }
  })

  it(
    'holds a label a name or a reference rests on to what a block is held to, inside and out (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
           .cp{clip-path:inset(50%)} .ti{text-indent:-9999px} .ghost{color:transparent}`,
            `<main><section data-section="s1"><h2 data-sophia-shown="h2:1">Findings</h2><p data-block="b1">Text.</p>
          <h2 data-sophia-shown="h2:2" class="vh">Hidden from the eye</h2><h2 data-sophia-shown="h2:3" class="cp">Clipped away</h2>
          <h2 data-sophia-shown="h2:4" class="ti">Indented away</h2><h2 data-sophia-shown="h2:5" class="ghost">Transparent</h2>
          <h2 data-sophia-shown="h2:6">Seen <span class="vh">with a concealed part</span></h2></section></main>`,
          ),
          { targets: ['w1280-light'] },
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      const shown = Object.fromEntries((receipt.targets[0]!.page.shown ?? []).map((b) => [b.id, b.issues]))
      assert.deepEqual(shown['label h2:1'], [], JSON.stringify(shown))
      assert.ok((shown['label h2:2'] ?? []).length > 0, JSON.stringify(shown))
      assert.ok(shown['label h2:3']?.includes('clipped'), JSON.stringify(shown))
      assert.ok(shown['label h2:4']?.includes('off_page'), JSON.stringify(shown))
      assert.ok(shown['label h2:5']?.includes('low_contrast'), JSON.stringify(shown))
      assert.deepEqual(shown['label h2:6'], [], JSON.stringify(shown))
      assert.ok((shown['label h2:6 span'] ?? []).length > 0, JSON.stringify(shown))
      assert.equal(outcome(receipt, 'blocks_visible', 'w1280-light'), 'failed')
      assert.equal(outcome(receipt, 'contrast', 'w1280-light'), 'failed')
      const named = receipt.checks.find((c) => c.name === 'blocks_visible')?.detail ?? ''
      for (const id of ['label h2:2', 'label h2:3', 'label h2:4', 'label h2:6 span'])
        assert.ok(named.includes(id), named)
      assert.equal(named.includes('label h2:1,'), false, named)
    },
  )

  it(
    'fails text outside the blocks at each target that hides it: print only, another width, a screen reader, one width of two (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .print{display:none} @media print{.print{display:block}}
           @media (min-width:700px) and (max-width:900px){.between{display:block}} .between{display:none}
           .vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
           @media (max-width:500px){.wide-only{display:none}} @media (min-width:900px){.narrow-only{display:none}}`,
            `<main><section data-section="s1"><h2>Seen everywhere</h2><p data-block="b1">Text.</p>
          <h2 class="print">Printed only</h2><h2 class="between">Between the widths</h2><h2 class="vh">Read aloud only</h2>
          <h2 class="wide-only">On wide screens</h2><h2 class="narrow-only">On narrow screens</h2><p>·</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const [target, hides, shows] of [
        ['w390-light', ['Printed', 'Between', 'Read aloud', 'On wide'], ['Seen everywhere', 'On narrow']],
        ['w1280-light', ['Printed', 'Between', 'Read aloud', 'On narrow'], ['Seen everywhere', 'On wide']],
      ] as const) {
        assert.equal(outcome(receipt, 'blocks_visible', target), 'failed', target)
        const detail = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === target)?.detail ?? ''
        for (const hidden of hides.map((t) => framingId(receipt, t)))
          assert.ok(hidden && lists(detail, hidden), `${target}: ${hidden} in ${detail}`)
        for (const seen of shows.map((t) => framingId(receipt, t)))
          assert.ok(seen && !lists(detail, seen), `${target}: ${seen} in ${detail}`)
      }
    },
  )

  it(
    'fails text outside the blocks a target shows too faintly to read, by colour, opacity or fill; a pale separator says nothing (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .muted{color:#aaa} .sep{color:#ddd} .faint{opacity:.12} .fill{-webkit-text-fill-color:transparent}
           .filtered{filter:opacity(.1)} .group{background:#000;color:#fff;opacity:.5}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2 class="muted">Muted heading</h2><p class="sep">·</p><h2 class="faint">Faint heading</h2>
          <h2 class="fill">Unfilled heading</h2><h2 class="filtered">Filtered heading</h2>
          <h2 class="group">Grouped heading</h2></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      const framing = receipt.targets[0]!.page.framing
      assert.deepEqual(
        framing.map((m) => m.id),
        ['text 1 h2', 'text 2 h2', 'text 3 h2', 'text 4 h2', 'text 5 h2', 'text 6 h2'],
        'the separator is not measured',
      )
      assert.deepEqual(framing[4]?.contrast.detail, 'filtered', 'a filter changes the colours: unknown, never passed')
      assert.deepEqual(
        framing[5]?.contrast.detail,
        'group_opacity',
        'its background fades with it: unknown, never passed',
      )
      for (const target of ['w390-light', 'w1280-light']) {
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
        const detail = receipt.checks.find((c) => c.name === 'contrast' && c.target === target)?.detail ?? ''
        assert.equal(detail, 'text 2 h2, text 3 h2, text 4 h2', target)
        assert.equal(outcome(receipt, 'blocks_visible', target), 'passed', target)
      }
    },
  )

  it(
    'judges a scrolling box as the page starts: a text it holds out of view fails, and no measurement leaves it scrolled (#117)',
    { skip },
    async () => {
      const long = 'A long paragraph of the research, read by scrolling the box. '.repeat(40)
      const boxed = (inside: string) =>
        page(
          `${BASE} html,.box{scroll-behavior:smooth} .box{height:220px;overflow:auto;border:1px solid #ccc}`,
          `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <div class="box">${inside}</div></section></main>`,
        )
      // The security review's page: a claim first, a plain heading last. Measuring the last one used to leave the box
      // scrolled to it, so the captures showed the plain heading and never the claim, while the page opens on the claim.
      const hidden = await captureHtml(
        job(boxed(`<h3>Host three is free</h3><p data-block="b2">${long}</p><h3>Costs compared</h3>`)),
        { env },
      )
      assert.equal(hidden.status, 'succeeded', JSON.stringify(hidden.error))
      for (const target of ['w390-light', 'w1280-light']) {
        assert.equal(outcome(hidden, 'blocks_visible', target), 'failed', target)
        const detail = hidden.checks.find((c) => c.name === 'blocks_visible' && c.target === target)?.detail ?? ''
        // Texts outside the blocks, in page order: "Findings", the claim, the plain heading.
        const ids = hidden.targets.find((t) => t.id === target)?.page.framing.map((m) => m.id)
        assert.deepEqual(ids, ['text 1 h2', 'text 2 h3', 'text 3 h3'], target)
        assert.ok(lists(detail, 'text 3 h3'), `${target}: the heading out of view fails: ${detail}`)
        assert.ok(!lists(detail, 'text 2 h3'), `${target}: the heading the box opens on is seen: ${detail}`)
        assert.deepEqual(issuesOf(hidden, target).b2, ['scrolls'], 'the block is read by scrolling: shown')
      }
      // A heading the box opens on, above a block that runs past it: measuring the block scrolls the box, and every
      // scroll is put back, so the heading is placed, and captured, where the reader first sees it.
      const opens = await captureHtml(job(boxed(`<h3>Costs compared</h3><p data-block="b2">${long}</p>`)), { env })
      assert.equal(opens.status, 'succeeded', JSON.stringify(opens.error))
      for (const target of ['w390-light', 'w1280-light'])
        assert.equal(outcome(opens, 'blocks_visible', target), 'passed', target)
    },
  )

  it('captures a one-line footer outside the sections at full size (#117)', { skip }, async () => {
    const receipt = await captureHtml(
      job(
        page(
          `${BASE} section{min-height:1400px} footer{height:16px;margin:0;padding:0 2rem;font:12px/16px Georgia,serif}`,
          `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p></section></main>
          <footer>Prepared from the research package</footer>`,
        ),
        { targets: ['w1280-light'] },
      ),
      { env },
    )
    assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
    const margins = receipt.captures.filter((c) => c.kind === 'margin')
    assert.equal(margins.length, 1, JSON.stringify(receipt.captures.map((c) => c.name)))
    assert.ok(margins[0]!.clip.height < 24, `a sliver: ${String(margins[0]!.clip.height)}px`)
    assert.equal(margins[0]!.scale, 1, 'at full size')
  })

  it('names horizontal overflow and the element that causes it', { skip }, async () => {
    const receipt = await captureHtml(
      job(
        page(
          BASE,
          '<main><section data-section="a"><p data-block="b1">x</p><div id="wide" style="width:2000px">w</div></section></main>',
        ),
        {
          targets: ['w390-light'],
        },
      ),
      { env },
    )
    assert.equal(outcome(receipt, 'layout_overflow', 'w390-light'), 'failed')
    const measured = receipt.targets[0]!.page
    assert.ok(measured.overflowPx > 1000)
    assert.ok(measured.overflowing.some((e) => e.element.startsWith('div#wide')))
  })

  it('captures only the sections asked for, and names one the page does not have', { skip }, async () => {
    const receipt = await captureHtml(job(DEFECTS, { targets: ['w1280-light'], sections: ['body', 'missing'] }), {
      env,
    })
    assert.equal(receipt.status, 'succeeded')
    const kinds = new Set(receipt.captures.map((c) => `${c.kind}:${c.section ?? ''}`))
    assert.deepEqual([...kinds].toSorted(), ['overview:', 'section:body'])
    const { coverage } = receipt.targets[0]!
    assert.deepEqual([coverage.captured, coverage.missing, coverage.truncated], [['body'], ['missing'], true])
    assert.equal(outcome(receipt, 'captures_complete', 'w1280-light'), 'failed')
  })

  it('stops at the capture budget and names every section it did not capture', { skip }, async () => {
    const sections = Array.from(
      { length: 45 },
      (_, i) => `<section data-section="s${i + 1}"><p data-block="b${i + 1}">Part ${i + 1}.</p></section>`,
    )
    const receipt = await captureHtml(job(page(BASE, `<main>${sections.join('')}</main>`)), { env })
    assert.equal(receipt.status, 'succeeded')
    assert.equal(receipt.captures.length, CAPTURE_LIMITS.captures)
    const last = receipt.targets.at(-1)!
    assert.equal(last.coverage.truncated, true)
    assert.ok(last.coverage.missing.length > 0)
    assert.equal(outcome(receipt, 'captures_complete', last.id), 'failed')
  })

  it('refuses a page that asks for anything outside itself, and keeps no image', { skip }, async () => {
    const hostile = `<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://example.com/a.css"></head>
      <body><section data-section="a"><p data-block="b1">x</p><img src="https://example.com/x.png"></section></body></html>`
    const j = job(hostile, { targets: ['w390-light'] })
    const receipt = await captureHtml(j, { env })
    assert.deepEqual([receipt.status, receipt.error?.code], ['failed', 'blocked_request'])
    assert.ok(receipt.blockedRequests.some((r) => r.includes('example.com')))
    assert.deepEqual(receipt.captures, [])
    assert.deepEqual(fs.readdirSync(j.outputDir), [])
    assert.deepEqual(lingering(), [])
  })

  it('runs as a command: a job file in, the captures and receipt.json out', { skip }, () => {
    const j = job(CLEAN, { targets: ['w390-light'] })
    const jobFile = path.join(SCRATCH, `job-${process.pid}.json`)
    fs.writeFileSync(jobFile, JSON.stringify(j))
    const run = spawnSync(process.execPath, [KERNEL, '--job', jobFile], { env, encoding: 'utf8', timeout: 120_000 })
    assert.equal(run.status, 0, run.stderr)
    const receipt = JSON.parse(fs.readFileSync(path.join(j.outputDir, 'receipt.json'), 'utf8')) as Receipt
    assert.equal(receipt.status, 'succeeded')
    for (const c of receipt.captures) assert.ok(fs.existsSync(path.join(j.outputDir, c.name)))
    const again = spawnSync(process.execPath, [KERNEL, '--job', jobFile], { env, encoding: 'utf8', timeout: 120_000 })
    assert.notEqual(again.status, 0, 'never over an existing capture')
  })
})
