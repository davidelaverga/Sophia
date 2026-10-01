// A report's History tab (plan §2.9): every published version, newest first, with what changed and what was kept
// (the notes) and the chips the service's facts give (never the notes). Any two versions compare by section, computed
// here from their checked texts; nothing about the comparison is stored.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { loadReportText } from './download.ts'
import { compareSections, type SectionChange } from './markdown.ts'
import { factChips } from './report-view.ts'

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
  if (!versions) return <p className="muted">Loading the history…</p>
  return (
    <>
      <ol className="report-history">
        {versions.map((v, i) => {
          const older = versions[i + 1]
          return (
            <VersionRow
              key={v.id}
              version={v}
              shown={v.id === shown || (shown === null && i === 0)}
              onShow={() => onShow(v.id)}
              onCompare={older ? () => setCompare({ older, newer: v }) : null}
            />
          )
        })}
      </ol>
      {compare && <Comparison identity={identity} {...compare} onClose={() => setCompare(null)} />}
    </>
  )
}

interface RowProps {
  version: ArtifactVersion
  shown: boolean
  onShow: () => void
  onCompare: (() => void) | null
}

function VersionRow({ version, shown, onShow, onCompare }: RowProps) {
  return (
    <li className="report-version" data-shown={shown || undefined}>
      <div className="report-version-head">
        <strong>v{version.versionNumber ?? '?'}</strong>
        <span className="muted">{dateOf(version.createdAt)}</span>
        {version.state === 'stable' && <Tag tone="teal">Current</Tag>}
      </div>
      {version.changeNote && <p>{version.changeNote}</p>}
      {version.retainedNote && <p className="muted">Kept: {version.retainedNote}</p>}
      <div className="report-chips">
        {factChips(version).map((c) => (
          <Tag key={c.label} tone={c.tone}>
            {c.label}
          </Tag>
        ))}
      </div>
      <div className="control-row">
        {!shown && (
          <button type="button" className="text-button" onClick={onShow}>
            Show this version
          </button>
        )}
        {onCompare && (
          <button type="button" className="text-button" onClick={onCompare}>
            Compare with the version before
          </button>
        )}
      </div>
    </li>
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
  return (
    <section className="report-compare" aria-label={`v${older.versionNumber ?? '?'} to v${newer.versionNumber ?? '?'}`}>
      <header>
        <h3>
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
  return (
    <dl className="report-compare-lists">
      {LISTS.filter(([k]) => change[k].length > 0).map(([k, label]) => (
        <div key={k}>
          <dt>{label}</dt>
          <dd>{change[k].join(', ')}</dd>
        </div>
      ))}
      {change.conclusionChanged && (
        <div>
          <dt>Conclusion</dt>
          <dd>Changed</dd>
        </div>
      )}
    </dl>
  )
}
