// Knowledge (plan §2.9): the permanent home of the team's reports. M03 turns on the Reports tab only (the Sources and
// Decisions tabs come with their data). Cards from this project or every project the reader is in, filtered by
// project, format and words, newest first, a page at a time. A card names the report, its description (Sophia's, or
// a member's edit, attributed) and its current version; it opens in the viewer, where its history says what changed,
// facts first, and compares versions. A current version with a designed HTML page (SDD-01) has an HTML tag that opens
// that page, whose Download saves the same bytes; nothing is printed from the Markdown. A card carries no facts,
// so it shows none of the notes on what changed: alone, a note that the rest was kept read as true when it was not
// (CX-0026). Editors and admins edit a description against the revision they saw.
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReportCard } from '@sophia/contracts'
import { listReports, type ReportFilter } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentViewer } from './DocumentViewer.tsx'
import { formatsOffered } from './report-view.ts'
import { metaOf } from './report-cover.ts'
import { ReportCover } from './ReportCover.tsx'
import { SummaryEditor } from './SummaryEditor.tsx'
import './artifacts.css'

type Format = NonNullable<ReportFilter['format']>

interface Props {
  projectId: string
  identity: Identity
  /** Editors and admins of this project edit its reports' descriptions. */
  canEdit: boolean
  /** What members carried in from Personal (the vision flag's), shown with this project's reports only. */
  carriedIn?: ReactNode
}

const FORMATS: [Format, string][] = [
  ['any', 'Any format'],
  ['pdf', 'With PDF'],
  ['markdown_only', 'Without PDF'],
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

/**
 * More reports: the press keeps its focus while the page loads (aria-disabled, never disabled), then the focus goes to
 * the first card the page brought, so neither the list growing under the button nor the button going after the last
 * page drops it to the page.
 */
function useMore(reports: ReturnType<typeof useReports>, count: number) {
  const list = useRef<HTMLElement>(null)
  const asked = useRef<number | null>(null)
  useEffect(() => {
    const from = asked.current
    if (from === null || count <= from) return
    asked.current = null
    // Only while the focus is still the press's (on More reports, or nowhere once it went): never taken from elsewhere.
    const at = document.activeElement
    if (at !== null && at !== document.body && !at.matches('.knowledge-more')) return
    list.current?.querySelectorAll<HTMLElement>('.report-card-title')[from]?.focus()
  }, [count])
  const more = () => {
    if (reports.isFetchingNextPage) return
    asked.current = count
    void reports.fetchNextPage()
  }
  return { list, more }
}

/** The filters: project, format and words. Clearing them goes back to every report, the focus on the search field. */
function useFilters(projectId: string) {
  const [project, setProject] = useState<string>(projectId)
  const [format, setFormat] = useState<Format>('any')
  const [typed, setTyped] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const q = useSettled(typed)
  const clear = () => {
    setFormat('any')
    setTyped('')
    // The button that cleared them goes with the empty list.
    search.current?.focus()
  }
  const filtered = format !== 'any' || q.trim() !== ''
  return { project, setProject, format, setFormat, typed, setTyped, q, search, clear, filtered }
}

/**
 * Whether the format filter shows. While a new filter's reports load there are no cards to judge by, so the filter that
 * showed stays: the group, and a press's focus in it, never goes and comes back under the person.
 */
function useFormatOffer(format: Format, cards: readonly ReportCard[], loading: boolean): boolean {
  const [shown, setShown] = useState(false)
  const offered = formatsOffered(format, cards)
  const now = loading ? shown || offered : offered
  if (now !== shown) setShown(now)
  return now
}

export function KnowledgeReports({ projectId, identity, canEdit, carriedIn = null }: Props) {
  const f = useFilters(projectId)
  const reports = useReports(identity, { project: f.project, format: f.format, q: f.q })
  const cards = reports.data?.pages.flatMap((p) => p.reports) ?? []
  const counts = reports.data?.pages[0]?.projects ?? []
  const { list, more } = useMore(reports, cards.length)
  const formats = useFormatOffer(f.format, cards, reports.isPending)
  return (
    <section ref={list} className="knowledge" aria-labelledby="knowledge-title">
      <header className="view-head">
        <h2 id="knowledge-title">Knowledge</h2>
        <span className="eyebrow">Reports</span>
      </header>
      <div className="knowledge-filters">
        <ProjectFilter projectId={projectId} project={f.project} counts={counts} onProject={f.setProject} />
        {formats && <FormatFilter format={f.format} onFormat={f.setFormat} />}
        <input
          ref={f.search}
          type="search"
          className="knowledge-search"
          placeholder="Search titles, descriptions and notes"
          aria-label="Search reports"
          value={f.typed}
          maxLength={200}
          onChange={(e) => f.setTyped(e.target.value)}
        />
      </div>
      <ReportCards
        cards={cards}
        state={reports.isPending ? 'loading' : reports.isError ? 'failed' : 'ready'}
        showProject={f.project === 'all'}
        editable={(card) => canEdit && card.projectId === projectId}
        identity={identity}
        filtered={f.filtered}
        onClear={f.clear}
      />
      {reports.hasNextPage && <MoreReports loading={reports.isFetchingNextPage} onMore={more} />}
      {f.project === projectId && carriedIn}
    </section>
  )
}

function MoreReports({ loading, onMore }: { loading: boolean; onMore: () => void }) {
  return (
    <button type="button" className="pill knowledge-more" onClick={onMore} aria-disabled={loading || undefined}>
      {loading ? 'Loading…' : 'More reports'}
    </button>
  )
}

/** A filter, not tabs: no panel of its own, so pressed buttons, as the project filter beside it. */
function FormatFilter({ format, onFormat }: { format: Format; onFormat: (format: Format) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Format">
      {FORMATS.map(([value, label]) => (
        <button key={value} type="button" aria-pressed={format === value} onClick={() => onFormat(value)}>
          {label}
        </button>
      ))}
    </div>
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
    <div className="segmented" role="group" aria-label="Project">
      <button type="button" aria-pressed={project === projectId} onClick={() => onProject(projectId)}>
        This project
      </button>
      <button type="button" aria-pressed={project === 'all'} onClick={() => onProject('all')}>
        All projects
      </button>
      {others.map((c) => (
        <button
          key={c.projectId}
          type="button"
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
  /** A format or words narrow the list: an empty one says so, with the way back, never "no reports yet". */
  filtered: boolean
  onClear: () => void
}

function ReportCards({ cards, state, showProject, editable, identity, filtered, onClear }: CardsProps) {
  if (state === 'loading') return <div className="goal skeleton" aria-busy="true" />
  if (state === 'failed') return <p className="muted">The reports couldn’t be loaded. Try again in a moment.</p>
  if (cards.length === 0 && filtered) {
    return (
      <p className="empty">
        No reports match these filters.{' '}
        <button type="button" className="text-button" onClick={onClear}>
          Clear the filters
        </button>
      </p>
    )
  }
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

interface CardProps {
  card: ReportCard
  showProject: boolean
  editable: boolean
  identity: Identity
}

/**
 * A report as a tile: its cover, then its title, one meta line and its description. The title's press takes the whole
 * tile; over the cover of a designed page, a press of its own opens that page. Edit and History keep their own.
 */
function ReportCardView({ card, showProject, editable, identity }: CardProps) {
  const viewer = useDocumentViewer()
  const client = useQueryClient()
  // A designed report opens as the page its card shows, from its title and its History as from its cover.
  const as = card.formats.includes('html') ? { format: 'html' as const } : {}
  return (
    <li className="report-card">
      <div className="report-card-cover">
        <ReportCover card={card} identity={identity} />
        {card.formats.includes('html') && (
          <button
            type="button"
            className="report-cover-open"
            aria-label={`Open ${card.title}, HTML page`}
            onClick={() =>
              viewer?.open({ artifactId: card.artifactId, versionId: card.currentVersionId, format: 'html' })
            }
          >
            <span className="report-cover-tag">HTML</span>
          </button>
        )}
      </div>
      <button
        type="button"
        className="report-card-title"
        onClick={() => viewer?.open({ artifactId: card.artifactId, ...as })}
      >
        {card.title}
      </button>
      <p className="report-meta">{metaOf(card, showProject, Date.now())}</p>
      <SummaryEditor
        card={card}
        identity={identity}
        editable={editable}
        onSaved={() => void client.invalidateQueries({ queryKey: ['reports'] })}
      >
        {/* Its visible word is in its name: «History and changes» to a screen reader. */}
        <button
          type="button"
          className="text-button"
          aria-label="History and changes"
          onClick={() => viewer?.open({ artifactId: card.artifactId, tab: 'history', ...as })}
        >
          History
        </button>
      </SummaryEditor>
    </li>
  )
}
