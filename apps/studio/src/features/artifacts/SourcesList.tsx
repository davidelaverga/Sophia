// The Sources tab (plan §2.8.3): the provenance truth of each source a version cites. What was read in full and
// what only as a snippet, by which route, and the origin's status only when it is known. Links open in a new tab
// with noopener. A number is the citation's in the document, so a superscript and its row match. A project source says
// where it came from where A19 (proposed) gives it, and a conversation or a meeting goes there (source-origins.ts). A
// project source's own text opens in place, as plain text, when the version is known and it is plain text or Markdown
// (CitedText, getCitedReportText).
import { useEffect, useId, useRef } from 'react'
import type { ArtifactVersion, ReportSource } from '@sophia/contracts'
import { ReadNote, Tag } from '@sophia/ui'
import type { SourceOrigin } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useProjectGo } from '../studio/project-go.tsx'
import { CitedText, type CitingVersion } from './CitedText.tsx'
import { useDocumentViewer } from './viewer-context.ts'
import { safeHref } from './markdown.ts'
import { focusFree, hostOf, sourceTitle, sourceWords } from './report-view.ts'
import { arrivalOf, originWords, useSourceOrigins } from './source-origins.ts'

interface Props {
  sources: readonly ReportSource[] | undefined
  /** Citation numbers by source id, from the document. */
  numbers: ReadonlyMap<string, number>
  failed: boolean
  /** The source a citation pointed at: shown and focused once, when the citation was followed. */
  focus: string | null
  /** Where the project's sources came from, by source id (A19); none where it isn't read. */
  origins?: ReadonlyMap<string, SourceOrigin>
  /** Goes to a conversation's or meeting's origin; null where nothing can take the reader there. */
  onOrigin?: ((origin: SourceOrigin) => void) | null
  /** The version that cites them, where a project source's text can be opened; none, and no row offers it. */
  citing?: CitingVersion | undefined
}

/** The Sources tab in the viewer: the version's sources, and where its project's own came from. */
export function SourcesTab(
  props: Omit<Props, 'origins' | 'onOrigin'> & { identity: Identity; version: ArtifactVersion | undefined },
) {
  const { identity, version, ...list } = props
  const origins = useSourceOrigins(identity, version?.artifactId, version?.id)
  const viewer = useDocumentViewer()
  const go = useProjectGo()
  const onOrigin =
    viewer && go
      ? (origin: SourceOrigin) => {
          const to = arrivalOf(origin)
          if (to) viewer.leaveFor(() => go(to))
        }
      : null
  const citing = version && { identity, artifactId: version.artifactId, versionId: version.id }
  return <SourcesList {...list} origins={origins} onOrigin={onOrigin} citing={citing} />
}

export function SourcesList({ sources, numbers, failed, focus, origins, onOrigin = null, citing }: Props) {
  if (failed) return <p className="muted">The sources couldn’t be loaded. Try again in a moment.</p>
  if (!sources) return <ReadNote>Loading the sources…</ReadNote>
  if (sources.length === 0) return <p className="muted">This version cites no source you can read.</p>
  return (
    <ol className="sources">
      {sources.map((s) => (
        <SourceRow
          key={s.sourceId}
          source={s}
          n={numbers.get(s.sourceId) ?? null}
          focused={focus === s.sourceId}
          origin={s.kind === 'input' ? origins?.get(s.sourceId) : undefined}
          onOrigin={onOrigin}
          citing={s.kind === 'input' ? citing : undefined}
        />
      ))}
    </ol>
  )
}

/** A row's number, said: the number is drawn for the eye. */
const citationWords = (n: number | null) => (n === null ? 'Not cited in the text' : `Citation ${n}`)

/**
 * The row a citation pointed at takes the focus once, as it comes into view: the citation's button went with the
 * Document tab, and the reader goes on from the source they asked for. Never again on a later render, and never from
 * a control the person moved to while the sources were coming (M03-RF-0022): the row is shown, and the focus stays.
 */
function useFocusedRow(focused: boolean) {
  const row = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (!focused) return
    row.current?.scrollIntoView({ block: 'nearest' })
    if (focusFree(document.activeElement, document.body)) row.current?.focus({ preventScroll: true })
  }, [focused])
  return row
}

/** Where a project source came from, in words; a conversation or a meeting is a press that goes there. */
function OriginLine({ origin, onOrigin }: { origin: SourceOrigin; onOrigin: ((o: SourceOrigin) => void) | null }) {
  const { words, goes } = originWords(origin)
  if (goes && onOrigin) {
    return (
      <button type="button" className="text-button source-origin" onClick={() => onOrigin(origin)}>
        {words}
      </button>
    )
  }
  return <span className="source-origin">{words}</span>
}

interface RowProps {
  source: ReportSource
  n: number | null
  focused: boolean
  origin: SourceOrigin | undefined
  onOrigin: ((origin: SourceOrigin) => void) | null
  /** Where this project source's text can be opened; undefined for any other source. */
  citing: CitingVersion | undefined
}

function SourceRow({ source, n, focused, origin, onOrigin, citing }: RowProps) {
  const words = sourceWords(source)
  const title = sourceTitle(source)
  // Only a web address opens; anything else a provider reported stays text.
  const href = source.url ? safeHref(source.url) : null
  const row = useFocusedRow(focused)
  const titleId = useId()
  return (
    <li
      ref={row}
      className="source"
      id={`source-${source.sourceId}`}
      data-focused={focused || undefined}
      tabIndex={focused ? -1 : undefined}
    >
      <span className="source-n" aria-hidden>
        {n ?? '·'}
      </span>
      <span className="sr-only">{citationWords(n)}</span>
      <div className="source-body">
        <p className="source-title" id={titleId}>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {title}
            </a>
          ) : (
            title
          )}
        </p>
        {source.url && <p className="source-url">{hostOf(source.url)}</p>}
        <div className="source-tags">
          {origin ? <OriginLine origin={origin} onOrigin={onOrigin} /> : <Tag tone={words.tone}>{words.coverage}</Tag>}
          {words.route && <span className="muted">{words.route}</span>}
          {words.origin && <span className="muted">{words.origin}</span>}
        </div>
        {source.limitations.length > 0 && (
          <ul className="source-limits">
            {source.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        {citing && (
          <CitedText
            key={source.sourceId}
            citing={citing}
            sourceId={source.sourceId}
            n={n}
            titleId={titleId}
            mime={source.mime}
          />
        )}
      </div>
    </li>
  )
}
