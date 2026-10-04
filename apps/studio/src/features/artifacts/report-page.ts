// A report's HTML page (html-report-v1, @sophia/report/page), downloaded from Studio. Nothing is stored and nothing is
// shown here: the page is printed from the version's Markdown once its bytes match the version's record, with the
// sources this person may read (so it numbers its citations as the viewer does), and saved as a file. A mismatch
// saves nothing. The template loads with the first page printed, never with the Studio bundle, and only routes the
// deployed API already serves are read: the version list, the text and the version's sources.
import type { ArtifactVersion, ReportSourceList } from '@sophia/contracts'
import type { renderReportPage } from '@sophia/report/page'
import { listArtifactVersions, listReportSources } from '../../api/artifacts.ts'
import { HashMismatch, loadReportText, saveBlob, sha256Hex, utf8, type LoadedText } from './download.ts'
import { reportFilename, sourceTitle } from './report-view.ts'

/** What a page download reads and saves through; tests pass doubles. */
export interface PageDeps {
  listVersions: (token: string, artifactId: string) => Promise<readonly ArtifactVersion[]>
  loadText: (token: string, sourceId: string, sha256: string) => Promise<LoadedText>
  listSources: (token: string, artifactId: string, versionId: string) => Promise<ReportSourceList>
  render: () => Promise<typeof renderReportPage>
  save: (blob: Blob, filename: string) => void
}

const browserDeps: PageDeps = {
  listVersions: listArtifactVersions,
  loadText: loadReportText,
  listSources: listReportSources,
  render: () => import('@sophia/report/page').then((m) => m.renderReportPage),
  save: saveBlob,
}

/**
 * One version's HTML page, saved as `<slug>-v<N>.html`: its Markdown checked against the record again before it is
 * printed (HashMismatch otherwise, and nothing saved). Resolves with the filename and size it saved.
 */
export async function downloadReportPage(
  token: string,
  artifactId: string,
  versionId: string,
  deps: PageDeps = browserDeps,
): Promise<{ filename: string; byteLength: number }> {
  const version = (await deps.listVersions(token, artifactId)).find((v) => v.id === versionId)
  if (!version) throw new Error('This version isn’t available.')
  const text = await deps.loadText(token, version.sourceId, version.sourceHash)
  const { sources } = await deps.listSources(token, artifactId, version.id)
  if ((await sha256Hex(utf8(text.text))) !== version.sourceHash.toLowerCase()) throw new HashMismatch()
  const render = await deps.render()
  const html = render({
    markdown: text.text,
    title: version.title ?? 'Report',
    sources: sources.map((s) => ({ id: s.sourceId, title: sourceTitle(s), url: s.url })),
    citable: sources.map((s) => s.sourceId),
    sha256: version.sourceHash,
    versionNumber: version.versionNumber ?? null,
  })
  const bytes = utf8(html)
  const filename = reportFilename(version.title ?? 'report', version.versionNumber ?? null, 'html')
  deps.save(new Blob([bytes], { type: 'text/html;charset=utf-8' }), filename)
  return { filename, byteLength: bytes.byteLength }
}
