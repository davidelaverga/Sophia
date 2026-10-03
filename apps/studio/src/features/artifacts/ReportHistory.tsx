// A report's History tab (plan §2.9): every published version, newest first. Each says first what the service's facts
// show changed (factsLine, then its chips: never from the notes), then what the research worker said changed and was
// kept, as Sophia's notes. Where the facts hold what the notes may leave out (a section removed, a source dropped), the
// notes fold under the facts; notes the service wrote from the facts are not repeated, and a first version's note, most
// often the service's own "First version", is not credited to Sophia (CX-0026). Any two versions compare by section,
// computed here from their checked texts; nothing about the comparison is stored. A pressed control keeps the focus:
// Show this version turns into "On screen" in place, a comparison takes the focus as it opens and hands it back to its
// Compare.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { loadReportText } from './download.ts'
import { compareSections, type SectionChange } from './markdown.ts'
import { conclusionTopic, factChips, factsLine, notesShown } from './report-view.ts'

interface Props {
  identity: Identity
  versions: readonly ArtifactVersion[] | undefined
  /** The version on screen. */
  shown: string | null
  onShow: (versionId: string) => void
}

const dateOf = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export function ReportHistory({ identity, versions, shown, onShow }: Props) {
  const [compare, setCompare] = useState<{ older: ArtifactVersion; newer: ArtifactVersion } | null>(null)
  const list = useRef<HTMLOListElement>(null)
  if (!versions) return <p className="muted">Loading the history…</p>
  const close = (newer: string) => {
    setCompare(null)
    list.current?.querySelector<HTMLElement>(`[data-compare="${newer}"]`)?.focus()
  }
  const numbers = new Map(versions.map((v) => [v.id, v.versionNumber ?? null]))
  return (
    <>
      <ol ref={list} className="report-history">
        {versions.map((v, i) => {
          const older = versions[i + 1]
          return (
            <VersionRow
              key={v.id}
              version={v}
              before={v.parentId === null ? null : (numbers.get(v.parentId) ?? null)}
              shown={v.id === shown || (shown === null && i === 0)}
              onShow={() => onShow(v.id)}
              onCompare={older ? () => setCompare({ older, newer: v }) : null}
            />
          )
        })}
      </ol>
      {compare && <Comparison identity={identity} {...compare} onClose={() => close(compare.newer.id)} />}
    </>
  )
}

interface RowProps {
  version: ArtifactVersion
  /** The number of the version it replaced, which its facts compare with; null when the list does not hold it. */
  before: number | null
  shown: boolean
  onShow: () => void
  onCompare: (() => void) | null
}

function VersionRow({ version, before, shown, onShow, onCompare }: RowProps) {
  const facts = factsLine(version, before)
  const chips = factChips(version)
  return (
    <li className="report-version" data-shown={shown || undefined}>
      <div className="report-version-head">
        <strong>v{version.versionNumber ?? '?'}</strong>
        <span className="muted">{dateOf(version.createdAt)}</span>
        {version.state === 'stable' && <Tag tone="teal">Current</Tag>}
      </div>
      {facts && <p className="report-facts">{facts}</p>}
      {chips.length > 0 && (
        <div className="report-chips">
          {chips.map((c) => (
            <Tag key={c.label} tone={c.tone}>
              {c.label}
            </Tag>
          ))}
        </div>
      )}
      <VersionNotes version={version} />
      <div className="control-row">
        {/* Pressed, it stays where it is as "On screen": aria-disabled, never disabled or removed under the focus. */}
        <button
          type="button"
          className="text-button"
          aria-disabled={shown || undefined}
          onClick={shown ? undefined : onShow}
        >
          {shown ? 'On screen' : 'Show this version'}
        </button>
        {onCompare && (
          <button type="button" className="text-button" data-compare={version.id} onClick={onCompare}>
            Compare with the version before
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * What the research worker said about a version, as it submitted it: Sophia's notes, after the facts. Folded when the
 * facts hold what the notes may leave out, so the facts are read first; not shown when the service wrote them from the
 * facts, or on a first version (notesShown).
 */
function VersionNotes({ version }: { version: ArtifactVersion }) {
  const shown = notesShown(version)
  if (shown === null) return null
  const notes = (
    <>
      {version.changeNote && <p>{version.changeNote}</p>}
      {version.retainedNote && <p className="muted">Kept: {version.retainedNote}</p>}
    </>
  )
  if (shown === 'folded') {
    return (
      <details className="report-notes">
        <summary>Sophia’s notes</summary>
        {notes}
      </details>
    )
  }
  return (
    <div className="report-notes">
      <p className="report-notes-by">Sophia’s notes</p>
      {notes}
    </div>
  )
}

interface CompareProps {
  identity: Identity
  older: ArtifactVersion
  newer: ArtifactVersion
  onClose: () => void
}

function Comparison({ identity, older, newer, onClose }: CompareProps) {
  const client = useQueryClient()
  const text = (v: ArtifactVersion) =>
    client.fetchQuery({
      queryKey: ['report-text', v.sourceId, identity.name],
      queryFn: () => loadReportText(identity.token, v.sourceId, v.sourceHash),
      staleTime: Infinity,
    })
  const change = useQuery({
    queryKey: ['report-compare', older.id, newer.id, identity.name],
    queryFn: async () => compareSections((await text(older)).text, (await text(newer)).text),
    staleTime: Infinity,
  })
  // Opened under the whole list: the focus goes to it, so the comparison is where the reader is.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.scrollIntoView({ block: 'nearest' })
    heading.current?.focus({ preventScroll: true })
  }, [older.id, newer.id])
  return (
    <section className="report-compare" aria-label={`v${older.versionNumber ?? '?'} to v${newer.versionNumber ?? '?'}`}>
      <header>
        <h3 ref={heading} tabIndex={-1}>
          v{older.versionNumber ?? '?'} → v{newer.versionNumber ?? '?'}, by section
        </h3>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </header>
      {change.isError && <p className="muted">The versions couldn’t be compared. Try again in a moment.</p>}
      {change.isPending && <p className="muted">Comparing…</p>}
      {change.data && <ChangeLists change={change.data} />}
    </section>
  )
}

const LISTS: [keyof Omit<SectionChange, 'conclusionChanged'>, string][] = [
  ['added', 'Added'],
  ['revised', 'Revised'],
  ['removed', 'Removed'],
  ['unchanged', 'Unchanged'],
]

function ChangeLists({ change }: { change: SectionChange }) {
  const topic = conclusionTopic(change)
  return (
    <dl className="report-compare-lists">
      {LISTS.filter(([k]) => change[k].length > 0).map(([k, label]) => (
        <div key={k}>
          <dt>{label}</dt>
          <dd>{change[k].join(', ')}</dd>
        </div>
      ))}
      {topic && (
        <div>
          <dt>{topic}</dt>
          <dd>Changed</dd>
        </div>
      )}
    </dl>
  )
}
