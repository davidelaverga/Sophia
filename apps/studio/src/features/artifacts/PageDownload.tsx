// "Download HTML page" (html-report-v2): a report version saved as one self-contained web page, printed here from its
// checked Markdown (report-page.ts). The pane's Document tab and each Knowledge card offer it; the work card has its
// own row (WorkCard). The status line says what was saved, or why nothing was.
import { downloadReportPage } from './report-page.ts'
import { formatBytes } from './report-view.ts'
import { useTransientStatus } from './useTransientStatus.ts'

/** A version's page download and the line that reports it. */
export function usePageDownload(token: string, artifactId: string, versionId: string) {
  const status = useTransientStatus()
  const download = async () => {
    try {
      const saved = await downloadReportPage(token, artifactId, versionId)
      status.show(`Downloading ${saved.filename} · ${formatBytes(saved.byteLength)}`)
    } catch (err: unknown) {
      status.show(err instanceof Error ? err.message : 'The download didn’t start. Try again.', true)
    }
  }
  return { status, download }
}

interface Props {
  token: string
  artifactId: string
  versionId: string
}

export function PageDownload({ token, artifactId, versionId }: Props) {
  const { status, download } = usePageDownload(token, artifactId, versionId)
  return (
    <div className="page-download">
      <button type="button" className="text-button" onClick={() => void download()}>
        Download HTML page
      </button>
      {/* There before it speaks: a live region added with its words is often not read. */}
      <p className="output-status" role="status" data-error={status.error || undefined}>
        {status.text}
      </p>
    </div>
  )
}
