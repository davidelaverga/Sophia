import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { ArtifactVersion, ReportSourceList } from '@sophia/contracts'
import { renderReportPage } from '@sophia/report/page'
import { HashMismatch } from './download.ts'
import { downloadReportPage, type PageDeps } from './report-page.ts'

const CITED = '00000000-0000-4000-8000-0000000000c9'
const STRAY = '00000000-0000-4000-8000-0000000000ca'
const text = `# Fixture report\n\nIt cites one page [1](<${CITED}>) and names an id that is none of its sources [2](${STRAY}).\n`
const sha = createHash('sha256').update(text, 'utf8').digest('hex')

const version: ArtifactVersion = {
  id: 'v3',
  artifactId: 'a',
  projectId: 'p',
  parentId: null,
  sourceId: 's3',
  sourceHash: sha,
  state: 'stable',
  previewId: null,
  format: 'markdown',
  exportEditability: 'source_editable',
  title: 'Fixture report',
  versionNumber: 3,
  createdAt: '2026-10-02T16:41:07.000Z',
  limitations: ['Prices are from one day’s calculators.'],
}

const sources: ReportSourceList = {
  sources: [
    {
      sourceId: CITED,
      kind: 'web_read',
      provider: 'jina',
      title: null,
      url: 'https://example.org/fixture',
      coverage: 'partial',
      originHttpStatus: 200,
      limitations: ['The extractor returned the first part of the page.'],
      mime: 'text/markdown',
      retrievedAt: '2026-10-01T23:59:59.000Z',
    },
  ],
}

/** API and save doubles: the text loader serves `served` without checking it, so only the page's own check can. */
function doubles(served: string, listed: ArtifactVersion = version) {
  const saved: { blob: Blob; filename: string }[] = []
  const deps: PageDeps = {
    listVersions: () => Promise.resolve([listed]),
    loadText: () =>
      Promise.resolve({ text: served, filename: 'x.md', mime: 'text/markdown', byteLength: served.length }),
    listSources: () => Promise.resolve(sources),
    render: () => Promise.resolve(renderReportPage),
    save: (blob, filename) => saved.push({ blob, filename }),
  }
  return { deps, saved }
}

describe('a report’s HTML page is printed from its checked Markdown and saved, never stored', () => {
  it('saves the page printed with the viewer’s sources and what the version holds, named by the version', async () => {
    const { deps, saved } = doubles(text)
    const result = await downloadReportPage('t', 'a', 'v3', deps)
    assert.equal(result.filename, 'fixture-report-v3.html')
    assert.equal(saved.length, 1)
    assert.equal(saved[0]?.filename, 'fixture-report-v3.html')
    assert.equal(saved[0]?.blob.type, 'text/html;charset=utf-8')
    const html = (await saved[0]?.blob.text()) ?? ''
    const expected = renderReportPage({
      markdown: text,
      title: 'Fixture report',
      sources: [
        {
          id: CITED,
          title: 'example.org',
          url: 'https://example.org/fixture',
          kind: 'web_read',
          coverage: 'partial',
          retrievedAt: '2026-10-01T23:59:59.000Z',
          limitations: ['The extractor returned the first part of the page.'],
        },
      ],
      citable: [CITED],
      sha256: sha,
      versionNumber: 3,
      publishedAt: '2026-10-02T16:41:07.000Z',
      limitations: ['Prices are from one day’s calculators.'],
    })
    assert.equal(html, expected)
    assert.equal(result.byteLength, new TextEncoder().encode(expected).byteLength)
    // Numbered as the viewer numbers it: the link to an id outside the version's sources is its label.
    assert.match(
      html,
      /<a href="#cite-1" id="ref-1" class="weak" aria-label="Source 1, read in part">1<\/a><\/sup> and names an id that is none of its sources 2\./,
    )
    // What the version and its sources hold: when it was published, what was read and when, and its limitations.
    assert.match(html, /<dt>Published<\/dt><dd>2 October 2026<\/dd>/)
    assert.match(html, /<span class="status weak">Read in part<\/span> · retrieved 1 October 2026 · /)
    assert.match(html, /<li>The extractor returned the first part of the page\.<\/li>/)
    assert.match(
      html,
      /<p class="aside">As stated when this version was published\.<\/p><ul><li>Prices are from one day’s/,
    )
  })

  it('prints no date and says no limitations are stated when the version holds neither', async () => {
    const { createdAt: _createdAt, limitations: _limitations, ...bare } = version
    const { deps, saved } = doubles(text, bare)
    await downloadReportPage('t', 'a', 'v3', deps)
    const html = (await saved[0]?.blob.text()) ?? ''
    assert.doesNotMatch(html, /<dt>Published<\/dt>|id="report-limitations"/)
    assert.match(html, /<li class="note">This report states no limitations\.<\/li>/)
  })

  it('titles a report without a level-1 heading by its version, else as a report', async () => {
    const note = 'A short note with no heading.\n'
    const noteSha = createHash('sha256').update(note, 'utf8').digest('hex')
    const titled: ArtifactVersion = { ...version, sourceHash: noteSha, title: 'Quarterly hosts' }
    const { title: _title, ...untitled } = titled
    for (const [listed, shown] of [
      [titled, 'Quarterly hosts'],
      [untitled, 'Report'],
    ] as const) {
      const { deps, saved } = doubles(note, listed)
      await downloadReportPage('t', 'a', 'v3', deps)
      const html = (await saved[0]?.blob.text()) ?? ''
      assert.match(html, new RegExp(`<title>${shown}</title>`))
      assert.match(html, new RegExp(`<h1>${shown}</h1>`))
    }
  })

  it('refuses text that does not match the version’s record, and saves nothing', async () => {
    const { deps, saved } = doubles(`${text} `)
    await assert.rejects(downloadReportPage('t', 'a', 'v3', deps), HashMismatch)
    assert.equal(saved.length, 0)
  })

  it('says a version the list does not hold is not available, and saves nothing', async () => {
    const { deps, saved } = doubles(text)
    await assert.rejects(downloadReportPage('t', 'a', 'v9', deps), /This version isn’t available\./)
    assert.equal(saved.length, 0)
  })
})

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

describe('the legacy conversion’s callers (M75): each one mapped for SDD-01 to replace', () => {
  it('is reached only from the places HANDOFF_TO_SDD01.md lists, so no new offer of it goes unmapped', () => {
    const callers = Object.fromEntries(
      modules()
        .map((f) => [f, conversionUses(readFileSync(new URL(f, SRC), 'utf8'))] as const)
        .filter(([, uses]) => uses.length > 0),
    )
    // A change here is a change to docs/coordination/M75/HANDOFF_TO_SDD01.md §3, in the same commit.
    assert.deepEqual(callers, {
      'features/artifacts/DocumentPane.tsx': ['PageDownload'],
      'features/artifacts/KnowledgeReports.tsx': ['PageDownload'],
      'features/artifacts/PageDownload.tsx': ['report-page'],
      'features/artifacts/WorkCard.tsx': ['PageDownload'],
      'features/artifacts/report-page.ts': ['@sophia/report/page'],
      'features/conversation/NoticeCard.tsx': ['report-page'],
    })
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
