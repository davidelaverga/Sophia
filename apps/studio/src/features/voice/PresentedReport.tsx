// The report on the stage, where a shared screen goes (docs/plans/room-present.md): read-only, with its title, its
// version and who shows it, and the one way back (Stop following, or Stop showing for who shows it). Its text and
// sources are read as the viewer reads them: the same query keys, so a report open in the pane shares them. A citation
// opens its source in the viewer's Sources tab.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { reportLanguage } from '@sophia/report/language'
import { listReportSources } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { loadReportText } from '../artifacts/download.ts'
import { parseMarkdown } from '../artifacts/markdown.ts'
import { MarkdownView } from '../artifacts/MarkdownView.tsx'
import { focusLost, takeShownHere } from './focus-arrival.ts'

interface Props {
  version: ArtifactVersion
  identity: Identity
  /** Who shows it, as a sentence names them: "you", or their name. */
  by: string
  /** Stop following, or Stop showing. */
  action: ReactNode
}

/**
 * Where the focus goes as the report takes the stage: to it, when it was shown from this device (focus-arrival.ts), or
 * when the press that brought it (Follow) went with the card; never away from somewhere the person still is.
 */
function useFocusOnArrival() {
  const self = useRef<HTMLElement>(null)
  useEffect(() => {
    if (takeShownHere() || focusLost(document.activeElement)) self.current?.focus({ preventScroll: true })
  }, [])
  return self
}

function useShownText(version: ArtifactVersion, identity: Identity) {
  const text = useQuery({
    queryKey: ['report-text', version.sourceId, identity.name],
    queryFn: () => loadReportText(identity.token, version.sourceId, version.sourceHash),
    staleTime: Infinity,
  })
  const sources = useQuery({
    queryKey: ['report-sources', version.artifactId, version.id, identity.name],
    queryFn: () => listReportSources(identity.token, version.artifactId, version.id),
  })
  const listed = sources.data?.sources
  const parsed = useMemo(
    () => (text.data ? parseMarkdown(text.data.text, { citable: (listed ?? []).map((s) => s.sourceId) }) : null),
    [text.data, listed],
  )
  const language = useMemo(() => (text.data ? reportLanguage(text.data.text) : 'und'), [text.data])
  return { parsed, listed, language, failed: text.isError }
}

export function PresentedReport({ version, identity, by, action }: Props) {
  const { parsed, listed, language, failed } = useShownText(version, identity)
  const self = useFocusOnArrival()
  const viewer = useDocumentViewer()
  const title = version.title ?? 'Report'
  const cite = () => viewer?.open({ artifactId: version.artifactId, versionId: version.id, tab: 'sources' })
  return (
    <section ref={self} className="report-main" tabIndex={-1} aria-label={`${title}, shown by ${by}`}>
      <header className="report-main-head">
        <span className="report-main-name">
          <span className="report-main-title">{title}</span>
          <span className="report-main-meta">
            {version.versionNumber ? `v${String(version.versionNumber)} · ` : ''}Shown by {by}
          </span>
        </span>
        <span className="report-main-acts">{action}</span>
      </header>
      <div className="report-main-body">
        {parsed && <MarkdownView report={parsed} sources={listed} language={language} onCite={cite} />}
        {!parsed && <p className="muted">{failed ? 'The report couldn’t be loaded.' : 'Loading the report…'}</p>}
      </div>
    </section>
  )
}
