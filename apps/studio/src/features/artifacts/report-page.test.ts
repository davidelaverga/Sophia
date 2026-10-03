import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
}

const sources: ReportSourceList = {
  sources: [
    {
      sourceId: CITED,
      kind: 'web_read',
      provider: 'jina',
      title: null,
      url: 'https://example.org/fixture',
      coverage: 'complete',
      originHttpStatus: 200,
      limitations: [],
      mime: 'text/markdown',
      retrievedAt: null,
    },
  ],
}

/** API and save doubles: the text loader serves `served` without checking it, so only the page's own check can. */
function doubles(served: string) {
  const saved: { blob: Blob; filename: string }[] = []
  const deps: PageDeps = {
    listVersions: () => Promise.resolve([version]),
    loadText: () =>
      Promise.resolve({ text: served, filename: 'x.md', mime: 'text/markdown', byteLength: served.length }),
    listSources: () => Promise.resolve(sources),
    render: () => Promise.resolve(renderReportPage),
    save: (blob, filename) => saved.push({ blob, filename }),
  }
  return { deps, saved }
}

describe('a report’s HTML page is printed from its checked Markdown and saved, never stored', () => {
  it('saves the page printed with the viewer’s sources, named by the version', async () => {
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
      sources: [{ id: CITED, title: 'example.org', url: 'https://example.org/fixture' }],
      citable: [CITED],
      sha256: sha,
      versionNumber: 3,
    })
    assert.equal(html, expected)
    assert.equal(result.byteLength, new TextEncoder().encode(expected).byteLength)
    // Numbered as the viewer numbers it: the link to an id outside the version's sources is its label.
    assert.match(html, /<a href="#cite-1">\[1\]<\/a><\/sup> and names an id that is none of its sources 2\./)
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
