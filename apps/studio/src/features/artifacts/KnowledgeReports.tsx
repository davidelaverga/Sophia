// Knowledge (plan §2.9): the permanent home of the team's reports. M03 turns on the Reports tab only (the Sources and
// Decisions tabs come with their data). Cards from this project or every project the reader is in, filtered by
// project, format and words, newest first, a page at a time. A card names the report, its description (Sophia's, or
// a member's edit, attributed), its current version and what last changed; it opens in the viewer, where its history
// compares versions. Editors and admins edit a description against the revision they saw.
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ReportCard } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { listReports, type ReportFilter } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from './DocumentViewer.tsx'
import { SummaryEditor } from './SummaryEditor.tsx'
import './artifacts.css'

type Format = NonNullable<ReportFilter['format']>

interface Props {
  projectId: string
  identity: Identity
  /** Editors and admins of this project edit its reports' descriptions. */
  canEdit: boolean
}

const FORMATS: [Format, string][] = [
  ['any', 'Any format'],
  ['pdf', 'With PDF'],
  ['markdown_only', 'Markdown only'],
]

/** The words typed, once the person pauses. */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

function useReports(identity: Identity, filter: Omit<ReportFilter, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['reports', filter.project, filter.format, filter.q, identity.name],
    queryFn: ({ pageParam }) => listReports(identity.token, { ...filter, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function KnowledgeReports({ projectId, identity, canEdit }: Props) {
  const [project, setProject] = useState<string>(projectId)
  const [format, setFormat] = useState<Format>('any')
  const [typed, setTyped] = useState('')
  const q = useSettled(typed)
  const reports = useReports(identity, { project, format, q })
  const cards = reports.data?.pages.flatMap((p) => p.reports) ?? []
  const counts = reports.data?.pages[0]?.projects ?? []
  return (
    <section className="knowledge" aria-labelledby="knowledge-title">
      <header className="view-head">
        <h2 id="knowledge-title">Knowledge</h2>
        <span className="eyebrow">Reports</span>
      </header>
      <div className="knowledge-filters">
        <ProjectFilter projectId={projectId} project={project} counts={counts} onProject={setProject} />
        <div className="segmented" role="tablist" aria-label="Format">
          {FORMATS.map(([f, label]) => (
            <button key={f} type="button" role="tab" aria-selected={format === f} onClick={() => setFormat(f)}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="knowledge-search"
          placeholder="Search titles, descriptions and notes"
          aria-label="Search reports"
          value={typed}
          maxLength={200}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      <ReportCards
        cards={cards}
        state={reports.isPending ? 'loading' : reports.isError ? 'failed' : 'ready'}
        showProject={project === 'all'}
        editable={(card) => canEdit && card.projectId === projectId}
        identity={identity}
      />
      {reports.hasNextPage && (
        <button
          type="button"
          className="pill"
          onClick={() => void reports.fetchNextPage()}
          disabled={reports.isFetchingNextPage}
        >
          {reports.isFetchingNextPage ? 'Loading…' : 'More reports'}
        </button>
      )}
    </section>
  )
}

interface FilterProps {
  projectId: string
  project: string
  counts: readonly { projectId: string; title: string; count: number }[]
  onProject: (project: string) => void
}

/** This project, every project, or one of the others the reader is in (with its count, under the filters). */
function ProjectFilter({ projectId, project, counts, onProject }: FilterProps) {
  const others = project === 'all' || project !== projectId ? counts.filter((c) => c.projectId !== projectId) : []
  return (
    <div className="knowledge-projects" role="group" aria-label="Project">
      <button
        type="button"
        className="filter-chip"
        aria-pressed={project === projectId}
        onClick={() => onProject(projectId)}
      >
        This project
      </button>
      <button type="button" className="filter-chip" aria-pressed={project === 'all'} onClick={() => onProject('all')}>
        All projects
      </button>
      {others.map((c) => (
        <button
          key={c.projectId}
          type="button"
          className="filter-chip"
          aria-pressed={project === c.projectId}
          onClick={() => onProject(c.projectId)}
        >
          {c.title} <span className="count">{c.count}</span>
        </button>
      ))}
    </div>
  )
}

interface CardsProps {
  cards: readonly ReportCard[]
  state: 'loading' | 'failed' | 'ready'
  showProject: boolean
  editable: (card: ReportCard) => boolean
  identity: Identity
}

function ReportCards({ cards, state, showProject, editable, identity }: CardsProps) {
  if (state === 'loading') return <div className="goal skeleton" aria-busy="true" />
  if (state === 'failed') return <p className="muted">The reports couldn’t be loaded. Try again in a moment.</p>
  if (cards.length === 0) {
    return <p className="empty">No reports here yet. Ask Sophia to research something, by voice or in the chat.</p>
  }
  return (
    <ol className="report-cards">
      {cards.map((c) => (
        <ReportCardView
          key={c.artifactId}
          card={c}
          showProject={showProject}
          editable={editable(c)}
          identity={identity}
        />
      ))}
    </ol>
  )
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

interface CardProps {
  card: ReportCard
  showProject: boolean
  editable: boolean
  identity: Identity
}

function ReportCardView({ card, showProject, editable, identity }: CardProps) {
  const viewer = useDocumentViewer()
  const client = useQueryClient()
  const meta = [
    card.currentVersionNumber ? `v${card.currentVersionNumber}` : null,
    `${card.versionCount} ${card.versionCount === 1 ? 'version' : 'versions'}`,
    `updated ${dateOf(card.updatedAt)}`,
  ]
  return (
    <li className="report-card">
      <div className="report-card-head">
        <span className="report-tile" data-format="markdown" aria-hidden>
          MD
        </span>
        <button
          type="button"
          className="report-card-title"
          onClick={() => viewer?.open({ artifactId: card.artifactId })}
        >
          {card.title}
        </button>
        {card.formats.includes('pdf') && <Tag tone="rose">PDF</Tag>}
      </div>
      <p className="report-meta">
        {showProject && <span>{card.projectTitle} · </span>}
        {meta.filter(Boolean).join(' · ')}
      </p>
      <SummaryEditor
        card={card}
        identity={identity}
        editable={editable}
        onSaved={() => void client.invalidateQueries({ queryKey: ['reports'] })}
      />
      {card.latestChange.note && <p className="report-change">{card.latestChange.note}</p>}
      {card.latestChange.retained && <p className="muted">Kept: {card.latestChange.retained}</p>}
      <div className="control-row">
        <button
          type="button"
          className="text-button"
          onClick={() => viewer?.open({ artifactId: card.artifactId, tab: 'history' })}
        >
          History and changes
        </button>
      </div>
    </li>
  )
}
