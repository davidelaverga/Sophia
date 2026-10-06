// SDD-01 cutover guard. M75's browser conversion of a version's Markdown into an HTML page (html-report-v2,
// @sophia/report/page) was offered by four Studio callers (docs/coordination/M75/HANDOFF_TO_SDD01.md §3). SDD-01
// replaces every one with the stored, designed HTML rendition, checked against its hash before it is shown or saved,
// and removes the conversion's Studio seam (report-page.ts, PageDownload.tsx). This scan keeps it off the product path.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/** Studio's source, relative to `src/`: every module but the tests. */
const SRC = new URL('../../', import.meta.url)
const modules = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => f.split('\\').join('/'))
    .toSorted()

/** Every module a source names, however it does: import or re-export of any form, a dynamic or a bare import. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g

/**
 * Which of the legacy conversion's modules a specifier names: the printer (`@sophia/report/page`, or the package root,
 * which re-exports it), its download (`report-page`) or the controls that offer it (`PageDownload`); null for any other.
 */
function conversionModule(specifier: string): string | null {
  const path = specifier.replace(/\.tsx?$/, '')
  if (path === '@sophia/report/page' || path === '@sophia/report') return path
  return /\/(report-page|PageDownload)$/.exec(path)?.[1] ?? null
}

/** The conversion's modules a source reaches, sorted. */
const conversionUses = (source: string): string[] =>
  [...new Set([...source.matchAll(SPECIFIER)].map((m) => conversionModule(m[2] ?? '')))]
    .filter((use) => use !== null)
    .toSorted()

describe('the legacy conversion (M75) is off Studio’s product path (SDD-01 cutover)', () => {
  it('is reached from no Studio module: every HTML Studio offers is a stored, designed page', () => {
    const callers = Object.fromEntries(
      modules()
        .map((f) => [f, conversionUses(readFileSync(new URL(f, SRC), 'utf8'))] as const)
        .filter(([, uses]) => uses.length > 0),
    )
    // C-1..C-4 of docs/coordination/M75/HANDOFF_TO_SDD01.md §3 are replaced (docs/coordination/SDD-01/BINDING_MAP.md
    // §8). renderReportPage stays in @sophia/report for the G6 control harness only; a new caller here is a regression.
    assert.deepEqual(callers, {})
  })

  it('finds a caller however it reaches the conversion', () => {
    const found = {
      "import { downloadReportPage as save } from './report-page.ts'": ['report-page'],
      'import * as legacy from "../artifacts/report-page"': ['report-page'],
      "export { downloadReportPage } from './report-page.ts'": ['report-page'],
      "const m = await import('./report-page.ts')": ['report-page'],
      "import Legacy, { PageDownload } from './PageDownload'": ['PageDownload'],
      "import {\n  type Thing,\n  usePageDownload,\n} from './PageDownload.tsx'": ['PageDownload'],
      "import { renderReportPage } from '@sophia/report'": ['@sophia/report'],
      "import type { PageSource } from '@sophia/report/page'": ['@sophia/report/page'],
      "const page = import('@sophia/report/page')": ['@sophia/report/page'],
      "import './report-page.ts'": ['report-page'],
      "import { formatBytes } from './report-view.ts'": [],
      "import { reportLanguage } from '@sophia/report/language'": [],
      "import { x } from './report-page.test.ts'": [],
    }
    for (const [source, uses] of Object.entries(found)) assert.deepEqual(conversionUses(source), uses, source)
  })
})
