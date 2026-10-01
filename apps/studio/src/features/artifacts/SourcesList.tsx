// The Sources tab (plan §2.8.3): the provenance truth of each source a version cites. What was read in full and
// what only as a snippet, by which route, and the origin's status only when it is known. Links open in a new tab
// with noopener. A number is the citation's in the document, so a superscript and its row match.
import type { ReportSource } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { safeHref } from './markdown.ts'
import { hostOf, sourceWords } from './report-view.ts'

interface Props {
  sources: readonly ReportSource[] | undefined
  /** Citation numbers by source id, from the document. */
  numbers: ReadonlyMap<string, number>
  failed: boolean
  /** The source a citation pointed at, to show first in view. */
  focus: string | null
}

export function SourcesList({ sources, numbers, failed, focus }: Props) {
  if (failed) return <p className="muted">The sources couldn’t be loaded. Try again in a moment.</p>
  if (!sources) return <p className="muted">Loading the sources…</p>
  if (sources.length === 0) return <p className="muted">This version cites no source you can read.</p>
  return (
    <ol className="sources">
      {sources.map((s) => (
        <SourceRow key={s.sourceId} source={s} n={numbers.get(s.sourceId) ?? null} focused={focus === s.sourceId} />
      ))}
    </ol>
  )
}

function SourceRow({ source, n, focused }: { source: ReportSource; n: number | null; focused: boolean }) {
  const words = sourceWords(source)
  const title = source.title ?? (source.url ? hostOf(source.url) : 'A source from the project')
  // Only a web address opens; anything else a provider reported stays text.
  const href = source.url ? safeHref(source.url) : null
  return (
    <li
      className="source"
      id={`source-${source.sourceId}`}
      data-focused={focused || undefined}
      ref={(el) => {
        if (focused) el?.scrollIntoView({ block: 'nearest' })
      }}
    >
      <span className="source-n" aria-label={n === null ? 'Not cited in the text' : `Citation ${n}`}>
        {n ?? '·'}
      </span>
      <div className="source-body">
        <p className="source-title">
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
          <Tag tone={words.tone}>{words.coverage}</Tag>
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
      </div>
    </li>
  )
}
