#!/usr/bin/env node
/**
 * SDD-01 G6, the controlled comparison's harness (pack 03 G6, pack 06 "Controlled design comparison").
 *
 *   node scripts/g6-control.mjs            measure the control arm and write docs/coordination/SDD-01/g6/
 *   node scripts/g6-control.mjs --check    measure again and fail if the recorded inputs or control pages moved
 *
 * The frozen inputs are M75's labelled fixture reports (apps/studio/fixtures/report-pages.ts): dense English with wide
 * tables and citations, Italian with long headings, addresses and limitations, Spanish narrative with uneven sections
 * and missing evidence, and the adversarial layout case. The control is #75's fixed editorial page (html-report-v2,
 * renderReportPage), allowed here as a test control only, never as a delivery path. Each control page is captured and
 * measured in the same confined capture kernel the designer's candidates go through (renderers/web/pdf/capture-html.mjs),
 * at the same targets.
 *
 * The native arm needs the real research route (a paid model, decision O-5) and Davide's approval, so this harness
 * records it as `not_run` with that reason: it never stands in for it, and no number is invented for it. The bundle
 * keeps each input's identity so the later run (Codex, under approval) designs exactly these inputs. Dimensions stay
 * separate (pack 06): no combined score. Raven is not run (pack 03 G6).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPORT_PAGES } from '../apps/studio/fixtures/report-pages.ts'
import { PAGE_PROFILE, renderReportPage } from '../packages/report/src/report-page.ts'
import { captureHtml } from '../renderers/web/pdf/capture-html.mjs'
import { REPO_ROOT } from './lib/common.mjs'

const OUT = join(REPO_ROOT, 'docs', 'coordination', 'SDD-01', 'g6')
const sha = (data) => createHash('sha256').update(data).digest('hex')

/** The comparison's inputs (pack 06), each one of M75's fixtures, with the role it plays. */
const CASES = [
  { id: 'dense-en', fixture: 'kitchen', role: 'Dense English comparison: wide tables, every element, citations' },
  { id: 'long-it', fixture: 'italiano', role: 'Italian: long headings and addresses, a partial source, limitations' },
  { id: 'narrative-es', fixture: 'espanol', role: 'Spanish narrative: uneven sections, one without evidence, an unread source' },
  { id: 'adversarial', fixture: 'stress', role: 'Adversarial layout: very long title and words, a 12-column table, CJK and Arabic' },
]

const NATIVE_NOT_RUN = {
  status: 'not_run',
  reason:
    'The native arm runs the designer and the reviewer on the real research route (gpt-6.1-sol, a paid model). ' +
    'It needs Davide’s scoped approval and Codex’s operation (binding map §11, O-5); no source-only run stands in for it.',
}

/** The dimensions pack 06 asks for, each recorded on its own; what this harness can measure for the control. */
const DIMENSIONS = [
  'content_fidelity',
  'readability',
  'visual_hierarchy',
  'consistency',
  'accessibility_interaction',
  'coverage',
  'correction_effort',
  'wall_time',
  'measured_cost',
]

/** One capture of a control page, in a world-readable scratch the render user can read. */
async function measure(html) {
  const root = mkdtempSync(join(tmpdir(), 'sophia-g6-src-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'sophia-g6-out-'))
  const scratchDir = mkdtempSync(join(tmpdir(), 'sophia-g6-scratch-'))
  for (const dir of [root, outputDir, scratchDir]) chmodSync(dir, 0o755)
  writeFileSync(join(root, 'index.html'), html, { mode: 0o644 })
  const env =
    process.getuid?.() === 0 ? { ...process.env, SOPHIA_RENDER_UID: process.env.SOPHIA_RENDER_UID ?? '65534' } : process.env
  try {
    const job = { sourceRoot: root, outputDir, scratchDir, entry: { path: 'index.html', sha256: sha(html) }, language: 'und', targets: ['w390-light', 'w1280-light'] }
    return await captureHtml(job, { env })
  } finally {
    for (const dir of [root, outputDir, scratchDir]) rmSync(dir, { recursive: true, force: true })
  }
}

/** What the control's capture measured, per target: overflow, captures, and the kernel's checks, as they came. */
function controlResult(receipt) {
  return {
    status: receipt.status === 'succeeded' ? 'measured' : 'failed',
    level: 'L1 (source fixture, confined Chromium; no model)',
    error: receipt.error,
    rendererSha256: receipt.renderer.rendererSha256,
    browser: receipt.renderer.browser,
    sandbox: receipt.sandbox ? { active: receipt.sandbox.active ?? null } : null,
    elapsedMs: receipt.elapsedMs,
    measuredCostUsd: 0,
    targets: receipt.targets.map((t) => ({
      id: t.id,
      pageWidth: t.page.width,
      pageHeight: t.page.height,
      overflowPx: t.page.overflowPx,
      overflowing: t.page.overflowing.length,
      sections: t.page.sections.length,
      blocks: t.page.blocks.length,
      truncated: t.coverage.truncated,
    })),
    captures: receipt.captures.map((c) => ({ name: c.name, sha256: c.sha256, width: c.width, height: c.height })),
    checks: receipt.checks.map((c) => ({ name: c.name, outcome: c.outcome, ...(c.detail ? { detail: c.detail } : {}) })),
    notMeasuredHere: DIMENSIONS.filter((d) => !['wall_time', 'measured_cost'].includes(d)),
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const inputs = []
  const results = []
  for (const c of CASES) {
    const input = REPORT_PAGES[c.fixture]
    const control = renderReportPage(input)
    inputs.push({
      id: c.id,
      role: c.role,
      fixture: `apps/studio/fixtures/report-pages.ts#REPORT_PAGES.${c.fixture}`,
      markdownSha256: sha(input.markdown),
      sources: input.sources.length,
      limitations: input.limitations ?? [],
      control: { profile: PAGE_PROFILE, pageSha256: sha(control), bytes: Buffer.byteLength(control) },
    })
    const receipt = await measure(control)
    results.push({ id: c.id, control: controlResult(receipt), native: NATIVE_NOT_RUN })
    process.stdout.write(`${c.id}: control ${receipt.status} in ${receipt.elapsedMs} ms\n`)
  }
  const inputsText = `${JSON.stringify({ schema: 'sophia.g6-inputs.v1', dimensions: DIMENSIONS, inputs }, null, 2)}\n`
  if (check) {
    const recorded = readFileSync(join(OUT, 'inputs.json'), 'utf8')
    if (recorded !== inputsText) throw new Error('docs/coordination/SDD-01/g6/inputs.json does not match the fixtures or the control')
    process.stdout.write('g6: the recorded inputs and control pages are reproduced\n')
    return
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'inputs.json'), inputsText)
  const run = { schema: 'sophia.g6-results.v1', host: `${process.platform}-${process.arch}`, node: process.version, results }
  writeFileSync(join(OUT, 'results.json'), `${JSON.stringify(run, null, 2)}\n`)
}

await main()
