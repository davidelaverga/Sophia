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
import { runInNewContext } from 'node:vm'
import type { CDPSession } from 'playwright-core'
import {
  asCaptureJob,
  CAPTURE_KERNEL_FILES,
  CAPTURE_LIMITS,
  bandEnds,
  baseDirection,
  breakpointsOf,
  CAPTURE_TARGETS,
  captureHtml,
  captureSha256,
  fitMeasure,
  jsonbBytes,
  marginsOf,
  MEASURE_BYTES,
  RECEIPT_BYTES,
  SWEEP,
  sweepPlan,
  probeOf,
  targetChecks,
  tilesOf,
} from '../capture-html.mjs'
import {
  MARK_CLASS,
  MAX_LINES,
  MAX_LOOK_MS,
  MAX_MEASURED,
  MAX_OVERLAPS,
  MAX_POINTS,
  MAX_TEXT_RECTS,
  pageScript,
  orderScript,
} from '../capture-page.mjs'
import { meetingsOf, STYLES } from '../placement.mjs'
import { chromiumPath, launchConfined } from '../confine.mjs'

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

/** Seven gradients stacked as one background, the top one first, for the gradient stack test. */
const seven = (top: string, rest: string) =>
  [top, ...Array.from({ length: 6 }, () => rest)].map((g) => `linear-gradient(90deg,${g})`).join(',')

/** A research table of two plans and their prices, its cells' text in spans, for the table placement test. */
const researchTable = (id: string, cls = '', dir = '') =>
  `<table data-block="${id}" class="${cls}"${dir}><thead><tr><th><span>Plan</span></th><th><span>Price</span></th></tr></thead>` +
  '<tbody><tr><td>Basic</td><td><span>$10</span></td></tr><tr><td>Pro</td><td><span>$20</span></td></tr></tbody></table>'

/** What widths_visible says at a band end of the table placement test, where m4 and m5 are also drawn over text. */
const movedAt = (width: number, ids: string) =>
  `at ${width}px: m4, m5, tables whose cells are drawn under other headers or off their rows: ${ids};`

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`

/** A protocol double executes the actual trusted expression and tracks every viewport/snapshot read. */
function widthSession(fault = '') {
  const calls: { method: string; width: number }[] = []
  const world = { innerWidth: 0, document: { querySelectorAll: () => [] } }
  let reader: (() => unknown) | undefined
  const send = (method: string, params: Record<string, unknown>) => {
    if (method === 'Emulation.setDeviceMetricsOverride') world.innerWidth = Number(params.width)
    calls.push({ method, width: world.innerWidth })
    if (method === 'Emulation.setDeviceMetricsOverride') return {}
    if (method === 'Runtime.evaluate') {
      reader = runInNewContext(String(params.expression), world) as () => unknown
      return { result: { type: 'function', objectId: fault === 'no-handle' ? undefined : 'owned-reader' } }
    }
    if (method === 'Runtime.callFunctionOn') {
      assert.equal(params.objectId, 'owned-reader')
      const value = reader?.()
      return {
        result: { value: fault === 'wrong-width' ? [-1, '', ''] : value },
        exceptionDetails: fault === 'exception' ? {} : undefined,
      }
    }
    if (method === 'DOMSnapshot.captureSnapshot')
      return {
        strings: [],
        documents:
          fault === 'no-document'
            ? []
            : [{ nodes: {}, layout: { nodeIndex: [], styles: [], bounds: [] }, contentWidth: world.innerWidth }],
      }
    throw new Error(`unexpected protocol method ${method}`)
  }
  return {
    cdp: {
      send: (method: string, params: Record<string, unknown>) => Promise.resolve(send(method, params)),
    } as unknown as CDPSession,
    calls,
  }
}

describe('the retained width reader', () => {
  it('executes the trusted function again and snapshots every requested width across batches', async () => {
    const { cdp, calls } = widthSession()
    const probe = probeOf(cdp, 'ltr')
    const widths = Array.from({ length: 32 }, (_, k) => 320 + k)
    for (const batch of [widths, widths.toReversed()]) {
      assert.deepEqual(
        await probe(batch),
        batch.map(() => ({ state: '||' })),
      )
    }
    assert.equal(calls.filter((c) => c.method === 'Runtime.evaluate').length, 1)
    for (const method of [
      'Emulation.setDeviceMetricsOverride',
      'Runtime.callFunctionOn',
      'DOMSnapshot.captureSnapshot',
    ])
      assert.deepEqual(
        calls.filter((c) => c.method === method).map((c) => c.width),
        [...widths, ...widths.toReversed()],
      )
  })
  it('fails closed on missing handles, evaluation errors, wrong widths and unreadable snapshots', async () => {
    for (const fault of ['no-handle', 'exception', 'wrong-width', 'no-document']) {
      const { cdp } = widthSession(fault)
      const answers = await probeOf(cdp, 'ltr')([320, 321])
      assert.equal(answers.length, 2)
      assert.ok(
        answers.every((answer) => 'issue' in answer),
        fault,
      )
    }
  })
})

const page = (style: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">${CSP}<title>Report</title><style>${style}</style></head><body>${body}</body></html>`

/** The width sweep's check of a page in one section, whose targets show its block b1 (the wrap tests, #117). */
async function sweepOf(css: string, body: string) {
  const receipt = await captureHtml(
    job(
      page(
        `body{margin:0;font:16px/1.5 Georgia,serif;color:#222;background:#fafafa} ${css}`,
        `<main><section data-section="s1">${body}</section></main>`,
      ),
    ),
    { env },
  )
  assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
  for (const t of ['w390-light', 'w1280-light']) assert.equal(outcome(receipt, 'blocks_visible', t), 'passed', t)
  return receipt.checks.find((c) => c.name === 'widths_visible')
}
/** The wrap tests' items: 100px wide at 320 and 390px, 600px at 1280 and 2560px, too wide for one line between. */
const RESPONSIVE = 'min(600px,max(100px,calc(75vw - 200px)))'
/** A flex row of two items `size` wide, the second raised over the claim below it (#117, 4199947395). */
const row = (h: string, size: string) =>
  sweepOf(
    `.row{display:flex;flex-wrap:wrap;${h}} .row>div{width:${size};height:40px}
     .row .b{background:#fafafa;z-index:1} .claim{margin:0}`,
    '<div class="row"><div></div><div class="b"></div></div><p data-block="b1" class="claim">Not free.</p>',
  )
/** The owner's layout (4199984025): the claim placed where the second item, black and raised, wraps to. */
const ownerClaim = (size: string) =>
  sweepOf(
    `.layout{display:flex;flex-wrap:wrap;height:200px;position:relative}
     .first,.second{flex:0 0 ${size};height:100px} .second{background:black;position:relative;z-index:2}
     .claim{position:absolute;top:100px;left:0;width:100px;z-index:1;margin:0}`,
    '<div class="layout"><div class="first"></div><div class="second"></div><p data-block="b1" class="claim">Not free.</p></div>',
  )
/** The owner's flow (4200072778, 4200177121): two items, the second black, and the paragraph that follows. */
const flow = (layout: string, items: string) =>
  sweepOf(
    `.layout{${layout}} .first,.second{${items};height:100px} .second{background:black} p{margin:0;width:100px}`,
    '<div class="layout"><div class="first"></div><div class="second"></div></div><p data-block="b1">Not free.</p>',
  )
const flexFlow = (height: string, size: string) => flow(`display:flex;flex-wrap:wrap;${height}`, `flex:0 0 ${size}`)
const inlineFlow = (height: string, size: string) =>
  flow(`font-size:0;${height}`, `display:inline-block;vertical-align:top;width:${size}`)
/** How blocks_visible and widths_visible name blocks whose text is drawn out of its order or run together (#117). */
const RUN_TOGETHER = 'blocks whose text is drawn out of its order or with its words run together or off its line: '
/** How widths_visible names a band end laid out otherwise in a window of another height (#117, 4201008903). */
const otherHeights = (width: number) =>
  new RegExp(`at ${width}px: laid out otherwise in a window 320, 640, 1080, 2160px high than 800px`, 'u')
/** Whether a contrast is read, between two ratios. */
const readBetween = (c: { ratio: number | null; detail: string | null } | undefined, low: number, high: number) =>
  c?.detail === null && (c.ratio ?? 0) > low && (c.ratio ?? 0) < high
/** A sweep's check failed, its detail matching each pattern. */
function failsAt(read: { outcome: string; detail: string | null } | undefined, ...patterns: RegExp[]) {
  assert.equal(read?.outcome, 'failed', String(read?.detail))
  for (const p of patterns) assert.match(String(read?.detail), p)
}

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

/** Which of these breakpoints a width is past, as the sweep reads which conditions hold. */
const pastEach = (bps: number[]) => async (w: number) => Promise.resolve(bps.map((b) => w >= b).join())
/** Whether a width lies in 700–900px, as one condition. */
const inBand = async (w: number) => Promise.resolve(String(w >= 700 && w <= 900))
/** Why the sweep's plan refuses these conditions, or nothing. */
const refused = (conditions: string[], unreadable: string[] = []) => {
  const plan = sweepPlan({ conditions, unreadable })
  return 'issue' in plan ? plan.issue : ''
}

/** A block whose text runs on in a span styled `style`. */
const runOn = (id: string, style: string, text: string) =>
  `<p data-block="${id}">Shown text, then <span style="${style}">${text}</span>.</p>`

/** A measure's id and whether its contrast was read, or why not. */
/** Whether a measure finds its text unreadable. */
const unreadable = (m: { issues: string[] }) => m.issues.includes('no_visible_text')
/** Whether a measure finds its text off the page. */
const off = (m: { issues: string[] }) => m.issues.includes('off_page')
const contrastRead = (m: { id: string; contrast: { ratio: number | null; detail: string | null } }) => [
  m.id,
  m.contrast.ratio === null ? m.contrast.detail : 'read',
]
/** A measure's id and whether its contrast was read and found low, read, or why it was not read. */
const contrastSeen = (m: {
  id: string
  issues: string[]
  contrast: { ratio: number | null; detail: string | null }
}) => [m.id, m.contrast.ratio === null ? m.contrast.detail : m.issues.includes('low_contrast') ? 'low' : 'read']

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
        targetChecks(CAPTURE_TARGETS['w390-light']!, measures(framing), coverage, { unmeasured }).map((c) => [
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
    assert.match(
      String(over.blocks_visible?.[1]),
      new RegExp(
        `^3 labels, texts, runs or blocks left out of the measure \\(at most ${String(MAX_MEASURED)} of each kind`,
      ),
    )
    const unreached = Object.fromEntries(
      targetChecks(CAPTURE_TARGETS['w390-light']!, measures([framed('text 1 h2')]), coverage, { unsampled: 2 }).map(
        (c) => [c.name, [c.outcome, c.detail]],
      ),
    )
    assert.equal(unreached.blocks_visible?.[0], 'failed', 'a text the cover check did not reach is not seen')
    assert.match(
      String(unreached.blocks_visible?.[1]),
      /^2 texts the cover check did not reach: past its bounds \(\d+ points, under \d+ lines a text, \d+ s\), off the window, or not set along the page's lines \(vertical, turned or mirrored\)$/,
    )
  })

  // #117, CX-0039: the rules a page's captures show at 390 and 1280px are not the only ones a reader can meet.
  it('reads the widths where a media condition can change, and only a screen width in pixels', () => {
    assert.deepEqual(breakpointsOf('(min-width: 600px)'), [600])
    assert.deepEqual(breakpointsOf('screen and (max-width: 999.5px)'), [999.5])
    assert.deepEqual(breakpointsOf('(700px <= width <= 900px)'), [700, 900])
    assert.deepEqual(breakpointsOf('only screen and (width > 1200px), (max-width: 400px)'), [1200, 400])
    assert.deepEqual(breakpointsOf('not all and (min-width: 600px)'), [600])
    for (const unread of ['(min-width: 40em)', 'print', '(orientation: landscape)', '(min-width: calc(600px + 1em))'])
      assert.equal(breakpointsOf(unread), null, unread)
  })
  it('measures both ends of every band the breakpoints make, from the narrowest width to the widest', async () => {
    assert.deepEqual(await bandEnds([600, 1000], pastEach([600, 1000])), [320, 599, 600, 999, 1000, 2560])
    assert.deepEqual(await bandEnds([700, 900], inBand), [320, 699, 700, 900, 901, 2560])
    assert.deepEqual(await bandEnds([], pastEach([])), [320, 2560], 'no breakpoint: one band')
    const plain = sweepPlan({ conditions: ['(min-width: 600px)', '(max-width: 999.5px)'], unreadable: [] })
    assert.deepEqual(plain, { breakpoints: [600, 999.5] })
    assert.match(refused(['(min-width: 40em)']), /cannot read: \(min-width: 40em\)/u)
    assert.match(refused([], ['@container (min-width: 400px)']), /cannot read: @container/u)
    assert.match(refused(['(min-width: 3000px)']), /past the 320–2560px the sweep measures: 3000px/u)
    const nine = Array.from({ length: SWEEP.maxBreakpoints + 1 }, (_, i) => `(min-width: ${String(400 + i * 100)}px)`)
    assert.match(refused(nine), /^9 width breakpoints, more than the 8 /u)
  })
  it("keeps each target's measure within its share of the receipt, counting what it leaves out (#117)", () => {
    const many = Array.from({ length: 4000 }, (_, i) => framed(`text ${String(i + 1)} h6`))
    const sample = {
      width: 390,
      height: 9000,
      overflowPx: 0,
      overflowing: [],
      sections: [],
      blocks: [framed('b1')],
      shown: many,
      framing: many,
    }
    const measured = sample as unknown as Parameters<typeof fitMeasure>[0]
    assert.ok(
      jsonbBytes(measured) > MEASURE_BYTES,
      "the review's 4000 labels, as texts and as shown, are over the share",
    )
    const fit = fitMeasure(measured, 2)
    assert.ok(jsonbBytes(fit.measured) <= MEASURE_BYTES, 'fitted within the share')
    const left = 4000 * 2 + 1 - fit.measured.framing.length - fit.measured.shown.length - fit.measured.blocks.length
    assert.equal(fit.unmeasured, 2 + left, 'every text or label left out is counted')
    assert.deepEqual(fit.measured.blocks, [framed('b1')], 'texts outside the blocks go first, a block last')
    assert.ok(2 * MEASURE_BYTES < RECEIPT_BYTES, 'two targets fit a receipt with room for its captures and checks')
    const small = sample as unknown as Parameters<typeof fitMeasure>[0]
    const fits = fitMeasure({ ...small, shown: [], framing: [] }, 0)
    assert.equal(fits.unmeasured, 0, 'a measure within its share is kept whole')
    assert.equal(jsonbBytes({ a: [1, 2] }), Buffer.byteLength('{"a":[1,2]}') + 2, 'as PostgreSQL writes it')
    const missing = Array.from({ length: 30 }, (_, i) => `s${String(i)}`)
    const cut = { requested: null, captured: [], missing, margins: 0, marginsCaptured: 0, truncated: true }
    const complete = targetChecks(CAPTURE_TARGETS['w390-light']!, fits.measured, cut).find(
      (c) => c.name === 'captures_complete',
    )
    assert.match(
      String(complete?.detail),
      /^uncaptured: s0, .*, s19 and 10 more$/u,
      'the uncaptured are named, twenty at most',
    )
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

  it('sweeps the widths the design profile bounds a page to, so a page it accepts is one the sweep can measure (#117)', () => {
    const css = fs.readFileSync(
      fileURLToPath(new URL('../../../../packages/design/src/css.ts', import.meta.url)),
      'utf8',
    )
    const profile = /SWEEP_WIDTHS = Object\.freeze\(\{ min: (\d+), max: (\d+), breakpoints: (\d+) \}\)/u.exec(css)
    assert.deepEqual(profile?.slice(1).map(Number), [SWEEP.minWidth, SWEEP.maxWidth, SWEEP.maxBreakpoints])
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
  it(
    'reads identical fresh order and full layout without resizing the visible surface at every width',
    { skip },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-width-surface-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        await tab.setContent(
          page(
            `body{margin:0;font:18px/1.5 serif}main{container-type:inline-size}section{padding:20px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
        .fixed{position:fixed;right:2vw;bottom:2vh}.sticky{position:sticky;top:0}
        .wrap{display:flex;flex-wrap:wrap}.wrap span{width:min(510px,max(100px,calc(100vw - 506px)))}
        @media(min-width:800px){.media{margin-left:5vw}}
        @container(min-width:1016px){.container{padding-left:12vw}}table{width:90vw;border-collapse:collapse}`,
            `<main><section data-section="s"><h1 class="sticky">Heading</h1>
        <p data-block="p" class="media container">${'Fresh text rewraps at every width. '.repeat(24)}</p>
        <div class="grid"><p>A</p><p>B</p><p>C</p></div><div class="wrap"><span>One</span><span>Two</span></div>
        <p class="fixed">Fixed text</p><p dir="rtl" data-block="rtl">مرحبا 123 world</p>
        ${researchTable('t')}</section></main>`,
          ),
        )
        await tab.evaluate('document.fonts.ready.then(() => true)')
        const cdp = await browser.context.newCDPSession(tab)
        const widths = [
          320, 321, 351, 390, 512, 767, 768, 799, 800, 801, 1011, 1012, 1015, 1016, 1019, 1020, 1280, 1920, 2559, 2560,
        ]
        const baseline: { state: string }[] = []
        const snapshots: string[] = []
        for (const width of widths) {
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            mobile: false,
            width,
            height: SWEEP.height,
            screenWidth: width,
            screenHeight: SWEEP.height,
            deviceScaleFactor: 1,
            screenOrientation: { angle: 0, type: 'landscapePrimary' },
          })
          const read = await cdp.send('Runtime.evaluate', { expression: orderScript('ltr'), returnByValue: true })
          const [inner, moved, reordered] = read.result.value as unknown[]
          assert.equal(inner, width)
          assert.equal(read.exceptionDetails, undefined)
          const snapshot = await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: STYLES })
          const lie = meetingsOf(snapshot)
          assert.ok(!('issue' in lie))
          baseline.push({ state: `${lie.state}|${String(moved)}|${String(reordered)}` })
          snapshots.push(sha(JSON.stringify(snapshot)))
        }
        const captured: string[] = []
        const recording = {
          send: async (method: Parameters<CDPSession['send']>[0], params: Parameters<CDPSession['send']>[1]) => {
            const answer = await cdp.send(method, params)
            if (method === 'DOMSnapshot.captureSnapshot') captured.push(sha(JSON.stringify(answer)))
            return answer
          },
        } as unknown as CDPSession
        assert.deepEqual(await probeOf(recording, 'ltr')(widths), baseline)
        assert.deepEqual(captured, snapshots, 'every complete snapshot, including computed styles and text boxes')
        assert.equal(browser.selfTest().active, true)
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
    },
  )
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
    'fails a text whose lines are drawn over each other, and reads lines set tight but apart (#117)',
    { skip },
    async () => {
      const long = 'Host three costs twelve dollars a month and runs every job in its own sandbox. '.repeat(3)
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .narrow{width:250px;padding:40px;font:18px Arial} .zero{line-height:0} .tight{line-height:1}
             .loose{line-height:1.6}`,
            `<main><section data-section="s1"><h2>Findings</h2>
            <p data-block="b1" class="narrow zero">${long}</p><p data-block="b2" class="narrow tight">${long}</p>
            <p data-block="b3" class="narrow loose">${long.replaceAll('own sandbox', '<em>own</em> <a>sandbox</a>')}</p>
            <h2 class="narrow zero">A heading set on one line over another</h2>
            <h2 class="narrow tight">A heading set tight on two lines</h2></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          [...measured.blocks, ...measured.framing].map((m) => [m.id, unreadable(m)]),
          [
            ['b1', true],
            ['b2', false],
            ['b3', false],
            ['text 1 h2', false],
            ['text 2 h2', true],
            ['text 3 h2', false],
          ],
          target,
        )
        assert.equal(outcome(receipt, 'blocks_visible', target), 'failed', target)
      }
    },
  )

  it(
    'fails a text that lies partly off the page, and never passes over what no scroll of the window shows (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .at{position:absolute;margin:0;white-space:nowrap} .left{left:-60px;top:400px}
           .indent{left:0;top:480px;text-indent:-2em} .bled{left:-1em;top:560px} .whole{left:0;top:640px}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2 class="at left">Half off the page</h2><h2 class="at indent">Indented past the edge</h2>
          <p data-block="b2" class="at bled">Bled past the edge.</p><h2 class="at whole">Wholly on the page</h2>
          </section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          [...measured.blocks, ...measured.framing].map((m) => [m.id, off(m)]),
          [
            ['b1', false],
            ['b2', true],
            ['text 1 h2', false],
            ['text 2 h2', true],
            ['text 3 h2', true],
            ['text 4 h2', false],
          ],
          target,
        )
        assert.equal(outcome(receipt, 'blocks_visible', target), 'failed', target)
        const detail = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === target)?.detail ?? ''
        assert.ok(lists(detail, 'b2') && lists(detail, 'text 2 h2') && !lists(detail, 'text 4 h2'), detail)
        assert.match(detail, /did not reach: .* off the window/u, 'its lines past the window are not passed over')
      }
    },
  )

  it(
    "does not pass over a text set across the page's lines: vertical, turned, skewed or mirrored, by it or a box around it (#117)",
    { skip },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-turned-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        await tab.setContent(
          page(
            `${BASE} .vert{writing-mode:vertical-rl;height:12em} .quarter{transform:rotate(90deg)} .tilt{rotate:12deg}
           .skew{transform:skewX(20deg)} .mirror{transform:scaleX(-1)} .flip{scale:1 -1}
           .moved{transform:translateX(4px) scale(1.05)} .level{rotate:0deg} .path{width:10em;offset-path:path('M 400 400 L 500 500')}
           .deep{width:8em;margin-left:4em;transform:perspective(400px) rotateY(40deg)}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Upright.</p>
          <p data-block="b2" class="vert">Set vertically.</p><p data-block="b3" class="quarter">Turned a quarter.</p>
          <p data-block="b4" class="tilt">Tilted.</p><div class="skew"><p data-block="b5">In a skewed box.</p></div>
          <p data-block="b6" class="mirror">Mirrored.</p><p data-block="b7" class="flip">Flipped.</p>
          <p data-block="b8" class="moved">Moved and scaled.</p><p data-block="b9" class="level">Turned by nothing.</p>
          <p data-block="b10" class="path">Set on a motion path.</p><p data-block="b11" class="deep">In perspective.</p>
          <h2 class="vert">A vertical heading</h2></section></main>`,
          ),
        )
        type Looked = { id: string; unsampled: boolean }[]
        const answer = await tab.evaluate<{ blocks: Looked; framing: Looked }>(pageScript({ maxListed: 20 }))
        assert.deepEqual(
          [...answer.blocks, ...answer.framing].map((m) => [m.id, m.unsampled]),
          [
            ['b1', false],
            ['b2', true],
            ['b3', true],
            ['b4', true],
            ['b5', true],
            ['b6', true],
            ['b7', true],
            ['b8', false],
            ['b9', false],
            ['b10', true],
            ['b11', true],
            ['text 1 h2', false],
            ['text 2 h2', true],
          ],
        )
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
    },
  )

  it(
    'reads each element of the labels a name rests on once, under the nearest label, and not past the bound (#117)',
    { skip },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-shown-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        await tab.setContent(
          page(
            BASE,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <div data-sophia-shown="div:1"><h2 data-sophia-shown="h2:2">Named <span>part</span></h2><p>Note</p></div>
          </section></main>`,
          ),
        )
        const script = pageScript({ maxListed: 20 })
        const read = (source: string) =>
          tab.evaluate<{ shown: { id: string }[]; unmeasured: number }>(source).then((a) => ({
            shown: a.shown.map((m) => m.id),
            unmeasured: a.unmeasured,
          }))
        assert.deepEqual(await read(script), {
          shown: ['label div:1', 'label h2:2', 'label h2:2 span', 'label div:1 p'],
          unmeasured: 0,
        })
        const bound = `"maxMeasured":${String(MAX_MEASURED)}`
        assert.ok(script.includes(bound), "the page is read within the kernel's own bound")
        // Two of each kind are kept: one label past them is read and counted, and none after it.
        assert.deepEqual(await read(script.replace(bound, '"maxMeasured":2')), {
          shown: ['label div:1', 'label h2:2'],
          unmeasured: 1 + 2,
        })
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
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
           .filtered{filter:opacity(.1)} .group{background:#000;color:#fff;opacity:.5}
           .stroked{color:#000;-webkit-text-stroke:6px #fff}
           .struck{color:#000;text-decoration:line-through #fff} .thick{color:#000;text-decoration:underline #fff 1em}
           .raised{color:#000;text-decoration:underline #fff;text-underline-offset:-.6em} .under{text-decoration:underline}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2 class="muted">Muted heading</h2><p class="sep">·</p><h2 class="faint">Faint heading</h2>
          <h2 class="fill">Unfilled heading</h2><h2 class="filtered">Filtered heading</h2>
          <h2 class="group">Grouped heading</h2><h2 class="stroked">Stroked heading</h2>
          <h2 class="struck">Struck heading</h2><h2 class="thick">Thick underline</h2>
          <h2 class="raised">Raised underline</h2><h2 class="under">Underlined</h2>
          </section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      const framing = receipt.targets[0]!.page.framing
      assert.deepEqual(
        framing.map((m) => m.id),
        [
          'text 1 h2',
          'text 2 h2',
          'text 3 h2',
          'text 4 h2',
          'text 5 h2',
          'text 6 h2',
          'text 7 h2',
          'text 8 h2',
          'text 9 h2',
          'text 10 h2',
          'text 11 h2',
        ],
        'the separator is not measured',
      )
      assert.deepEqual(framing[4]?.contrast.detail, 'filtered', 'a filter changes the colours: unknown, never passed')
      // White on black faded to .5 as one group over the page: #808080 against white (#117).
      assert.ok(
        readBetween(framing[5]?.contrast, 3.5, 4.2),
        `its background fades with it, read as drawn: ${JSON.stringify(framing[5]?.contrast)}`,
      )
      assert.deepEqual(
        framing[6]?.contrast.detail,
        'stroked',
        'a white stroke buries a black fill on white: unknown, never passed (#117)',
      )
      // #117: a decoration as thick as a glyph, through it or raised over it, buries it as a stroke does.
      assert.deepEqual(
        framing.slice(7).map(contrastRead),
        [
          ['text 8 h2', 'decorated'],
          ['text 9 h2', 'decorated'],
          ['text 10 h2', 'decorated'],
          ['text 11 h2', 'read'],
        ],
        'a line through the text, or one of a thickness or offset of its own: unknown, never passed',
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
      // A block taller than the box: its first line is judged with the block scrolled to its start, so a cover over it
      // is still seen.
      const veiled = await captureHtml(
        job(
          page(
            `${BASE} .box{height:220px;overflow:auto} .box p{position:relative}
            .veil{position:absolute;left:0;right:0;top:0;height:3em;background:#fafafa}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
            <div class="box"><p data-block="b2"><span class="veil"></span>${long}</p></div></section></main>`,
          ),
          { targets: ['w1280-light'] },
        ),
        { env },
      )
      assert.equal(veiled.status, 'succeeded', JSON.stringify(veiled.error))
      assert.deepEqual(issuesOf(veiled, 'w1280-light').b2, ['scrolls', 'covered'])
    },
  )

  it(
    'names text drawn over by generated content, a child or a section around it, and not a highlight behind it or an accent below (#117)',
    { skip },
    async () => {
      const shapes = `${BASE} h2,section{position:relative}
        .over::after{content:"";position:absolute;inset:0;background:#fafafa}
        .child{position:absolute;inset:0;background:#fafafa}
        .under::before{content:"";position:absolute;inset:0;background:#eef;z-index:-1}
        .accent::after{content:"";position:absolute;left:0;bottom:-6px;width:40px;height:3px;background:#c00}
        li::before{content:"• "} .veil::after{content:"";position:absolute;inset:0;background:#fafafa}`
      const drawn = await captureHtml(
        job(
          page(
            shapes,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2 class="over">Covered by its own after</h2><h2>Covered by a child<span class="child"></span></h2>
          <h2 class="under">A highlight behind</h2><h2 class="accent">An accent below</h2>
          <ul><li data-block="b2">A bulleted item.</li></ul></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(drawn.status, 'succeeded', JSON.stringify(drawn.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = drawn.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          measured.framing.map((m) => [m.id, m.issues]),
          [
            ['text 1 h2', []],
            ['text 2 h2', ['covered']],
            ['text 3 h2', ['covered']],
            ['text 4 h2', []],
            ['text 5 h2', []],
          ],
          target,
        )
        assert.deepEqual(issuesOf(drawn, target), { b1: [], b2: [] }, 'a bullet drawn before an item covers nothing')
        assert.ok(
          [...measured.blocks, ...measured.framing].every((m) => !('probe' in m)),
          'the receipt holds no probe point',
        )
        const detail = drawn.checks.find((c) => c.name === 'blocks_visible' && c.target === target)?.detail ?? ''
        assert.equal(detail, 'text 2 h2, text 3 h2', target)
      }
      // A section that draws over everything in it, from its own ::after: each text in it hit-tests as the section.
      const veiled = await captureHtml(
        job(
          page(
            shapes,
            `<main><section data-section="s1" class="veil"><h2>Findings</h2><p data-block="b1">Text.</p></section></main>`,
          ),
          { targets: ['w1280-light'] },
        ),
        { env },
      )
      assert.equal(veiled.status, 'succeeded', JSON.stringify(veiled.error))
      assert.deepEqual(issuesOf(veiled, 'w1280-light').b1, ['covered'])
      // Far down a long page: the protocol hit-tests what the viewport shows, in page coordinates.
      const below = await captureHtml(
        job(
          page(
            shapes,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
            <div style="height:3000px"></div><h2 class="over">Covered far below</h2></section></main>`,
          ),
          { targets: ['w1280-light'] },
        ),
        { env },
      )
      assert.equal(below.status, 'succeeded', JSON.stringify(below.error))
      assert.deepEqual(below.targets[0]!.page.framing[1]?.issues, ['covered'])
      assert.deepEqual(veiled.targets[0]!.page.framing[0]?.issues, ['covered'])
      assert.equal(outcome(veiled, 'blocks_visible', 'w1280-light'), 'failed')
    },
  )

  it(
    'looks for a cover over the whole height of each line and between its points, not only along its middle (#117)',
    { skip },
    async () => {
      // Codex's covers (4198866994): opaque grid items in normal flow over the top and the bottom of every glyph of a
      // block, leaving a clear strip through its middle, where the cover check looked; a bar narrower than an em over a
      // glyph between two of its points; a box generated by the element around a block over the top of its glyphs; and
      // an opaque box over a text's top beneath a transparent one, a clear box whose own generated box paints there, and
      // a clear box whose own small text sits there; and the owner's grid (4198952097), whose covers leave a 2px strip.
      // The positives: grid items side by side, a band beneath
      // the top of the glyphs, a link wrapping across lines, an inline highlight, transparent decoration over a text's
      // top, and a rule just below a text.
      const receipt = await captureHtml(
        job(
          page(
            `body{font:24px/32px Arial;margin:0;padding:16px;background:#fff;color:#000} p{margin:0 0 32px}
            .stack{display:grid;margin-bottom:32px} .stack>*{grid-area:1/1} .stack p{margin:0}
            .top{align-self:start;height:13px;background:#fff} .bottom{align-self:end;height:13px;background:#fff}
            .barred{position:relative} .bar{position:absolute;left:33px;top:0;width:6px;height:32px;background:#fff}
            .side{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px} .side p{margin:0}
            .under{position:relative;isolation:isolate} .under::before{content:"";position:absolute;left:0;right:0;top:0;height:12px;background:#ddd;z-index:-1}
            mark{background:#fff3a0;padding:0 .2em}
            .veil{position:relative;margin-bottom:32px} .veil::after{content:"";position:absolute;left:0;right:0;top:0;height:13px;background:#fff}
            .layered,.framed,.ruled{position:relative} .layered i,.layered b,.framed i{position:absolute;left:0;right:0;top:0;height:13px}
            .layered b{background:#fff;z-index:1} .layered i{z-index:2}
            .ruled i{position:absolute;left:0;right:0;bottom:-12px;height:2px;background:#000}
            .painted,.texted{position:relative;margin-bottom:32px} .painted i,.texted em{position:absolute;left:0;right:0;top:0;height:13px}
            .painted i::before{content:"";position:absolute;inset:0;background:#fff} .texted em{font:8px/8px Arial;color:#000}
            .mask{display:grid;grid-template-rows:15px 2px 15px;grid-template-columns:1fr;margin-bottom:32px}
            .mask p{grid-column:1;grid-row:1/4;margin:0} .mask .upper{grid-column:1;grid-row:1;background:white;z-index:2}
            .mask .lower{grid-column:1;grid-row:3;background:white;z-index:2}`,
            `<main>
          <div class="stack"><p data-block="c1">Host three is free.</p><div class="top"></div><div class="bottom"></div></div>
          <p data-block="c2" class="barred">Host three is free.<span class="bar"></span></p>
          <div class="veil"><p data-block="c3" style="margin:0">Host three is free.</p></div>
          <p data-block="c4" class="layered">Host three is free.<b></b><i></i></p>
          <div class="painted"><p data-block="c5" style="margin:0">Host three is free.</p><i></i></div>
          <div class="texted"><p data-block="c6" style="margin:0">Host three is free.</p><em>a note set over it</em></div>
          <div class="mask"><p data-block="c7">Not free.</p><div class="upper" aria-hidden="true"></div><div class="lower" aria-hidden="true"></div></div>
          <div class="side"><p data-block="n1">Host one.</p><p data-block="n2">Host two.</p></div>
          <p data-block="n3" class="under">Readable over a band.</p>
          <p data-block="n4">A source <a href="#n1">link that wraps across the lines of the paragraph at either width</a> stays.</p>
          <p data-block="n5">A <mark>highlighted</mark> word.</p>
          <p data-block="n6" class="framed">Readable under a clear frame.<i></i></p>
          <p data-block="n7" class="ruled">Readable above a rule.<i></i></p>
          </main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light'])
        assert.deepEqual(
          issuesOf(receipt, target),
          {
            c1: ['covered'],
            c2: ['covered'],
            c3: ['covered'],
            c4: ['covered'],
            c5: ['covered'],
            c6: ['covered', 'adjoined'],
            c7: ['covered'],
            n1: [],
            n2: [],
            n3: [],
            n4: [],
            n5: [],
            n6: [],
            n7: [],
          },
          target,
        )
    },
  )

  it(
    'leaves a text unmeasured where the boxes overlapping its lines are past the index or the points: never looked at sparser (#117)',
    { skip },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-overlaps-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        // Thirty clear boxes over the top of one short line: each is a point the cover check looks at, and none covers.
        const marks = Array.from({ length: 30 }, (_, i) => `<i style="left:${4 + i * 6}px"></i>`).join('')
        await tab.setContent(
          page(
            `body{margin:0;font:24px/32px Arial} p{position:relative;margin:16px} p i{position:absolute;top:0;width:4px;height:8px}`,
            `<main><p data-block="b1">Host three is free.${marks}</p></main>`,
          ),
        )
        type Seen = { blocks: { id: string; issues: string[]; unsampled: boolean }[] }
        const script = pageScript({ maxListed: 20 })
        const seen = async (source: string) =>
          (await tab.evaluate<Seen>(source)).blocks.map((b) => [b.id, b.issues.includes('covered'), b.unsampled])
        assert.deepEqual(await seen(script), [['b1', false, false]], 'within the bounds: looked at, clear')
        const overlaps = `"maxOverlaps":${String(MAX_OVERLAPS)}`
        assert.ok(script.includes(overlaps))
        assert.deepEqual(
          await seen(script.replace(overlaps, '"maxOverlaps":8')),
          [['b1', false, true]],
          'past the index',
        )
        // The line's middle needs about nine points: twenty leave the boxes' thirty unlooked at, so it is unmeasured.
        const points = script.match(/"maxPoints":\d+/)?.[0] ?? ''
        assert.deepEqual(await seen(script.replace(points, '"maxPoints":20')), [['b1', false, true]], 'past the points')
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
    },
  )

  it(
    'looks along every line of every text for a cover: a second line, the end of a line, the last line of a tall block (#117)',
    { skip },
    async () => {
      const long = 'A long paragraph of the research, set on many lines at either width. '.repeat(60)
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} h2,p{position:relative} .fit{display:inline-block}
            .lower{position:absolute;left:0;right:0;bottom:0;height:1.2em;background:#fafafa}
            .right{position:absolute;right:0;top:0;bottom:0;width:25%;background:#fafafa}
            .foot{position:absolute;left:0;right:0;bottom:0;height:1.4em;background:#fafafa}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2>Costs compared<br>Host three is free<span class="lower"></span></h2>
          <h2 class="fit">Costs compared, and host three is free<span class="right"></span></h2>
          <p data-block="b2">${long}<span class="foot"></span></p><h2>Sources</h2></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        const issues = Object.fromEntries(measured.framing.map((m) => [m.id, m.issues]))
        assert.deepEqual(issues['text 1 h2'], [], target)
        assert.deepEqual(issues['text 2 h2'], ['covered'], `${target}: the second line is covered`)
        assert.deepEqual(issues['text 3 h2'], ['covered'], `${target}: the end of the line is covered`)
        assert.deepEqual(issues['text 4 h2'], [], target)
        assert.deepEqual(issuesOf(receipt, target).b2, ['covered'], `${target}: the last line of a tall block`)
        assert.deepEqual(issuesOf(receipt, target).b1, [])
      }
    },
  )

  it(
    'refuses at once, unread, a text set on as many lines as the cover check reads at most; a narrow text under it is read (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .narrow{width:1px;overflow-wrap:anywhere;font:12px/12px Georgia,serif}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2 class="narrow">${'x'.repeat(MAX_LINES)}</h2><h2 class="narrow">${'y'.repeat(400)}</h2></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const framing = receipt.targets.find((t) => t.id === target)!.page.framing
        assert.deepEqual(
          framing.map((m) => [m.id, m.issues]),
          [
            ['text 1 h2', []],
            ['text 2 h2', []],
            ['text 3 h2', []],
          ],
          target,
        )
        const visible = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === target)
        assert.equal(visible?.outcome, 'failed', `${target}: a text the cover check did not read is not seen`)
        assert.match(String(visible?.detail), /^1 texts the cover check did not reach: past its bounds /u, target)
      }
    },
  )

  it(
    'hit-tests generated content through the protocol within a bound of points: a text past it is not reached (#117)',
    { skip },
    async () => {
      const long = 'A long paragraph of the research, set on many lines at either width. '.repeat(750)
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} p{position:relative}
            .rule::after{content:"";position:absolute;left:0;bottom:-6px;width:2rem;height:2px;background:#c33}
            .veil::after{content:"";position:absolute;inset:0;background:#fafafa}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <p data-block="b2" class="rule">${long}</p><p data-block="b3" class="veil">Covered by its own veil.</p>
          <p data-block="b4" class="rule">Underlined.</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        assert.deepEqual(
          issuesOf(receipt, target),
          { b1: [], b2: [], b3: ['covered'], b4: [] },
          `${target}: the texts after the long one are still hit-tested`,
        )
        const visible = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === target)
        assert.match(
          String(visible?.detail),
          /^b3; 1 texts the cover check did not reach: past its bounds /u,
          `${target}: the long text's points are past the protocol's bound`,
        )
      }
    },
  )

  it(
    'stops looking along lines when the cover check runs out of time, and names every text it did not reach (#117)',
    {
      skip,
    },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-look-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        await tab.setContent(
          page(BASE, '<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p></section></main>'),
        )
        const script = pageScript({ maxListed: 20 })
        const budget = `"maxLookMs":${String(MAX_LOOK_MS)}`
        assert.ok(script.includes(budget), "the page is measured with the kernel's own time budget")
        const unsampled = async (source: string) => {
          const answer = await tab.evaluate<{ blocks: { unsampled: boolean }[]; framing: { unsampled: boolean }[] }>(
            source,
          )
          return [...answer.blocks, ...answer.framing].map((m) => m.unsampled)
        }
        assert.deepEqual(await unsampled(script), [false, false], 'read within the budget')
        assert.deepEqual(await unsampled(script.replace(budget, '"maxLookMs":-1')), [true, true], 'past it')
        // #117: the line boxes the page's text is indexed by, to find text beside a block, are bounded too.
        const boxes = `"maxTextRects":${String(MAX_TEXT_RECTS)}`
        assert.ok(script.includes(boxes), "the page's text is indexed within the kernel's own bound")
        assert.deepEqual(await unsampled(script.replace(boxes, '"maxTextRects":1')), [true, false], 'past the boxes')
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
    },
  )

  it(
    'looks along a long line an em apart at most, so a box between points 64 to a line would see is found (#117)',
    { skip },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-long-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        await tab.setViewportSize({ width: 1280, height: 800 })
        await tab.setContent(
          page(
            `${BASE} .long{position:absolute;left:0;top:200px;margin:0;font:10px/1.5 monospace;white-space:nowrap}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <p data-block="b2" class="long">${'abcdefghij'.repeat(20)}</p></section></main>`,
          ),
        )
        const script = pageScript({ maxListed: 20 })
        type Answer = { blocks: { id: string; issues: string[]; unsampled: boolean }[] }
        const read = (source: string) =>
          tab
            .evaluate<Answer>(source)
            .then((a) => a.blocks.map((b) => [b.id, b.issues.includes('covered'), b.unsampled]))
        // The long line on its own is read whole: not covered, and within the page's points.
        assert.deepEqual(await read(script), [
          ['b1', false, false],
          ['b2', false, false],
        ])
        // A box over the line between the 11th and 12th of 64 points spread along it: wider than an em, narrower
        // than their gap.
        const gap = await tab.evaluate(() => {
          const range = document.createRange()
          range.selectNodeContents(document.querySelector('.long')!.firstChild!)
          const r = range.getBoundingClientRect()
          const step = r.width / 64
          const box = document.createElement('div')
          box.style.cssText = `position:absolute;left:${String(r.left + 10.5 * step + 1)}px;top:${String(r.top)}px;width:${String(step - 2)}px;height:${String(r.height)}px;background:#fafafa`
          document.body.append(box)
          return step
        })
        assert.ok(gap - 2 > 10, `the box (${String(gap - 2)}px) is wider than an em (10px)`)
        assert.deepEqual(await read(script), [
          ['b1', false, false],
          ['b2', true, false],
        ])
        // A line that needs more points than the page has left is unmeasured, never looked at more sparsely.
        const points = `"maxPoints":${String(MAX_POINTS)}`
        assert.ok(script.includes(points))
        const short = await tab.evaluate<{ blocks: { unsampled: boolean }[] }>(script.replace(points, '"maxPoints":20'))
        assert.deepEqual(
          short.blocks.map((b) => b.unsampled),
          [false, true],
        )
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
    },
  )

  it(
    "holds every run of a block's text in an element inside it to what the block is: shown, readable and measured (#117)",
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            BASE,
            `<main><section data-section="s1"><h2>Findings</h2>
          ${runOn('b1', 'display:none', 'critical text')}${runOn('b2', 'visibility:hidden', 'a hidden run')}
          ${runOn('b3', 'color:transparent', 'a transparent run')}${runOn('b4', 'opacity:0', 'a faded run')}
          ${runOn('b5', 'font-size:3px', 'a tiny run')}
          ${runOn('b6', 'display:inline-block;width:0;overflow:hidden;vertical-align:bottom', 'a cut run')}
          ${runOn('b7', 'color:#999', 'a grey run')}
          <p data-block="b8">Shown text, <em>an emphasis</em>, <a>a link</a> and <span class="note">a note</span>.</p>
          </section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      const expected: [string, string][] = [
        ['b1', 'not_rendered'],
        ['b2', 'hidden'],
        ['b3', 'low_contrast'],
        ['b4', 'transparent'],
        ['b5', 'no_visible_text'],
        ['b6', 'text_cut'],
        ['b7', 'low_contrast'],
      ]
      for (const target of ['w390-light', 'w1280-light']) {
        const issues = issuesOf(receipt, target)
        for (const [id, issue] of expected) assert.ok(issues[id]?.includes(issue), `${target} ${id}: ${issue}`)
        assert.deepEqual(issues.b8, [], `${target}: runs shown as the block is pass`)
        const detail = (name: string) => receipt.checks.find((c) => c.name === name && c.target === target)?.detail
        assert.equal(detail('blocks_visible'), 'b1, b2, b4, b5, b6', target)
        assert.equal(detail('contrast'), 'b3, b7', target)
      }
      const many = await captureHtml(
        job(
          page(
            BASE,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">${'<span>a run</span> '.repeat(
              MAX_MEASURED + 1,
            )}</p></section></main>`,
          ),
          { targets: ['w1280-light'] },
        ),
        { env },
      )
      assert.equal(many.status, 'succeeded', JSON.stringify(many.error))
      assert.equal(outcome(many, 'blocks_visible', 'w1280-light'), 'failed', 'a run past the bound is not seen')
      assert.match(
        String(many.checks.find((c) => c.name === 'blocks_visible')?.detail),
        new RegExp(`^1 labels, texts, runs or blocks left out of the measure \\(at most ${String(MAX_MEASURED)} `),
      )
    },
  )

  it(
    'takes a fixed or sticky element drawn over a text where the page starts as a cover (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .pin{position:fixed;left:0;right:0;top:0;height:6em;background:#fafafa}
          .stuck{position:sticky;top:0;height:3em;margin-bottom:-3em;background:#fafafa}`,
            `<div class="pin"></div><main><section data-section="s1"><p data-block="b1">Under a fixed cover.</p>
          <div style="height:8em"></div><div class="stuck"></div><p data-block="b2">Under a sticky cover.</p>
          <h2>Findings</h2><p data-block="b3">Text.</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        assert.deepEqual(issuesOf(receipt, target), { b1: ['covered'], b2: ['covered'], b3: [] }, target)
        assert.equal(outcome(receipt, 'blocks_visible', target), 'failed', target)
      }
    },
  )

  it(
    'fails a block that other text sits beside on its lines, however the page places it; its own citation does not (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .row{display:flex} .row p{margin:0} .grid{display:grid;grid-template-columns:8em 1fr;column-gap:2em}
             .near{position:relative} .near p{margin:0} .near span{position:absolute;left:-0.6em;top:0}
             .hide{overflow:hidden;width:0;height:0} .gone{overflow:hidden;height:0}`,
            `<main><section data-section="s1"><h2>Findings</h2>
            <p>-<span data-block="b1">10% growth</span></p>
            <div class="row"><span>−</span><p data-block="b2">10% growth</p></div>
            <div class="near"><span>-</span><p data-block="b3">10% growth</p></div>
            <p><span data-block="b4">10</span><span data-block="b5">0% growth</span></p>
            <p data-block="b6">10% growth<sup data-cite="a"><a href="#src-a">[1]</a></sup></p>
            <h3>Cost</h3><p data-block="b7">10 USD a month</p>
            <div class="grid"><span>Cost</span><p data-block="b8">10 USD a month</p></div>
            <ul><li data-block="b9">10% growth</li></ul>
            <div class="near"><div class="hide"><span>-</span></div><p data-block="b10">10% growth</p></div>
            <div class="gone"><p>-</p></div><p data-block="b11">10% growth</p>
            <p><span style="visibility:hidden">-</span><span data-block="b12">10% growth</span></p>
            <ol id="src-a"><li data-source="a">Source</li></ol></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const t of receipt.targets) {
        const adjoined = t.page.blocks.filter((b) => b.issues.includes('adjoined')).map((b) => b.id)
        assert.deepEqual(adjoined, ['b1', 'b2', 'b3', 'b4', 'b5', 'b10'], t.id)
        assert.equal(outcome(receipt, 'blocks_visible', t.id), 'failed', t.id)
        assert.match(
          String(receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === t.id)?.detail),
          /^b1, b2, b3, b4, b5, b10$/u,
        )
      }
    },
  )

  it(
    'passes a responsive page at both ends of every band its breakpoints make, and names the widths (#117, CX-0039)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .grid{display:grid;grid-template-columns:1fr;gap:1rem}
             @media (min-width: 600px){.grid{grid-template-columns:1fr 1fr}}
             @media (min-width: 1000px){.grid{grid-template-columns:1fr 1fr 1fr}}`,
            `<main><section data-section="s1"><h2>Findings</h2><div class="grid">
            <p data-block="b1">One.</p><p data-block="b2">Two.</p><p data-block="b3">Three.</p></div></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      const sweep = receipt.checks.find((c) => c.name === 'widths_visible')
      assert.deepEqual([sweep?.outcome, sweep?.target], ['passed', null])
      assert.equal(sweep?.detail, 'measured at 320, 599, 600, 999, 1000, 2560px')
    },
  )

  it(
    'fails what a band between or beyond the targets hides, covers or cuts, at the band end that shows it (#117, CX-0039)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .box{position:relative} .over{display:none}
             @media (min-width: 700px) and (max-width: 900px){
               [data-block="b2"]{display:none} h2.k{visibility:hidden} h2.dim{color:#ddd}
               .over{display:block;position:absolute;inset:0;background:#fafafa}}
             @media (min-width: 1300px){.cut{width:calc(100vw - 1260px);overflow:hidden;white-space:nowrap}}
             @media (max-width: 579px){.cut2{width:calc(600px - 100vw);overflow:hidden;white-space:nowrap}}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Shown everywhere.</p>
            <p data-block="b2">Hidden between the targets.</p><h2 class="k">Kept heading</h2><h2 class="dim">Faint there</h2>
            <div class="box"><p data-block="b3">Covered between the targets.</p><div class="over"></div></div>
            <p data-block="b4" class="cut">A line cut at the wide band's narrow end.</p>
            <p data-block="b5" class="cut2">10%</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const t of ['w390-light', 'w1280-light']) assert.equal(outcome(receipt, 'blocks_visible', t), 'passed', t)
      assert.equal(outcome(receipt, 'widths_visible'), 'failed')
      const detail = String(receipt.checks.find((c) => c.name === 'widths_visible')?.detail)
      // #117: a text outside the blocks in low contrast there fails as a block would.
      assert.match(detail, /at 700px: b2, b3, text 2 h2, text 3 h2(;|$)/u)
      assert.match(detail, /at 900px: b2, b3, text 2 h2, text 3 h2(;|$)/u)
      assert.match(detail, /at 1300px: b4(;|$)/u, "the wide band's narrow end")
      assert.match(detail, /at 579px: b5(;|$)/u, "the narrow band's wide end")
      assert.doesNotMatch(detail, /at (320|390|699|901|1299|1280|2560)px/u, 'the ends that show nothing wrong')
    },
  )

  it(
    'fails a text that an edit naming its sections draws outside one of them, where no tile of it reaches (#117)',
    { skip },
    async () => {
      const html = page(
        `${BASE} section{padding-bottom:6rem} .s2{position:relative}
         .esc{position:absolute;top:-4rem;left:2rem;margin:0;font-size:14px}`,
        `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p></section>
        <section data-section="s2" class="s2"><h2>More</h2><p data-block="b2">More text.</p>
        <h2 class="esc">Placed above its section</h2></section></main>`,
      )
      const scoped = async (sections?: string[]) => {
        const receipt = await captureHtml(job(html, sections ? { sections } : {}), { env })
        assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
        return receipt
      }
      const own = await scoped(['s2'])
      for (const t of ['w390-light', 'w1280-light']) {
        assert.equal(outcome(own, 'blocks_visible', t), 'failed', t)
        const detail = own.checks.find((c) => c.name === 'blocks_visible' && c.target === t)?.detail ?? ''
        assert.ok(lists(detail, 'text 3 h2') && !lists(detail, 'text 2 h2'), detail)
      }
      assert.equal(outcome(own, 'widths_visible'), 'failed', 'and at the band ends')
      // Another section's edit, and a capture of every section (whose margins and sections are all seen), pass.
      for (const receipt of [await scoped(['s1']), await scoped()]) {
        for (const t of ['w390-light', 'w1280-light']) assert.equal(outcome(receipt, 'blocks_visible', t), 'passed', t)
        assert.equal(outcome(receipt, 'widths_visible'), 'passed')
      }
    },
  )

  // #117, SDD-CX45: boxes that each move one way can meet between a band's ends, where the sweep measures nothing.
  it(
    'fails a placed box and a text that may meet between the ends of a band, however the box is placed (#117)',
    { skip },
    async () => {
      const cover = 'width:60px;height:30px;background:#111'
      const receipt = await captureHtml(
        job(
          page(
            `body{margin:0;font:16px/30px Georgia,serif;color:#222;background:#fafafa}
             .stage{position:relative;height:120px;overflow:hidden} .stage p{margin:30px 0 0 100px}
             .vw{position:absolute;left:50vw;top:30px;width:90px;margin:0!important;font:12px monospace}
             .vwc{position:absolute;left:calc(100vw - 720px);top:30px;${cover}}
             .col{width:300px;margin:30px auto 0!important} .fixed{position:absolute;left:400px;top:20px;${cover}}
             .gen::after{content:"";position:absolute;left:calc(100vw - 900px);top:30px;${cover}}
             .off{position:relative;left:calc(100vw - 900px);top:-30px;${cover}}
             .turn{transform:translate(calc(100vw - 900px),-30px);${cover}}
             .neg{margin:-30px 0 0 calc(100vw - 900px);${cover}}
             .at{position:absolute!important;left:200px;top:40px;margin:0!important;line-height:27px}
             .diag{position:absolute;left:calc(50vw - 100px);top:calc(10vw + 10px);${cover}}`,
            `<main><section data-section="s1">
            <div class="stage"><p data-block="b1" class="vw">Not free.</p><div class="vwc"></div></div>
            <div class="stage"><p data-block="b2" class="col">Not free.</p><div class="fixed"></div></div>
            <div class="stage gen"><p data-block="b3">Not free.</p></div>
            <div class="stage"><p data-block="b4">Not free.</p><div class="off"></div></div>
            <div class="stage"><p data-block="b5">Not free.</p><div class="turn"></div></div>
            <div class="stage"><p data-block="b6">Not free.</p><div class="neg"></div></div>
            <div class="stage"><p data-block="b7" class="at">Not free.</p><div class="diag"></div></div>
            </section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const t of ['w390-light', 'w1280-light'])
        for (const c of ['blocks_visible', 'layout_overflow', 'contrast'])
          assert.equal(outcome(receipt, c, t), 'passed', `${c} at ${t}`)
      assert.equal(outcome(receipt, 'widths_visible'), 'failed')
      const detail = String(receipt.checks.find((c) => c.name === 'widths_visible')?.detail)
      // Each box comes onto its text inside the band, where the sweep reads it at every width and measures the widths
      // either side as band ends (#117): there the ends' cover check names the block, or the box lies over the text at
      // both ends of a piece and their comparison fails the pair.
      assert.doesNotMatch(detail, /between 320 and 2560px/u, 'each pair is found where the box comes onto its text')
      for (const pair of [
        'div.vwc and b1',
        'div.fixed and b2',
        'div.stage::after and b3',
        'div.off and b4',
        'div.turn and b5',
        'div.neg and b6',
        'div.diag and b7',
      ])
        assert.ok(detail.includes(pair), `${pair} in ${detail}`)
    },
  )

  it(
    'passes placed decoration that keeps to one side of every text at both ends of a band, or lies beneath one (#117)',
    { skip },
    async () => {
      const long = 'A paragraph that wraps over several lines at a narrow width and fewer at a wide one, '.repeat(3)
      const receipt = await captureHtml(
        job(
          page(
            `body{margin:0;font:16px/1.5 Georgia,serif;color:#222;background:#fafafa}
             main{max-width:40rem;margin:auto;padding:0 1rem}
             h2{position:relative} h2::after{content:"";position:absolute;left:0;bottom:-8px;width:48px;height:3px;background:#c33}
             h3{position:relative;z-index:0;display:inline-block}
             h3::before{content:"";position:absolute;inset:40% -4px 0;background:#fde68a;z-index:-1}
             .card{position:relative;padding:16px 120px 16px 16px;border:1px solid #ccc}
             .badge{position:absolute;top:12px;right:12px;margin:0;font-size:14px;background:#eee;padding:2px 6px}
             .raise{position:relative;top:-0.3em} .tag{display:inline-block;transform:translateY(-1px);background:#eee}
             .hero{position:relative;overflow:hidden;height:140px;background:#eef}
             .hero h1{margin:0;padding:16px;font-size:24px}
             .circle{position:absolute;left:-40px;bottom:-150px;width:200px;height:200px;border-radius:50%;background:#ccd}
             .bleed{margin:0 calc(50% - 50vw);padding:16px calc(50vw - 50%);background:#eee}
             h4{position:relative;text-align:center} h4::after{content:"";position:absolute;left:50%;bottom:-6px;width:40px;
               height:2px;transform:translateX(-50%);background:#333}
             .band{position:relative;padding-top:20px}
             .band::before{content:"";position:absolute;left:calc(50vw - 30px);top:0;width:60px;height:8px;background:#999}
             .label{position:absolute;left:0;top:-4px;margin:0;font-size:12px}
             .sides{position:relative;padding:0 80px} .flip{position:absolute;left:0;top:0;margin:0;font-size:12px}
             @media (min-width: 1000px){.flip{left:auto;right:0}}`,
            `<div class="hero"><h1>Overview</h1><div class="circle"></div></div><main>
            <section data-section="s1"><h2>Findings</h2><p data-block="b1">${long}<span class="raise">*</span> ${long}</p>
            <h3>Marked</h3><div class="card"><p class="badge">New</p><p data-block="b2">${long}</p></div>
            <div class="bleed"><p data-block="b3">Across the window.</p></div>
            <h4>Centred</h4><p data-block="b4">Text with a <span class="tag">tag</span> in it. ${long}</p>
            <div class="band"><p class="label">Label</p><p data-block="b5">${long}</p></div>
            <div class="sides"><p class="flip">Aside</p><p data-block="b6">${long}</p></div></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      const sweep = receipt.checks.find((c) => c.name === 'widths_visible')
      // The label that changes sides at 1000px does so between two bands, whose ends are not compared with each other.
      assert.deepEqual([sweep?.outcome, sweep?.detail], ['passed', 'measured at 320, 999, 1000, 2560px'])
    },
  )

  // #117: a grid's column count changes where no media condition does, and moves a placed box with it.
  it(
    "finds where a grid's columns move a placed box onto a text inside a band, and measures it there (#117)",
    { skip },
    async () => {
      const cells = Array.from({ length: 9 }, (_, i) =>
        i === 8 ? '<div class="cell"><div class="cover"></div></div>' : '<div class="cell"></div>',
      ).join('')
      const adverse = await captureHtml(
        job(
          page(
            `body{margin:0;font:16px/1.5 Georgia,serif;color:#222;background:#fafafa}
             .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));grid-auto-rows:0}
             .cell{position:relative} .cover{position:absolute;left:-417px;top:150px;width:60px;height:20px;background:#fff;z-index:2}
             .claim{position:absolute;left:250px;top:150px;margin:0;font:12px monospace}`,
            `<main><section data-section="s1"><div class="grid">${cells}</div>
            <p data-block="b1" class="claim">Not free.</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(adverse.status, 'succeeded', JSON.stringify(adverse.error))
      for (const t of ['w390-light', 'w1280-light']) assert.equal(outcome(adverse, 'blocks_visible', t), 'passed', t)
      assert.equal(outcome(adverse, 'widths_visible'), 'failed')
      const detail = String(adverse.checks.find((c) => c.name === 'widths_visible')?.detail)
      assert.match(detail, /at 960px: b1(;|$)/u, 'the cover over the claim where the grid takes a third column')
      assert.match(detail, /between 960 and 1097px: 1 placed boxes and texts may meet: div\.cover and b1(;|$)/u)
      assert.match(detail, /at 1920px: b1; between 1920 and 2195px: /u, 'and again where it takes a sixth')
      // A grid of cards whose columns change, and an accent beneath a heading above it, pass: read at every width, nothing
      // comes onto a text, so only the band's ends are measured. The second card's corner badge changes sides of the
      // first card's text where the columns change, never over it.
      const cards = Array.from({ length: 4 }, (_, i) =>
        i === 1
          ? '<div class="card"><p data-block="c2">Card 2.</p><span class="badge">New</span></div>'
          : `<p data-block="c${String(i + 1)}">Card ${String(i + 1)}.</p>`,
      )
      const ordinary = await captureHtml(
        job(
          page(
            `body{margin:0;font:16px/1.5 Georgia,serif;color:#222;background:#fafafa}
             h2{position:relative} h2::after{content:"";position:absolute;left:0;bottom:-8px;width:48px;height:3px;background:#c33}
             .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0}
             .card{position:relative} .badge{position:absolute;right:4px;top:4px;font-size:12px;background:#eee}`,
            `<main><section data-section="s1"><h2>Findings</h2><div class="cards">${cards.join('')}</div></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(ordinary.status, 'succeeded', JSON.stringify(ordinary.error))
      const sweep = ordinary.checks.find((c) => c.name === 'widths_visible')
      assert.deepEqual([sweep?.outcome, sweep?.detail], ['passed', 'measured at 320, 2560px'])
    },
  )

  // The security review of ecf149b (4199947395): two flex items sized min(600px, max(100px, calc(75vw - 200px))) share
  // a line at 320, 390, 1280 and 2560px and wrap between about 800 and 1200px, where the second, raised by a z-index,
  // lands on the claim below a container of fixed height (r1). The owner's pages (4199984025): the same sizes with the
  // claim placed at the second line (r2), and min(510px, max(100px, calc(100vw - 506px))), which wraps only between
  // 1012 and 1020px (r3); and, all in the flow, nothing placed or raised, the same items in a flex container 100px high
  // (r4, 4200072778) and as inline blocks (r5, 4200177121), whose second, black, wraps beneath the paragraph that
  // follows.
  it(
    'finds boxes that wrap onto a text and off it inside a band whose ends match, at every width, and measures each (#117)',
    { skip },
    async () => {
      failsAt(await row('height:40px', RESPONSIVE), /at 80\dpx: b1(;|$)/u)
      failsAt(await ownerClaim(RESPONSIVE), /at 8\d\dpx: b1(;|$)/u)
      failsAt(await ownerClaim('min(510px,max(100px,calc(100vw - 506px)))'), /at 101\dpx: b1(;|$)/u)
      // Beneath the black item where it wraps, and where it wraps last.
      failsAt(await flexFlow('height:100px', RESPONSIVE), /at 801px: b1(;|$)/u, /at 1199px: b1(;|$)/u)
      failsAt(await inlineFlow('height:100px', RESPONSIVE), /at 801px: b1(;|$)/u, /at 1199px: b1(;|$)/u)
    },
  )

  // The same wrap cuts a claim inside the item a clip hides (r6); a box widened faster than the window overflows it only
  // between 501 and 799px (r7); a research table's cells wrapped under one another leave their headers in the middle of
  // the band only (r8); and a box 400px wide overflows below 400px, so the band's first end is measured at 320px itself,
  // after every width of the band was read (r9).
  it(
    "measures where a wrap inside a band cuts a text, widens the page or moves a table's cells, at its own width (#117)",
    { skip },
    async () => {
      const r6 = await sweepOf(
        `.layout{display:flex;flex-wrap:wrap;height:100px;overflow:hidden} .first,.second{flex:0 0 ${RESPONSIVE};height:100px}
         .claim{margin:0}`,
        '<div class="layout"><div class="first"></div><div class="second"><p data-block="b1" class="claim">Not free.</p></div></div>',
      )
      failsAt(r6, /at 801px: b1(;|$)/u)
      const wide = (width: string) =>
        sweepOf(
          `.wide{width:${width};height:20px;background:#eee} p{margin:0}`,
          '<div class="wide"></div><p data-block="b1">Free.</p>',
        )
      failsAt(
        await wide('min(800px,calc(200vw - 500px))'),
        /at 501px: 1px past the width/u,
        /at 799px: 1px past the width/u,
      )
      failsAt(await wide('400px'), /^at 320px: 80px past the width; at 399px: 1px past the width$/u)
      const r8 = await sweepOf(
        `.t1 tr{display:flex;flex-wrap:wrap} .t1 th,.t1 td{flex:0 0 ${RESPONSIVE}}`,
        researchTable('t1', 't1'),
      )
      failsAt(r8, /at \d+px: [^;]*tables whose cells are drawn under other headers or off their rows: t1/u)
    },
  )

  // The positives: the row its lines' height (p1), the owner's constant 100px items (p2), the flow's container its lines'
  // height or its items 100px wide (p3 to p6); and an ordinary page of some 300 elements, read at every width within the
  // sweep's time (p7).
  it(
    'passes wraps that move what follows, items of constant width, and an ordinary page, read at every width in time (#117)',
    { skip },
    async () => {
      const positives = [
        ['p1', await row('', RESPONSIVE)],
        ['p2', await ownerClaim('100px')],
        ['p3', await flexFlow('', RESPONSIVE)],
        ['p4', await flexFlow('height:100px', '100px')],
        ['p5', await inlineFlow('', RESPONSIVE)],
        ['p6', await inlineFlow('height:100px', '100px')],
      ] as const
      for (const [name, read] of positives)
        assert.deepEqual([read?.outcome, read?.detail], ['passed', 'measured at 320, 2560px'], name)
      const cards = Array.from(
        { length: 30 },
        (_, i) => `<div class="card"><h3>Card ${String(i)}</h3><p>A finding, a sentence or two long.</p></div>`,
      ).join('')
      const started = Date.now()
      const p7 = await sweepOf(
        `.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
         .card{background:#f4f4f4;box-shadow:0 1px 3px #0003;padding:8px} .tags{display:flex;flex-wrap:wrap;gap:6px}
         .tags span{padding:2px 8px;background:#eee}
         blockquote{margin:1rem 0;padding-left:1rem;border-left:4px solid #ccc}`,
        `<h2>Findings</h2><div class="tags">${'<span>tag</span>'.repeat(20)}</div><div class="grid">${cards}</div>
         <blockquote data-block="q1">A quoted line long enough to wrap, with <a href="#s">a link</a>.</blockquote>
         ${'<p>A paragraph of the research that wraps, with <a href="#s">a link in it</a> and words after it.</p>'.repeat(40)}`,
      )
      assert.deepEqual([p7?.outcome, p7?.detail], ['passed', 'measured at 320, 2560px'])
      assert.ok(Date.now() - started < 60_000, 'its capture, every width of its sweep read, within the sweep time')
    },
  )

  // Codex's review of 1317562 (4200986784): `display: flex` with `order` drew "Not free", split across two spans, as
  // "free Not" while the text, every target check and the sweep passed; and the owner's 4201047936: flex items "Now "
  // and "here." drew "Nowhere.". A block's runs are held to their reading order and their spaces: the flex order (o1), a
  // float (o2), a placed run (o3), a reversed column (o4), transformed runs (o5), the flex that runs "Now here." together
  // (o6) and a run pulled back over its space (o7) fail, and so does a reversed wrap only between 801 and 1199px (w1,
  // found by the sweep). Ordinary paragraphs with links, marks and wraps, a list in two columns, a table, text set right
  // to left, a Hebrew phrase in English, a flex that keeps its space (white-space: pre, or a gap) and a word joined in
  // the text itself read.
  it(
    'fails a block whose text runs the page draws out of their order or runs together, at a target and inside a band (#117)',
    { skip },
    async () => {
      const blocks = [
        [
          'o1',
          '.o1{display:flex} .o1 span:first-child{order:2} .o1 span:last-child{order:1;margin-right:.3em}',
          '<p data-block="o1" class="o1"><span>Not</span> <span>free</span></p>',
        ],
        [
          'o2',
          '.o2 span:first-child{float:right}',
          '<p data-block="o2" class="o2"><span>Not</span> <span>free to use, ever.</span></p>',
        ],
        [
          'o3',
          '.o3{position:relative} .o3 span:first-child{position:absolute;left:4em}',
          '<p data-block="o3" class="o3"><span>Not</span> <span>free</span></p>',
        ],
        [
          'o4',
          '.o4{display:flex;flex-direction:column-reverse}',
          '<div data-block="o4" class="o4"><p>Claim one.</p><p>Claim two.</p></div>',
        ],
        [
          'o5',
          '.o5 span{display:inline-block} .o5 span:first-child{transform:translateX(3em)} .o5 span:last-child{transform:translateX(-2.5em)}',
          '<p data-block="o5" class="o5"><span>Not</span> <span>free</span></p>',
        ],
        ['o6', '.o6{display:flex}', '<p data-block="o6" class="o6"><span>Now </span><span>here.</span></p>'],
        [
          'o7',
          '.o7 span:last-child{margin-left:-.3em}',
          '<p data-block="o7" class="o7"><span>Now</span> <span>here.</span></p>',
        ],
        [
          'o8',
          '.o8{position:relative;padding-top:1.5em} .o8 span:last-child{position:absolute;top:0;left:5em}',
          '<p data-block="o8" class="o8"><span>Not</span> <span>free</span></p>',
        ],
        // The review of 014b03f (4201465986) and the owner's CSS routes: "102" raised or lowered reads 10² or 10₂.
        ['o9', '', '<p data-block="o9">It costs 10<sup>2</sup> USD.</p>'],
        ['o10', '', '<p data-block="o10">It costs 10<sub>2</sub> USD.</p>'],
        [
          'o11',
          '.o11 span{vertical-align:super;font-size:.75em}',
          '<p data-block="o11" class="o11">It costs 10<span>2</span> USD.</p>',
        ],
        [
          'o12',
          '.o12 span{position:relative;top:-.5em;font-size:.75em}',
          '<p data-block="o12" class="o12">It costs 10<span>2</span> USD.</p>',
        ],
        [
          'o13',
          '.o13 span{display:inline-block;transform:translateY(-.4em);font-size:.75em}',
          '<p data-block="o13" class="o13">It costs 10<span>2</span> USD.</p>',
        ],
        // The owner's 4201665365: "1.2" with its point raised reads 1·2, a product.
        [
          'o18',
          '.o18 span{display:inline-block;transform:translateY(-.4em)}',
          '<p data-block="o18" class="o18">It costs 1<span>.</span>2 USD.</p>',
        ],
        // The review of c6e9e81 (4201816898): a cell's own text drawn out of its order, or a figure raised in it.
        [
          'o19',
          '.o19 .f{display:flex} .o19 .f span:first-child{order:2;margin-left:.3em}',
          '<table data-block="o19" class="o19"><thead><tr><th>Plan</th><th>Price</th></tr></thead>' +
            '<tbody><tr><td><div class="f"><span>Not</span> <span>free</span></div></td><td>$10</td></tr></tbody></table>',
        ],
        [
          'o20',
          '.o20 td span{vertical-align:super;font-size:.75em}',
          '<table data-block="o20" class="o20"><thead><tr><th>Plan</th><th>Price</th></tr></thead>' +
            '<tbody><tr><td>Basic</td><td>10<span>2</span> USD</td></tr></tbody></table>',
        ],
        // The security review of 014b03f (4201488127): frozen "12 - 34" set right to left is drawn "34 - 12".
        ['o14', '', '<p data-block="o14" dir="rtl">12 - 34</p>'],
        ['o15', '.o15{direction:rtl}', '<p data-block="o15" class="o15">12 - 34</p>'],
        ['o16', '', '<p data-block="o16">The range <span dir="rtl">12 - 34</span> holds.</p>'],
        ['o17', '', '<p data-block="o17" dir="rtl">Not free.</p>'],
        [
          'k1',
          '',
          '<p data-block="k1">A finding that wraps over lines, with <a href="#s1">a link</a>, <em>emphasis</em> and a mark<sup data-cite="s1"><a href="#s1">[1]</a></sup>, then more words after it.</p>',
        ],
        [
          'k2',
          '.k2{columns:2}',
          '<ul data-block="k2" class="k2"><li>One</li><li>Two</li><li>Three</li><li>Four</li></ul>',
        ],
        ['k3', '', researchTable('k3')],
        ['k4', '', '<p data-block="k4" dir="rtl"><span>שלום</span> <span>עולם</span> <span>and English</span></p>'],
        [
          'k5',
          '',
          '<p data-block="k5"><span>The words</span> <span>שלום</span> <span>עולם</span> <span>mean hello world.</span></p>',
        ],
        [
          'k6',
          '.k6{display:flex} .k6 span:first-child{white-space:pre}',
          '<p data-block="k6" class="k6"><span>Now </span><span>here.</span></p>',
        ],
        ['k7', '.k7{display:flex;gap:.3em}', '<p data-block="k7" class="k7"><span>Now</span> <span>here.</span></p>'],
        ['k8', '.k8{display:flex}', '<p data-block="k8" class="k8"><span>Now</span><span>here.</span></p>'],
        // Hebrew set right to left with its numbers, a direction found from the text, and an isolate of its own.
        ['k10', '', '<p data-block="k10" dir="rtl">המחיר 12 - 34 לחודש</p>'],
        ['k11', '', '<p data-block="k11" dir="auto">12 - 34</p>'],
        ['k12', '', '<p data-block="k12">The name <bdi>שלום</bdi> came 12 - 34.</p>'],
        ['k13', '.k13{direction:rtl;unicode-bidi:plaintext}', '<p data-block="k13" class="k13">Not free.</p>'],
        ['k14', '', '<p data-block="k14" dir="rtl"><bdi>Sophia</bdi> אמרה 12 - 34</p>'],
        [
          'k15',
          '.k15 span{position:relative;top:-.4em;font-size:.75em}',
          '<p data-block="k15" class="k15">Not free<span>†</span> today, and 1.2 as written.</p>',
        ],
        [
          'k9',
          '.k9 code{font-size:.8em} .k9 b{font-size:1.4em}',
          '<p data-block="k9" class="k9">It costs 10<span>2</span> USD, <small>small</small>, <code>code</code> and <b>large</b>.</p>',
        ],
      ]
      const receipt = await captureHtml(
        job(
          page(
            `body{margin:0;font:16px/1.5 Georgia,serif;color:#222;background:#fafafa} main{padding:0 16px} p,ul{margin:0 0 16px}
             ${blocks.map(([, css]) => css).join(' ')}`,
            `<main><section data-section="s1">${blocks.map(([, , html]) => html).join('')}</section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const t of ['w390-light', 'w1280-light']) {
        const detail = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === t)?.detail
        assert.equal(
          detail,
          `${RUN_TOGETHER}o1, o2, o3, o4, o5, o6, o7, o8, o9, o10, o11, o12, o13, o18, o19, o20, o14, o15, o16, o17`,
          t,
        )
      }
      const sweep = String(receipt.checks.find((c) => c.name === 'widths_visible')?.detail)
      assert.ok(
        sweep.startsWith(
          `at 320px: ${RUN_TOGETHER}o1, o2, o3, o4, o5, o6, o7, o8, o9, o10, o11, o12, o13, o18, o19, o20, o14, o15, o16, o17;`,
        ),
        sweep,
      )
      // Readable at both targets, reversed and run together only in windows 960 to 1100px wide: the band's ends fail.
      // So are "102" raised to 10² and "12 - 34" set right to left there (the owner's 4201543227, 4201543372).
      const banded = await sweepOf(
        `.m1,.m2,.m3,.m4{margin:0 0 16px} .m1,.m2{display:flex} .m1 span:first-child{margin-right:.3em}
         .m2 span:first-child{white-space:pre}
         @media (min-width: 960px) and (max-width: 1100px){.m1 span:first-child{order:2} .m2 span:first-child{white-space:normal}
           .m3 span{vertical-align:super;font-size:.75em} .m4{direction:rtl}}`,
        '<p data-block="m1" class="m1"><span>Not</span><span>free</span></p><p data-block="m2" class="m2"><span>Now </span><span>here.</span></p>' +
          '<p data-block="m3" class="m3">It costs 10<span>2</span> USD.</p><p data-block="m4" class="m4">12 - 34</p>',
      )
      assert.deepEqual(
        [banded?.outcome, banded?.detail],
        ['failed', `at 960px: ${RUN_TOGETHER}m1, m2, m3, m4; at 1100px: ${RUN_TOGETHER}m1, m2, m3, m4`],
      )
      // A reversed wrap draws the second run above the first only where the runs no longer share a line.
      const wrapped = await sweepOf(
        `.w1{display:flex;flex-wrap:wrap-reverse} .w1 span{flex:0 0 ${RESPONSIVE}}`,
        '<p data-block="w1" class="w1"><span>Not</span><span>free</span></p>',
      )
      failsAt(wrapped, new RegExp(`at 801px: ${RUN_TOGETHER}w1(;|$)`, 'u'))
    },
  )

  // The security review of 014b03f (4201488127): a text with no letter has no direction of its own, so it takes the
  // job's language's, which the page cannot change: "12 - 34" set right to left reads as written in a Hebrew report,
  // where English set left to right reads too, and is drawn "34 - 12" in an English one.
  it(
    "holds a block with no letter to the direction of the job's language, never to one the page sets (#117)",
    { skip },
    async () => {
      assert.deepEqual(
        ['en', 'he', 'ar', 'fa', 'az-Arab', 'zh'].map((l) => baseDirection(l)),
        ['ltr', 'rtl', 'rtl', 'rtl', 'rtl', 'ltr'],
      )
      const rtlBlocks =
        '<p data-block="h1" dir="rtl">12 - 34</p><p data-block="h2" dir="rtl">המחיר 12 - 34</p><p data-block="h3">Not free.</p>'
      for (const [language, outcomeThere] of [
        ['he', 'passed'],
        ['en', 'failed'],
      ] as const) {
        const read = await captureHtml(
          job(page(`${BASE} p{margin:0 0 16px}`, `<main><section data-section="s1">${rtlBlocks}</section></main>`), {
            language,
          }),
          { env },
        )
        assert.equal(read.status, 'succeeded', JSON.stringify(read.error))
        for (const t of ['w390-light', 'w1280-light'])
          assert.deepEqual(
            [
              outcome(read, 'blocks_visible', t),
              read.checks.find((c) => c.name === 'blocks_visible' && c.target === t)?.detail ?? null,
            ],
            [outcomeThere, outcomeThere === 'passed' ? null : `${RUN_TOGETHER}h1`],
            `${language} ${t}`,
          )
      }
      const straight = await sweepOf(
        `.w1{display:flex;flex-wrap:wrap} .w1 span{flex:0 0 ${RESPONSIVE}}`,
        '<p data-block="w1" class="w1"><span>Not</span><span>free</span></p>',
      )
      assert.deepEqual([straight?.outcome, straight?.detail], ['passed', 'measured at 320, 2560px'])
    },
  )

  // The owner's 4201040032 (P1 4201008903): a block at `top: 700px` in a section of `height: 100%` down from the root,
  // which clips it, shows at 390×844 and 1280×800 and through the sweep, at the sweep's 800px, and is cut in a window
  // 600px high. A static page sizes and places nothing by the window's height: at each band end the page is laid out at
  // other heights too, and a box or line placed otherwise fails, as a box set against the window's bottom and a root
  // and body as tall as the window do; and a window that cannot scroll shows a reader no more of the page than its
  // height. The same content static, width percentages (padding-top among them, which CSS takes from the width), and a
  // body that hides only what overflows its width pass.
  it(
    'fails a page laid out otherwise at another window height, or one the window cannot scroll down; static content and width percentages pass (#117)',
    { skip },
    async () => {
      failsAt(
        await sweepOf(
          `html,body,main,section{height:100%} section{position:relative;overflow:hidden}
           [data-block=b1]{position:absolute;top:700px;margin:0}`,
          '<p data-block="b1">Not free.</p>',
        ),
        /^at 320px: laid out otherwise/u,
        otherHeights(320),
        otherHeights(2560),
      )
      failsAt(
        await sweepOf(
          '.foot{position:absolute;bottom:0;left:0;right:0;height:40px;background:#fafafa} p{margin:0}',
          '<p data-block="b1">Free.</p><div class="foot"></div>',
        ),
        otherHeights(320),
      )
      failsAt(await sweepOf('html,body{height:100%} p{margin:0}', '<p data-block="b1">Free.</p>'), otherHeights(320))
      for (const [css, body] of [
        [
          'section{position:relative;overflow:hidden} [data-block=b1]{margin:700px 0 0}',
          '<p data-block="b1">Not free.</p>',
        ],
        [
          'main{width:80%;padding:0 5%;margin:0 auto} [data-block=b1]{width:50%;padding-top:10%;margin:0}',
          '<p data-block="b1">Not free.</p>',
        ],
        ['body{overflow-x:hidden} p{margin:0}', '<p data-block="b1">Free.</p>'],
      ]) {
        const read = await sweepOf(css ?? '', body ?? '')
        assert.equal(read?.outcome, 'passed', `${css}: ${String(read?.detail)}`)
      }
      const pinned = await captureHtml(
        job(
          page(
            `${BASE} body{overflow:hidden}`,
            '<main><section data-section="s1"><p data-block="b1">Free.</p></section></main>',
          ),
        ),
        { env },
      )
      assert.equal(pinned.status, 'succeeded', JSON.stringify(pinned.error))
      const stuck = /the window cannot scroll down the page: its overflow is hidden on the root or the body/u
      for (const target of ['w390-light', 'w1280-light'])
        failsAt(
          pinned.checks.find((c) => c.name === 'blocks_visible' && c.target === target),
          stuck,
        )
      failsAt(
        pinned.checks.find((c) => c.name === 'widths_visible'),
        new RegExp(`^at 320px: ${stuck.source}`, 'u'),
      )
    },
  )

  it(
    'refuses a page whose widths the sweep cannot bound, and a sweep past its time, never leaving a band out (#117, CX-0039)',
    { skip },
    async () => {
      const sweep = async (css: string, opts: { sweepMs?: number } = {}) => {
        const receipt = await captureHtml(
          job(
            page(
              `${BASE} ${css}`,
              '<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p></section></main>',
            ),
          ),
          { env, ...opts },
        )
        assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
        const c = receipt.checks.find((k) => k.name === 'widths_visible')
        return `${String(c?.outcome)}: ${String(c?.detail)}`
      }
      assert.match(
        await sweep('@media (min-width: 40em){p{color:#111}}'),
        /^failed: width conditions the sweep cannot read/u,
      )
      assert.match(
        await sweep('section{container-type:inline-size} @container (min-width: 400px){p{color:#111}}'),
        /^failed: width conditions the sweep cannot read: @container/u,
      )
      assert.match(await sweep('@media (min-width: 3000px){p{color:#111}}'), /^failed: breakpoints past the/u)
      const nine = Array.from({ length: 9 }, (_, i) => `@media (min-width: ${String(400 + i * 100)}px){p{color:#111}}`)
      assert.match(await sweep(nine.join(' ')), /^failed: 9 width breakpoints/u)
      assert.match(
        await sweep('@media (min-width: 600px){p{color:#111}}', { sweepMs: 1 }),
        /^failed: how the texts lie inside the bands was not read at every width within the sweep's time; \d+ band ends not measured within 0.001 s$/u,
      )
      assert.match(
        await sweep('@media (min-width: 600px){p{color:#111}}'),
        /^passed: measured at 320, 599, 600, 2560px/u,
      )
    },
  )

  it(
    'settles a page of 4000 labels in a receipt the service takes, failing the measure it cut (#117)',
    { skip },
    async () => {
      const labels = Array.from({ length: 4000 }, (_, i) => `<h6>Label ${String(i)}</h6>`).join('')
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} h6{display:inline;margin:0 .3em;font-size:12px}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>${labels}</section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      assert.ok(jsonbBytes(receipt) <= RECEIPT_BYTES, `the receipt weighs ${String(jsonbBytes(receipt))} bytes`)
      for (const t of receipt.targets) {
        assert.ok(jsonbBytes(t.page) <= MEASURE_BYTES, `${t.id} weighs ${String(jsonbBytes(t.page))} bytes`)
        assert.deepEqual(
          t.page.blocks.map((b) => b.id),
          ['b1'],
          'the block is kept',
        )
        const visible = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === t.id)
        assert.equal(visible?.outcome, 'failed', t.id)
        assert.match(String(visible?.detail), /labels, texts, runs or blocks left out of the measure/u, t.id)
      }
    },
  )

  it(
    'reads contrast against the paint beneath the text: its colours where known, unknown where not, never passed (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .dark{position:relative;background:#000;width:40px;height:3em}
            .out{position:absolute;left:60px;top:0;margin:0;color:#fff;white-space:nowrap}
            .slab{position:absolute;inset:0;background:#111} .over{position:relative;color:#222}
            .spill{width:20px;background:#000;color:#fff;white-space:nowrap}
            .hl{position:relative} .hl::before{content:"";position:absolute;inset:0;background:#111;z-index:-1}
            .accent{position:relative} .accent::after{content:"";position:absolute;left:0;bottom:-6px;width:2rem;height:2px;background:#c33}
            .frame{position:relative;background:#000;border:24px solid #fff;width:200px;height:3em}
            .onborder{position:absolute;top:-22px;left:0;margin:0;font-size:16px;color:#fff;white-space:nowrap}
            .inset{background:#000;color:#fff;box-shadow:inset 0 0 0 100px #fff}
            .glow{height:10px;box-shadow:0 0 0 40px #111} .ring{height:10px;outline:40px solid #111}
            .boxed{border:2px solid #222;background:#fff;padding:.5em} .card{box-shadow:0 1px 3px #888;background:#fff;padding:.5em}
            .gap{height:80px}
            .bimg{position:relative;background:#000;border:100px solid transparent;border-image:linear-gradient(#fff,#fff) 1;width:40px;height:40px}
            .onbimg{position:absolute;top:-90px;left:-90px;margin:0;font-size:16px;color:#fff;white-space:nowrap}
            .blend{background-color:#fff;background-image:linear-gradient(#fff,#fff);background-blend-mode:difference;color:#000}
            .bout{height:10px;border:1px solid transparent;border-image:linear-gradient(#111,#111) 1;border-image-outset:40px}
            .bfill{background:#000;color:#fff;border:2px solid transparent;border-image:linear-gradient(#fff,#fff) fill 1}
            .inward{background:#000;color:#fff;outline:6px solid #fff;outline-offset:-6px}
            .himg{position:relative} .himg::before{content:"";position:absolute;inset:0;z-index:-1;border:2em solid transparent;border-image:linear-gradient(#111,#111) 1}`,
            `<main><section data-section="s1"><h2 class="accent">Findings</h2><p data-block="b1">Text.</p>
          <div class="dark"><h2 class="out">Host three is free</h2></div>
          <div style="position:relative"><div class="slab"></div><p data-block="b2" class="over">Dark on a dark slab.</p></div>
          <p data-block="b3" class="spill">Past its own black box.</p><p data-block="b4" class="hl">Over a dark highlight.</p>
          <p data-block="b5" style="background:#000;color:#fff">On its own black.</p>
          <div style="background:#123"><h2 style="color:#fff">On its parent</h2></div>
          <div class="frame"><h2 class="onborder">On a white border</h2></div><p data-block="b6" class="inset">On an inset shadow.</p>
          <div class="gap"></div><div class="glow"></div><p data-block="b7">Near a dark glow.</p><div class="gap"></div>
          <p data-block="b8" class="boxed">In a bordered box.</p><p data-block="b9" class="card">In a card.</p>
          <div class="gap"></div><div class="ring"></div><p data-block="b10">Near a dark ring.</p>
          <div class="gap"></div><div class="bimg"><h2 class="onbimg">On a white border image</h2></div>
          <p data-block="b11" class="blend">Over blended layers.</p>
          <div class="gap"></div><div class="bout"></div><p data-block="b12">Near a dark border image.</p>
          <div class="gap"></div><p data-block="b13" class="himg">Over a generated border image.</p>
          <div class="gap"></div><p data-block="b14" class="bfill">On a filled border image.</p>
          <div class="gap"></div><p data-block="b15" class="inward">Under an outline drawn inward.</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        // Each dark or light paint beneath a text of its own shade is read, and found low: a sibling slab, its own box
        // spilt past, a generated highlight, an inset shadow, a glow, a ring, an inward outline, a parent's border, and
        // the page beneath a text placed outside its painted parent. A border image is not read: unknown (#117).
        assert.deepEqual(
          [...measured.blocks, ...measured.framing].map(contrastSeen),
          [
            ['b1', 'read'],
            ['b2', 'low'],
            ['b3', 'low'],
            ['b4', 'low'],
            ['b5', 'read'],
            ['b6', 'low'],
            ['b7', 'low'],
            ['b8', 'read'],
            ['b9', 'read'],
            ['b10', 'low'],
            ['b11', 'filtered'],
            ['b12', 'background_elsewhere'],
            ['b13', 'background_elsewhere'],
            ['b14', 'background_elsewhere'],
            ['b15', 'low'],
            ['text 1 h2', 'read'],
            ['text 2 h2', 'low'],
            ['text 3 h2', 'read'],
            ['text 4 h2', 'low'],
            ['text 5 h2', 'background_elsewhere'],
          ],
          target,
        )
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
      }
    },
  )

  it(
    'fails known dark paint beneath dark research as low contrast, and reads light paint, cards and decoration (#117)',
    { skip },
    async () => {
      // Codex's four concealments (4197480601): black 24px research on a white page over a black generated box, a
      // black border, a black spread shadow and a black sibling box; two a generated box's place alone tells: one
      // beneath a positioned text at the default z-index, and one stacked in a grid cell; and a text at the corner of a
      // white circle's box, where the black around it, not the circle, lies beneath it.
      const stripes = Array.from(
        { length: 20 },
        (_, i) => `<i style="left:${String(i * 12)}px;background:hsl(${String(i * 18)} 60% 92%)"></i>`,
      ).join('')
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} body{background:#fff} p,h2{font-size:24px;color:#000;margin:0 0 2rem}
            .gen{position:relative} .gen::before{content:"";position:absolute;inset:0;background:#000;z-index:-1}
            .bord{position:relative;border-top:40px solid #000} .onb{position:absolute;top:-38px;left:0}
            .spread{height:4px;box-shadow:0 0 0 40px #000} .after{margin-top:0} .gap{height:80px}
            .slabbed{position:relative} .slab{position:absolute;inset:0;background:#000} .over{position:relative}
            .zauto{position:relative} .zauto::before{content:"";position:absolute;inset:0;background:#000}
            .zauto span{position:relative}
            .stack{display:grid} .stack::before{content:"";grid-area:1/1;background:#000} .stack span{grid-area:1/1}
            .hl{position:relative} .hl::before{content:"";position:absolute;inset:0;background:#fff3a0;z-index:-1}
            .hero{position:relative;color:#fff} .hero::before{content:"";position:absolute;inset:0;background:#123;z-index:-1}
            .card{border:1px solid #bbb;box-shadow:0 4px 24px rgba(0,0,0,.25);background:#fff;padding:1rem;margin-bottom:0}
            .card p{margin:0} .near{margin:0 0 2rem}
            .decor{position:relative} .blob{position:absolute;inset:0;background:#eef3ff;border-radius:2rem}
            .dot{position:relative;padding-right:2rem}
            .dot::after{content:"";position:absolute;right:4px;top:4px;width:10px;height:10px;border-radius:50%;background:#000}
            .bullet::before{content:"";display:inline-block;width:.4em;height:.4em;background:#000;margin-right:.4em}
            .night{background:#000;padding:20px} .moon{position:relative;width:160px;height:160px;border-radius:50%;background:#fff}
            .moon p{position:absolute;left:0;top:0;margin:0;font-size:12px;line-height:1}
            .rcard{background:#123;color:#fff;border-radius:40px;padding:8px 16px 40px}
            .gcard{position:relative;color:#fff;padding:8px 16px 40px}
            .gcard::before{content:"";position:absolute;inset:0;background:#123;border-radius:40px;z-index:-1}
            .striped{position:relative;width:240px} .striped i{position:absolute;top:0;bottom:0;width:12px}
            .striped p{position:relative;white-space:nowrap;font-size:12px}`,
            `<main><section data-section="s1"><h2>Findings</h2>
          <p data-block="a1" class="gen">Not free, over a black box.</p>
          <div class="bord"><p data-block="a2" class="onb">Not free, on a black border.</p></div>
          <div class="gap"></div><div class="spread"></div><p data-block="a3" class="after">Not free, in a black shadow.</p>
          <div class="gap"></div>
          <div class="slabbed"><div class="slab"></div><p data-block="a4" class="over">Not free, on a black box.</p></div>
          <p data-block="a5" class="zauto"><span>Not free, over a placed black box.</span></p>
          <p data-block="a6" class="stack"><span>Not free, in a black grid cell.</span></p>
          <p data-block="p1" class="hl">Under a light highlight.</p>
          <p data-block="p2" class="hero">Light on a dark generated box.</p>
          <div class="card"><p data-block="p3">In a shadowed, bordered card.</p></div>
          <p data-block="p4" class="near">Just below the card's shadow.</p>
          <div class="decor"><div class="blob"></div><p data-block="p5" class="over">Over a pale decoration.</p></div>
          <p data-block="p6" class="dot">Beside a dark dot.</p>
          <p data-block="p7" class="bullet">After a dark bullet.</p>
          <p data-block="p8" class="hero"><span>Light, in a run, on a dark generated box.</span></p>
          <div class="night"><div class="moon"><p data-block="a7">Not</p></div></div>
          <p data-block="p9" class="rcard">In a rounded card.</p>
          <p data-block="p10" class="gcard">On a rounded generated box.</p>
          <div class="striped">${stripes}<p data-block="u1">Over more pale stripes than the measure reads apart.</p></div>
          </section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          measured.blocks.map(contrastSeen),
          [
            ['a1', 'low'],
            ['a2', 'low'],
            ['a3', 'low'],
            ['a4', 'low'],
            ['a5', 'low'],
            ['a6', 'low'],
            ['p1', 'read'],
            ['p2', 'read'],
            ['p3', 'read'],
            ['p4', 'read'],
            ['p5', 'read'],
            ['p6', 'read'],
            ['p7', 'read'],
            ['p8', 'read'],
            ['a7', 'low'],
            ['p9', 'read'],
            ['p10', 'read'],
            ['u1', 'background_elsewhere'],
          ],
          target,
        )
        const ratio = (id: string) => measured.blocks.find((b) => b.id === id)?.contrast.ratio ?? 0
        for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'])
          assert.ok(ratio(id) < 1.5, `${target}: ${id} ${ratio(id)}`)
        for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'])
          assert.ok(ratio(id) >= 7, `${target}: ${id} ${ratio(id)}`)
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
        assert.equal(
          receipt.checks.find((c) => c.name === 'contrast' && c.target === target)?.detail,
          'a1, a2, a3, a4, a5, a6, a7',
          target,
        )
        assert.equal(outcome(receipt, 'blocks_visible', target), 'passed', `${target}: low contrast shows the text`)
      }
    },
  )

  it(
    'reads paint through its opacity and in the order the browser paints it, never taking a covered box for the top (#117)',
    { skip },
    async () => {
      // Codex's faded backdrops (4198217238): white 24px research over black drawn at opacity .1, a generated box and a
      // sibling, reads about 1.3, not 21; black over the same reads high. And the paint order the hit-test stack gives:
      // a black box under a white card, a negative-z black box under its own white section, a white generated box
      // drawn over a black block, and a black shadow drawn under a half-white veil, each under a text of its shade; and a
      // gradient crossing the text's grey between its stops, a small black tile beneath white text, and black text
      // inside a white box's padding where its thick black rounded border's inner curve reaches. And Codex's opaque case
      // (4198225737): a block's own white background over a black box at z-index -1, beneath its white text.
      const receipt = await captureHtml(
        job(
          page(
            `body{font:24px/32px Arial;margin:0;padding:16px;background:white;color:black} [data-block]{margin:0}
            .case{position:relative;margin-bottom:80px}
            .f1,.f2,.q1,.q3{isolation:isolate} .f1,.f2{color:#fff}
            .f1::before,.q1::before{content:"";position:absolute;inset:0;background:#000;opacity:.1;z-index:-1}
            .dim{position:absolute;inset:0;background:#000;opacity:.1;z-index:-1}
            .q2{isolation:isolate;color:#fff} .q2::before{content:"";position:absolute;inset:0;background:#000;z-index:-1}
            .q3 .dim{opacity:.2}
            .under{position:absolute;inset:0;background:#000;z-index:-1} .card{background:#fff;color:#fff}
            .f4{position:static;background:#000} .f4 section,.f7 section{background:#fff;color:#fff}
            .f4 section::before,.f7 section::before{content:"";position:absolute;left:0;right:0;height:60px;background:#000;z-index:-1}
            .f7{isolation:isolate}
            .f5{isolation:isolate;color:#fff} .f5::before{content:"";position:absolute;inset:0;background:#fff}
            .f5 .x{background:#000} .f5 span{position:relative}
            .glow{height:4px;box-shadow:0 0 0 40px #000} .veil i{position:absolute;inset:0;background:rgba(255,255,255,.5)}
            .veil p{position:relative;color:#808080}
            .q4{isolation:isolate;background:#fff} .q4::before{content:"";position:absolute;inset:0;background:#eef3ff;z-index:-1}
            .u2{opacity:.5;color:#fff} .u2 .box{position:absolute;inset:0;background:#000} .u2 p{position:relative}
            .g1{font-size:18px;color:#757575;background:linear-gradient(90deg,#000,#fff)}
            .g2{color:#fff;background:#fff linear-gradient(#000,#000) no-repeat;background-size:12px 12px}
            .g3{color:#222;background:linear-gradient(#fff,#eee)}
            .f8,.q5,.q6{isolation:isolate} .f8,.q5{color:#fff} .f8 p,.q6 p{background:#fff} .q6 p{color:#000}
            .ring{position:relative;width:200px;height:160px;border:24px solid #000;border-radius:60px;background:#fff}
            .ring p{position:absolute;left:0;top:0;font-size:12px;line-height:1;color:#000}`,
            `<main>
          <div class="case f1"><p data-block="f1">Not free, over a faded generated box.</p></div>
          <div class="case f2"><div class="dim"></div><p data-block="f2">Not free, over a faded box.</p></div>
          <div class="case q1"><p data-block="q1">Readable over a faded generated box.</p></div>
          <div class="case q2"><p data-block="q2">Light over a black generated box.</p></div>
          <div class="case q3"><div class="dim"></div><p data-block="q3">Readable over a faded box.</p></div>
          <div class="case"><div class="under"></div><div class="card"><p data-block="f3">Not free, on a white card.</p></div></div>
          <div class="case f4"><section><p data-block="f4">Not free, on a white section.</p></section></div>
          <div class="case f7"><section><p data-block="f7">Not free, on its own white section.</p></section></div>
          <div class="case f5"><div class="x"><p data-block="f5"><span>Not free, over a white box.</span></p></div></div>
          <div class="case"><div class="glow"></div><div class="case veil"><i></i><p data-block="f6">Not free, under a veil.</p></div></div>
          <div class="case q4"><p data-block="q4">Readable on a card over its pale decoration.</p></div>
          <div class="case u2"><div class="box"></div><p data-block="u2">Faded with its backdrop.</p></div>
          <div class="case"><p data-block="g1" class="g1">Not free, grey across a black-to-white gradient.</p></div>
          <div class="case"><p data-block="g2" class="g2">Not free, white beside a small black tile.</p></div>
          <div class="case"><p data-block="g3" class="g3">Readable on a subtle gradient.</p></div>
          <div class="case ring"><p data-block="c1">Not</p></div>
          <div class="case f8"><div class="under"></div><p data-block="f8">Not free, on its own white over black.</p></div>
          <div class="case q5"><div class="under"></div><p data-block="q5">Light over a black box beneath it.</p></div>
          <div class="case q6"><div class="under"></div><p data-block="q6">Dark on its own white over black.</p></div>
          </main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          measured.blocks.map(contrastSeen),
          [
            ['f1', 'low'],
            ['f2', 'low'],
            ['q1', 'read'],
            ['q2', 'read'],
            ['q3', 'read'],
            ['f3', 'low'],
            ['f4', 'low'],
            ['f7', 'low'],
            ['f5', 'low'],
            ['f6', 'low'],
            ['q4', 'read'],
            ['u2', 'read'],
            ['g1', 'low'],
            ['g2', 'low'],
            ['g3', 'read'],
            ['c1', 'low'],
            ['f8', 'low'],
            ['q5', 'read'],
            ['q6', 'read'],
          ],
          target,
        )
        const ratio = (id: string) => measured.blocks.find((b) => b.id === id)?.contrast.ratio ?? 0
        for (const id of ['f1', 'f2']) assert.ok(ratio(id) > 1.2 && ratio(id) < 1.35, `${target}: ${id} ${ratio(id)}`)
        for (const id of ['f3', 'f4', 'f7', 'f5', 'f6', 'f8'])
          assert.ok(ratio(id) < 1.5, `${target}: ${id} ${ratio(id)}`)
        for (const id of ['q1', 'q2', 'q3', 'q4', 'g3', 'q5', 'q6'])
          assert.ok(ratio(id) >= 7, `${target}: ${id} ${ratio(id)}`)
        // White over black, faded together at .5 over the page: #fff at half over #808080 (#117, 4201022306).
        assert.ok(ratio('u2') > 3.5 && ratio('u2') < 4.2, `${target}: u2 ${ratio('u2')}`)
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
      }
    },
  )

  it(
    'reads a gradient in the colour space and along the hue path it is mixed in, not as sRGB between its stops (#117)',
    { skip },
    async () => {
      // The owner's gradient (4198805119): white 24px research on red to blue `in hsl longer hue`, which Chromium paints
      // through yellow and green (white on them 1.08 in its pixels), read as an sRGB mix of red and blue (4 to 1). The same
      // path written radially, as a cone and in HWB. The positives, each at or above 3 in Chromium's pixels: white on an
      // sRGB red to blue (4.03), black on an HSL red to lime by the shorter hue (5.25), black on a pale OKLCH pair mixed
      // by default in Oklab (17.8), white on a dark HSL path the longer way (4.21, at an olive between its samples), white
      // on red to blue `in oklch longer hue` (3.85, at a green the sRGB mix never reaches, below either stop), and black
      // 16px text on two OKLCH colours of one lightness, mixed by default in Oklab (5.22; an sRGB mix of them reads 3.9).
      // And black on an HSL path the longer way whose darkest blue lies between the samples five steps would take (2.34
      // in Chromium's pixels; five steps read 3.9).
      const receipt = await captureHtml(
        job(
          page(
            `body{font:24px/32px Arial;margin:0;padding:16px;background:white;color:black}
            [data-block]{margin:0 0 40px;width:120px;color:#fff}
            .h1{background:linear-gradient(90deg in hsl longer hue,red,blue)}
            .h2{background:radial-gradient(circle in hsl longer hue,red,blue)}
            .h3{background:conic-gradient(from 0deg in hsl longer hue,red,blue)}
            .h4{background:linear-gradient(90deg in hwb longer hue,red,blue)}
            .p5{background:linear-gradient(90deg in oklch longer hue,red,blue)}
            .p6{font-size:16px;color:#000;background:linear-gradient(90deg,oklch(.62 .2 30),oklch(.62 .2 150))}
            .h5{color:#000;background:linear-gradient(90deg in hsl longer hue,hsl(218 76% 49%),hsl(180 78% 66%))}
            .p1{background:linear-gradient(90deg,red,blue)}
            .p2{color:#000;background:linear-gradient(90deg in hsl shorter hue,red,lime)}
            .p3{color:#000;background:linear-gradient(90deg,oklch(.95 .05 90),oklch(.95 .05 270))}
            .p4{background:linear-gradient(90deg in hsl longer hue,hsl(240 100% 25%),hsl(300 100% 25%))}`,
            `<main>
          <p data-block="h1" class="h1">Not free.</p>
          <p data-block="h2" class="h2">Not free.</p>
          <p data-block="h3" class="h3">Not free.</p>
          <p data-block="h4" class="h4">Not free.</p>
          <p data-block="h5" class="h5">Not free.</p>
          <p data-block="p1" class="p1">Readable.</p>
          <p data-block="p2" class="p2">Readable.</p>
          <p data-block="p3" class="p3">Readable.</p>
          <p data-block="p4" class="p4">Readable.</p>
          <p data-block="p5" class="p5">Readable.</p>
          <p data-block="p6" class="p6">Readable.</p>
          </main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        const ratio = (id: string) => measured.blocks.find((b) => b.id === id)?.contrast.ratio ?? 0
        assert.deepEqual(
          measured.blocks.map(contrastSeen),
          [
            ['h1', 'low'],
            ['h2', 'low'],
            ['h3', 'low'],
            ['h4', 'low'],
            ['h5', 'low'],
            ['p1', 'read'],
            ['p2', 'read'],
            ['p3', 'read'],
            ['p4', 'read'],
            ['p5', 'read'],
            ['p6', 'read'],
          ],
          target,
        )
        for (const id of ['h1', 'h2', 'h3', 'h4']) assert.ok(ratio(id) < 1.2, `${target}: ${id} ${ratio(id)}`)
        assert.ok(ratio('h5') < 2.6, `${target}: h5 is read at its darkest blue: ${ratio('h5')}`)
        for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) assert.ok(ratio(id) >= 3, `${target}: ${id} ${ratio(id)}`)
        assert.ok(ratio('p4') < 4.3, `${target}: p4 is read at its olive, between samples: ${ratio('p4')}`)
        assert.ok(ratio('p5') < 3.95, `${target}: p5 is read at its green, below its red stop: ${ratio('p5')}`)
        assert.ok(ratio('p6') >= 4.5 && ratio('p6') < 5.4, `${target}: p6 is read along Oklab: ${ratio('p6')}`)
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
      }
    },
  )

  it(
    'fails a research table whose cells the page draws under other headers or off their rows; a native table passes (#117)',
    { skip },
    async () => {
      // Codex's table (4198787418) and the owner's reproduction (4198885408): `tr { display: flex }` with
      // `td:first-child { order: 2 }` draws $10 under Plan and Basic under Price, while the markup, the rows and every
      // text stay. And the other ways to draw a cell elsewhere: a body row reversed, cells stacked, a cell's text moved
      // under the next header or off its row, the head row drawn below the body, the header labels swapped, and a table
      // rearranged only between the targets. The positives: the native table, a styled one with a row header, and one
      // set right to left. And the security review's wrapper (4199654105): a block on a <div> around its table, which the
      // profile admits, read through the table it holds, reordered by flex (m9) or grid (m10) or not (n4); and the owner's
      // split (4199682426), a wrapper holding the head in one table and the body, reordered, in another (m11).
      const receipt = await captureHtml(
        job(
          page(
            `body{font:16px/24px Arial;margin:0;padding:16px;background:#fff;color:#000} table{margin:0 0 40px;border-collapse:collapse}
            th,td{padding:4px 12px;text-align:left;width:80px} .styled td:last-child{text-align:right}
            .styled tbody tr:nth-child(odd){background:#f3f3f3} .styled th,.styled td{border-bottom:1px solid #ccc}
            .m1 tr{display:flex} .m1 tbody td:first-child{order:2}
            .m2 tbody tr{display:flex;flex-direction:row-reverse}
            .m3 th,.m3 td{display:block}
            .m4 tbody td:first-child{position:relative;left:110px}
            .m5 tbody tr:first-child td:last-child span{position:relative;top:40px}
            .m6 thead{display:table-footer-group}
            .m8 th span{position:relative} .m8 th:first-child span{left:104px} .m8 th:last-child span{left:-104px}
            @media (min-width:600px) and (max-width:900px){.m7 tr{display:flex} .m7 tbody td:first-child{order:2}}
            .m9 tr{display:flex} .m9 tbody td:first-child{order:2}
            .m10 tr{display:grid;grid-template-columns:repeat(2,104px)} .m10 tbody td:first-child{grid-column:2;grid-row:1}
            .m11 tbody tr{display:flex} .m11 tbody td:first-child{order:2}`,
            `<main>
          ${researchTable('n1')}
          <table data-block="n2" class="styled"><thead><tr><th>Plan</th><th>Price</th></tr></thead>
          <tbody><tr><th>Basic</th><td>$10</td></tr><tr><th>Pro</th><td>$20</td></tr></tbody></table>
          <table data-block="n3" dir="rtl"><thead><tr><th><span>תוכנית</span></th><th><span>מחיר</span></th></tr></thead>
          <tbody><tr><td>בסיסי</td><td><span>10 ש״ח</span></td></tr><tr><td>מקצועי</td><td><span>20 ש״ח</span></td></tr></tbody></table>
          ${researchTable('m1', 'm1')}
          ${researchTable('m2', 'm2')}
          ${researchTable('m3', 'm3')}
          ${researchTable('m4', 'm4')}
          ${researchTable('m5', 'm5')}
          ${researchTable('m6', 'm6')}
          ${researchTable('m7', 'm7')}
          ${researchTable('m8', 'm8')}
          ${researchTable('m9', 'm9').replace('<table data-block="m9" class="m9">', '<div data-block="m9" class="m9"><table>').replace('</table>', '</table></div>')}
          ${researchTable('n4').replace('<table data-block="n4" class="">', '<div data-block="n4"><table>').replace('</table>', '</table></div>')}
          ${researchTable('m10', 'm10').replace('<table data-block="m10" class="m10">', '<div data-block="m10" class="m10"><table>').replace('</table>', '</table></div>')}
          <div data-block="m11" class="m11"><table><thead><tr><th>Plan</th><th>Price</th></tr></thead></table><table><tbody><tr><td>Basic</td><td>$10</td></tr><tr><td>Pro</td><td>$20</td></tr></tbody></table></div>
          </main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      // A cell's text moved onto its neighbour's (m4, m5) is also drawn over or beside other text; the rest only move.
      const moved =
        'm4, m5; tables whose cells are drawn under other headers or off their rows: m1, m2, m3, m4, m5, m6, m8, m9, m10, m11'
      for (const target of ['w390-light', 'w1280-light']) {
        const check = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === target)
        assert.deepEqual([check?.outcome, check?.detail], ['failed', moved], target)
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.equal('misplaced' in measured, false, `${target}: the list is the kernel's own, not the receipt's`)
        assert.deepEqual(
          measured.blocks.filter((b) => b.issues.length > 0).map((b) => b.id),
          ['m4', 'm5'],
          `${target}: every other text is shown, whole and apart`,
        )
      }
      const widths = receipt.checks.find((c) => c.name === 'widths_visible')
      assert.equal(widths?.outcome, 'failed')
      // m7 is rearranged only within 600 to 900px, between the targets: the band ends there show it, and only there.
      for (const width of [600, 900])
        assert.ok(widths?.detail?.includes(movedAt(width, 'm1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11')), `${width}`)
      for (const width of [599, 901])
        assert.ok(widths?.detail?.includes(movedAt(width, 'm1, m2, m3, m4, m5, m6, m8, m9, m10, m11')), `${width}`)
    },
  )

  // The security review of ecf149b (4199947381): seven gradients stacked combine past 64 ways, so a reading was unknown,
  // which the gate admits, while a black top gradient hid black research. Past the cap each channel is bounded instead.
  // The owner's (4199983800): six wrappers and the paragraph each with one black gradient (k5), and seven hard-stop
  // black-to-white layers (k6); and one white (k7) and one black (k8) layer, read exactly as before.
  it(
    'reads a stack of gradients past 64 combinations conservatively: a dark top over dark text is low, light layers read (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `body{font:24px/32px Arial;margin:0;padding:16px;background:#fff;color:#000} [data-block]{margin:0 0 32px}
            .k1{background-image:${seven('#000,#000', 'red,blue')}}
            .k2{background-image:${seven('rgba(255,255,255,.2),rgba(240,240,255,.2)', 'rgba(255,255,255,.2),rgba(250,240,230,.2)')}}
            .k3{color:#fff;background-image:${seven('rgba(0,0,0,.3),rgba(0,0,40,.3)', 'rgba(0,0,0,.3),rgba(30,0,0,.3)')}}
            .k4{background-image:${seven('rgba(0,0,0,.3),rgba(0,0,40,.3)', 'rgba(0,0,0,.3),rgba(30,0,0,.3)')}}
            .nest,.k5{background-image:linear-gradient(black,black)} .nest{padding:1px}
            .k6{background-image:${seven('black 100%,white 100%', 'black 100%,white 100%')}}
            .k7{background-image:linear-gradient(white,white)} .k8{background-image:linear-gradient(black,black)}`,
            `<main>
          <p data-block="k1" class="k1">Not free.</p>
          <p data-block="k2" class="k2">Readable.</p>
          <p data-block="k3" class="k3">Readable.</p>
          <p data-block="k4" class="k4">Not free.</p>
          <div class="nest"><div class="nest"><div class="nest"><div class="nest"><div class="nest"><div class="nest">
          <p data-block="k5" class="k5">Not free.</p></div></div></div></div></div></div>
          <p data-block="k6" class="k6">Not free.</p>
          <p data-block="k7" class="k7">Readable.</p>
          <p data-block="k8" class="k8">Not free.</p>
          </main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          measured.blocks.map(contrastSeen),
          [
            ['k1', 'low'],
            ['k2', 'read'],
            ['k3', 'read'],
            ['k4', 'low'],
            ['k5', 'low'],
            ['k6', 'low'],
            ['k7', 'read'],
            ['k8', 'low'],
          ],
          target,
        )
        const ratio = (id: string) => measured.blocks.find((b) => b.id === id)?.contrast.ratio ?? 0
        assert.ok(ratio('k1') < 1.2 && ratio('k4') < 2, `${target}: ${ratio('k1')} ${ratio('k4')}`)
        assert.ok(ratio('k2') >= 15 && ratio('k3') >= 10, `${target}: ${ratio('k2')} ${ratio('k3')}`)
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
      }
    },
  )

  // The security review of 1317562 (4201022306): white text on a white block drawn at `opacity: .5` read as an unknown
  // contrast (group_opacity), which the gate admits, while nothing of it shows; the owner's 4201111957: black on white
  // at `.1` reads 21:1 inside its group and below 1.3:1 as drawn; and 4201191051: the same inside a section at `.5`, a
  // group inside a group. Each paint and the text are drawn in the opacity groups around them, each group faded as one
  // over what lies below: the text over its ground in its group (q1, q2), over a white box beneath it there (q3), in
  // groups inside groups (q7–q9), and over a black box in two faded groups that do not hold it (q11) fail; black on
  // white at `.5`, faded text without a ground, a ground faded to `.9` and `.8` inside `.8` (q10) read; nine groups
  // inside one another are past what is composited and fail, never unknown (q12).
  it(
    'reads a text faded together with its ground as the groups are drawn: same colours and a faint group fail (#117)',
    { skip },
    async () => {
      const deep = '<div>'.repeat(9) + '<p>Deep.</p>' + '</div>'.repeat(9)
      const receipt = await captureHtml(
        job(
          page(
            `body{margin:0;background:#fff;font:24px/32px Arial} main{padding:0 16px} [data-block]{margin:0 0 16px}
             .q1{color:#fff;background:#fff;opacity:.5} .q2{color:#000;background:#fff;opacity:.1}
             .q3{position:relative;color:#fff;background:#fff;opacity:.5} .q3 i{position:absolute;inset:0;background:#fff}
             .q3 span{position:relative} .q4{color:#000;background:#fff;opacity:.5} .q5{color:#000;opacity:.6}
             .q6{color:#000;background:#fff;opacity:.9} .q7{opacity:.5} .q7 p{opacity:.8;background:#fff;color:#000;margin:0}
             .half{opacity:.5} .q8{color:#fff;background:#fff;opacity:.5} .q9{color:#000;background:#fff;opacity:.2}
             .most{opacity:.8} .q10{color:#000;background:#fff;opacity:.8} .q11{position:relative}
             .q11 .a,.q11 .b{opacity:.9} .q11 i{position:absolute;inset:0;background:#000}
             .q11 p{position:relative;color:#000;margin:0} .q12 div{opacity:.99} .q12 p{color:#000;margin:0}`,
            `<main><section data-section="s1">
            <p data-block="q1" class="q1">Not free.</p><p data-block="q2" class="q2">Not free.</p>
            <p data-block="q3" class="q3"><i></i><span>Not free.</span></p>
            <p data-block="q4" class="q4">Readable.</p><p data-block="q5" class="q5">Readable.</p>
            <p data-block="q6" class="q6">Readable.</p><div data-block="q7" class="q7"><p>Nested.</p></div>
            <div class="half"><p data-block="q8" class="q8">Not free.</p><p data-block="q9" class="q9">Not free.</p></div>
            <div class="most"><p data-block="q10" class="q10">Readable.</p></div>
            <div data-block="q11" class="q11"><div class="a"><div class="b"><i></i></div></div><p>Not free.</p></div>
            <div data-block="q12" class="q12">${deep}</div>
            </section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      // Each block's contrast, read between two ratios, and whether it fails: black at .8 inside .8 is drawn at .64
      // (#5c5c5c on white, q10), and at .8 inside .5 at .4 (#999, q7).
      const expected: [string, number, number, boolean][] = [
        ['q1', 0, 1.3, true],
        ['q2', 0, 1.3, true],
        ['q3', 0, 1.3, true],
        ['q4', 3.9, 4.2, false],
        ['q5', 5.5, 21, false],
        ['q6', 15, 21, false],
        ['q7', 2.7, 3, true],
        ['q8', 0, 1.3, true],
        ['q9', 0, 1.3, true],
        ['q10', 6.5, 7.3, false],
        ['q11', 0, 2, true],
      ]
      for (const target of ['w390-light', 'w1280-light']) {
        const blocks = receipt.targets.find((t) => t.id === target)?.page.blocks ?? []
        for (const [id, low, high, fails] of expected) {
          const block = blocks.find((b) => b.id === id)
          assert.ok(readBetween(block?.contrast, low, high), `${target} ${id}: ${JSON.stringify(block?.contrast)}`)
          assert.equal(block?.issues.includes('low_contrast'), fails, `${target} ${id}`)
        }
        const deepest = blocks.find((b) => b.id === 'q12')
        assert.deepEqual([deepest?.contrast.ratio, deepest?.contrast.detail], [null, 'group_opacity'], target)
        assert.ok(deepest?.issues.includes('low_contrast'), target)
        assert.equal(outcome(receipt, 'contrast', target), 'failed', target)
      }
      const sweep = String(receipt.checks.find((c) => c.name === 'widths_visible')?.detail)
      assert.match(sweep, /^at 320px: q1, q2, q3, q7, q8, q9, q11, q12;/u)
    },
  )

  it(
    'leaves a gradient unread where the canvas does not mix its colours: unknown, never read as another colour (#117)',
    { skip },
    async () => {
      const workDir = fs.mkdtempSync(path.join(SCRATCH, 'sophia-unmixed-'))
      const browser = await launchConfined({ workDir, env })
      try {
        const tab = await browser.context.newPage()
        await tab.setContent(
          page(
            `${BASE} p{font-size:24px;width:120px} .h{color:#fff;background:linear-gradient(90deg in hsl longer hue,red,blue)}
            .k{color:#fff;background:linear-gradient(90deg in hsl longer hue,#000,#00f)}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1" class="h">Not free.</p>
          <p data-block="b2">Plain.</p><p data-block="b3" class="k">From black.</p></section></main>`,
          ),
        )
        type Seen = { blocks: Parameters<typeof contrastSeen>[0][] }
        const script = pageScript({ maxListed: 20 })
        const mixing = 'color-mix(in ${pair.method},'
        assert.ok(script.includes(mixing), 'the kernel mixes through the canvas')
        const seen = async (source: string) => (await tab.evaluate<Seen>(source)).blocks.map(contrastSeen)
        // Black to blue the longer way passes cyan in Chromium's pixels (white on it 2.18): black's hue is 0 there.
        assert.deepEqual(await seen(script), [
          ['b1', 'low'],
          ['b2', 'read'],
          ['b3', 'low'],
        ])
        // A space the canvas does not take: the mix is refused, so the gradient is not read, and the text is unknown,
        // from black too, where no step between the stops would look darker or lighter than its neighbours.
        assert.deepEqual(await seen(script.replace(mixing, 'color-mix(in nowhere-${pair.method},')), [
          ['b1', 'background_image'],
          ['b2', 'read'],
          ['b3', 'background_image'],
        ])
      } finally {
        await browser.close()
        fs.rmSync(workDir, { recursive: true, force: true })
      }
    },
  )

  it(
    'leaves unread the paint beneath a text whose generated boxes the protocol does not place: unknown, never passed (#117)',
    { skip },
    async () => {
      // More generated boxes than the measure is given (4000): where each lies is not read, so a text over one is unknown.
      const marks = '<b class="m"></b>'.repeat(4001)
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} body{background:#fff} p{font-size:24px;color:#000}
            .m::before{content:"";display:inline-block;width:1px;height:1px;background:#eee}
            .gen{position:relative} .gen::before{content:"";position:absolute;inset:0;background:#000;z-index:-1}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Plain text.</p>
          <p data-block="b2" class="gen">Not free, over a black box.</p><div>${marks}</div></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const measured = receipt.targets.find((t) => t.id === target)!.page
        assert.deepEqual(
          measured.blocks.map(contrastSeen),
          [
            ['b1', 'read'],
            ['b2', 'background_elsewhere'],
          ],
          target,
        )
        assert.equal(outcome(receipt, 'contrast', target), 'unknown', target)
      }
    },
  )

  it(
    'holds text to the contrast floor of the size it is drawn at: scaled, zoomed or adjusted down, large text is not (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .big{font-size:24px;color:#888} .half{transform:scale(.5);transform-origin:left top}
            .zoomed{zoom:.5} .shrunk{scale:.5;transform-origin:left top} .adjusted{font-size-adjust:.4}
            .grown{font-size:12px;transform:scale(2);transform-origin:left top;margin-bottom:2em}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1" class="big">Large and grey.</p>
          <p data-block="b2" class="big half">Scaled down.</p><p data-block="b3" class="big zoomed">Zoomed down.</p>
          <p data-block="b4" class="big shrunk">Shrunk.</p><p data-block="b5" class="big adjusted">Adjusted.</p>
          <p data-block="b6" class="big grown">Grown.</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const blocks = receipt.targets.find((t) => t.id === target)!.page.blocks
        assert.deepEqual(
          blocks.map((b) => [b.id, b.contrast.large, b.issues.includes('low_contrast')]),
          [
            ['b1', true, false],
            ['b2', false, true],
            ['b3', false, true],
            ['b4', false, true],
            ['b5', false, true],
            ['b6', true, false],
          ],
          `${target}: about 3.4 to 1 is enough for large text only`,
        )
        assert.equal(outcome(receipt, 'contrast', target), 'failed')
      }
    },
  )

  it(
    'fails text outside the blocks set too small to read, by size, scale or squeeze; small print and a small mark pass (#117)',
    { skip },
    async () => {
      const receipt = await captureHtml(
        job(
          page(
            `${BASE} .tiny{font-size:3px} .shrunk{transform:scale(.2);transform-origin:left top}
            .squash{transform:scaleX(.15);transform-origin:left top} .print{font-size:11px} .dot{font-size:6px}`,
            `<main><section data-section="s1"><h2>Findings</h2><p data-block="b1">Text.</p>
          <h2 class="tiny">Host three is free</h2><h2 class="shrunk">Host three is free</h2>
          <h2 class="squash">Host three is free</h2><h3 class="print">Prices as listed in May</h3>
          <p class="dot">·</p></section></main>`,
          ),
        ),
        { env },
      )
      assert.equal(receipt.status, 'succeeded', JSON.stringify(receipt.error))
      for (const target of ['w390-light', 'w1280-light']) {
        const framing = receipt.targets.find((t) => t.id === target)!.page.framing
        assert.deepEqual(
          framing.map((m) => [m.id, m.issues.includes('no_visible_text')]),
          [
            ['text 1 h2', false],
            ['text 2 h2', true],
            ['text 3 h2', true],
            ['text 4 h2', true],
            ['text 5 h3', false],
          ],
          `${target}: the separator is not measured; small print is read`,
        )
        const detail = receipt.checks.find((c) => c.name === 'blocks_visible' && c.target === target)?.detail ?? ''
        assert.equal(detail, 'text 2 h2, text 3 h2, text 4 h2', target)
      }
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
