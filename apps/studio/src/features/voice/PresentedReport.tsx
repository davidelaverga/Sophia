// The report on the stage, where a shared screen goes (docs/plans/room-present.md): read-only, with its title, its
// version and who shows it, and the one way back (Stop following, or Stop showing for who shows it). Its text and
// sources are read as the viewer reads them: the same query keys, so a report open in the pane shares them. A citation
// opens its source in the viewer's Sources tab.
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { reportLanguage } from '@sophia/report/language'
import { listReportSources } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { loadReportText } from '../artifacts/download.ts'
import { parseMarkdown } from '../artifacts/markdown.ts'
import { MarkdownView } from '../artifacts/MarkdownView.tsx'
import { focusLost, takeShownHere } from './focus-arrival.ts'
import { useVoiceTrail } from './useVoiceTrail.ts'
import { sectionIndex, type IndexEntry } from './voice-trail.ts'

interface Props {
  version: ArtifactVersion
  identity: Identity
  /** Who shows it, as a sentence names them: "you", or their name. */
  by: string
  /** Stop following, or Stop showing. */
  action: ReactNode
  /** What Sophia is saying now, from the room's captions (latestSpoken): lit in the text, her section marked. */
  spoken: string | null
}

/**
 * Where the focus goes as the report takes the stage: to it, when it was shown from this device (focus-arrival.ts), or
 * when the press that brought it (Follow) went with the card; never away from somewhere the person still is.
 */
function useFocusOnArrival(versionId: string) {
  const self = useRef<HTMLElement>(null)
  useEffect(() => {
    if (takeShownHere(versionId) || focusLost(document.activeElement)) self.current?.focus({ preventScroll: true })
    // As each version arrives: a newer one shown from here takes the focus as the first did.
  }, [versionId])
  return self
}

/**
 * The report's top headings in a row, with Sophia's mark on the section she is in. A section takes the reader there;
 * nobody's scroll moves for them.
 */
function SectionIndex(props: {
  entries: readonly IndexEntry[]
  here: string | null
  body: RefObject<HTMLDivElement | null>
}) {
  const { entries, here, body } = props
  if (entries.length < 2) return null
  // The reader goes there, focus and all, so a screen reader reads on from the section.
  const go = (entry: IndexEntry) => {
    const area = body.current
    const heading = area?.querySelectorAll<HTMLElement>(`.md > [id="md-${CSS.escape(entry.anchor)}"]`)[entry.occurrence]
    if (!area || !heading) return
    area.scrollTop += heading.getBoundingClientRect().top - area.getBoundingClientRect().top - 8
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
  return (
    <nav className="report-sections" aria-label="Sections">
      {entries.map((entry) => (
        <a
          key={entry.key}
          href={`#md-${entry.anchor}`}
          data-sophia={entry.key === here || undefined}
          onClick={(e) => {
            // A plain press goes there; a press meant for a new tab or window is the browser's.
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            go(entry)
          }}
        >
          {entry.text}
          {entry.key === here && <span className="sr-only"> (Sophia is here)</span>}
        </a>
      ))}
    </nav>
  )
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

export function PresentedReport({ version, identity, by, action, spoken }: Props) {
  const { parsed, listed, language, failed } = useShownText(version, identity)
  const self = useFocusOnArrival(version.id)
  const body = useRef<HTMLDivElement>(null)
  const entries = useMemo(() => (parsed ? sectionIndex(parsed.blocks) : []), [parsed])
  const anchors = useMemo(() => new Set(entries.map((e) => e.key)), [entries])
  const here = useVoiceTrail(body, spoken, parsed, anchors)
  const viewer = useDocumentViewer()
  const title = version.title ?? 'Report'
  // Stable, so a section marked anew doesn't rebuild every citation of the text.
  const { artifactId, id: versionId } = version
  const cite = useCallback(
    () => viewer?.open({ artifactId, versionId, tab: 'sources' }),
    [viewer, artifactId, versionId],
  )
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
      <SectionIndex entries={entries} here={here} body={body} />
      <div ref={body} className="report-main-body">
        {parsed && <MarkdownView report={parsed} sources={listed} language={language} onCite={cite} />}
        {!parsed && <p className="muted">{failed ? 'The report couldn’t be loaded.' : 'Loading the report…'}</p>}
      </div>
    </section>
  )
}
