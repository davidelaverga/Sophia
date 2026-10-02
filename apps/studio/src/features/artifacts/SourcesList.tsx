// The Sources tab (plan §2.8.3): the provenance truth of each source a version cites. What was read in full and
// what only as a snippet, by which route, and the origin's status only when it is known. Links open in a new tab
// with noopener. A number is the citation's in the document, so a superscript and its row match.
import { useEffect, useRef } from 'react'
import type { ReportSource } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { safeHref } from './markdown.ts'
import { focusFree, hostOf, sourceWords } from './report-view.ts'

interface Props {
  sources: readonly ReportSource[] | undefined
  /** Citation numbers by source id, from the document. */
  numbers: ReadonlyMap<string, number>
  failed: boolean
  /** The source a citation pointed at: shown and focused once, when the citation was followed. */
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

function SourceRow({ source, n, focused }: { source: ReportSource; n: number | null; focused: boolean }) {
  const words = sourceWords(source)
  const title = source.title ?? (source.url ? hostOf(source.url) : 'A source from the project')
  // Only a web address opens; anything else a provider reported stays text.
  const href = source.url ? safeHref(source.url) : null
  const row = useFocusedRow(focused)
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
