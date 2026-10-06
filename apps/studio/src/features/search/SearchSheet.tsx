// Search the project (docs/plans/room-search.md): A13's `search`, in a sheet from the project's head (or `/`). Every
// hit shows its title, the record's own words and where it is from, and opens it: a report at its version (a section
// at its heading), a meeting's recap, or the brief for a decision or a note. Only under the vision flag.
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { searchProject, type SearchHit } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { Waiting } from '../../app/Waiting.tsx'
import { canInvite } from '../access/useAccess.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { useKnownNames } from '../studio/useKnownNames.ts'
import { DATE_WORDS } from '../updates/UpdatesView.tsx'
import { RecapSheet } from '../voice/MeetingRecap.tsx'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { hitSource } from './search-view.ts'

/** The head's Search: where the focus goes back to from the search and from what it opened. */
const searchAnchor = () => document.querySelector<HTMLElement>('[data-search-anchor]')

/** Fewer characters than this search nothing: one letter matches everything. */
const MIN_QUERY = 2

/** The magnifier in the project's head. */
export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="round has-tip" aria-label="Search" data-search-anchor onClick={onClick}>
      <Icon name="search" />
      <Tip label="Search this project" keys="/" side="bottom" align="end" />
    </button>
  )
}

/** The query, once typing has paused: each keystroke doesn't ask the API. */
function useSettled(text: string, ms = 250): string {
  const [settled, setSettled] = useState(text)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), ms)
    return () => clearTimeout(timer)
  }, [text, ms])
  return settled
}

function useSearch(projectId: string, token: string, q: string) {
  return useInfiniteQuery({
    queryKey: ['vision', 'search', projectId, q],
    queryFn: ({ pageParam, signal }) => searchProject(token, projectId, q, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: q.length >= MIN_QUERY,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  membership: Membership | undefined
  room: ProjectRoom
  /** The search is open (the head's Search, or `/`). */
  open: boolean
  onClose: () => void
  /** A decision or a note: the room, with the brief open. */
  onBrief: () => void
}

/** The search's sheet, and the meeting a recap hit opens. */
export function ProjectSearch(props: Props) {
  const { projectId, identity, snapshot, membership, room, open, onClose, onBrief } = props
  const [meeting, setMeeting] = useState<string | null>(null)
  const names = useKnownNames(room)
  const viewer = useDocumentViewer()
  const go = (hit: SearchHit) => {
    // What a hit opens gives the focus back to Search when it closes: the hit pressed goes with the sheet.
    searchAnchor()?.focus()
    onClose()
    if (hit.kind === 'recap') setMeeting(hit.meetingId ?? hit.id)
    else if (hit.kind === 'report' || hit.kind === 'report_section') {
      const at = hit.cite.anchor ? { section: hit.cite.anchor } : {}
      viewer?.open({ artifactId: hit.id, versionId: hit.cite.recordId, ...at })
    } else onBrief()
  }
  return (
    <>
      {open && <SearchSheet projectId={projectId} identity={identity} onClose={onClose} onHit={go} />}
      {meeting && snapshot && (
        <RecapSheet
          projectId={projectId}
          identity={identity}
          meetingId={meeting}
          roomId={snapshot.room.id}
          title={snapshot.title}
          me={membership?.actorId ?? ''}
          editor={canInvite(membership)}
          names={names}
          onClose={() => setMeeting(null)}
        />
      )}
    </>
  )
}

interface SheetProps {
  projectId: string
  identity: Identity
  onClose: () => void
  onHit: (hit: SearchHit) => void
}

function SearchSheet({ projectId, identity, onClose, onHit }: SheetProps) {
  const [text, setText] = useState('')
  const q = useSettled(text.trim())
  const search = useSearch(projectId, identity.token, q)
  const field = useRef<HTMLInputElement>(null)
  // After the sheet's own focus as it opens: the search is typed into.
  useEffect(() => {
    requestAnimationFrame(() => field.current?.focus())
  }, [])
  const hits = search.data?.pages.flatMap((p) => p.hits) ?? []
  const asked = q.length >= MIN_QUERY
  return (
    <Sheet id="search-title" title="Search this project" onClose={onClose} returnTo={searchAnchor}>
      <input
        ref={field}
        type="search"
        className="search-field"
        aria-label="Search this project"
        placeholder="Decisions, notes, reports, meetings"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {asked && <SearchOutcome search={search} q={q} hits={hits.length} />}
      <ul className="search-hits" aria-label="Results">
        {/* The last query's hits are no answer to the next: none is offered under it until its own come. */}
        {asked &&
          !search.isPlaceholderData &&
          hits.map((hit, i) => <Hit key={`${String(i)} ${hit.kind} ${hit.id}`} hit={hit} onHit={onHit} />)}
      </ul>
      {asked && search.hasNextPage && !search.isPlaceholderData && <MoreResults search={search} />}
    </Sheet>
  )
}

/** What the search says about itself: under way, failed, or found nothing. */
function SearchOutcome({ search, q, hits }: { search: ReturnType<typeof useSearch>; q: string; hits: number }) {
  const settled = search.isSuccess && !search.isPlaceholderData
  return (
    <>
      {/* Fetching, or waiting for the network to come back: either way the list waits for this query. */}
      <Waiting words="Searching…" waiting={(search.isFetching || search.isPending) && !search.isFetchingNextPage} />
      {search.isError && (
        <p className="sheet-lead" role="alert">
          The search couldn’t be read.{' '}
          <button type="button" className="text-button" onClick={() => void search.refetch()}>
            Try again
          </button>
        </p>
      )}
      {/* While the next query is read, the last one's answer is no answer to it. */}
      <p className={settled && hits === 0 ? 'sheet-lead' : 'sr-only'} role="status">
        {settled && (hits === 0 ? `Nothing in this project matches “${q}”.` : `${String(hits)} found.`)}
      </p>
    </>
  )
}

/** The next page; the press keeps its focus while it is read. */
function MoreResults({ search }: { search: ReturnType<typeof useSearch> }) {
  const reading = search.isFetchingNextPage
  return (
    <button
      type="button"
      className="text-button"
      aria-disabled={reading || undefined}
      onClick={() => !reading && void search.fetchNextPage()}
    >
      More results
    </button>
  )
}

function Hit({ hit, onHit }: { hit: SearchHit; onHit: (hit: SearchHit) => void }) {
  return (
    <li>
      <button type="button" className="search-hit" onClick={() => onHit(hit)}>
        <span className="search-hit-title">{hit.title}</span>
        {/* A decision or a note is its own words: its title says them already. */}
        {hit.snippet !== hit.title && <span className="search-hit-snippet">{hit.snippet}</span>}
        <span className="search-hit-source">{hitSource(hit, DATE_WORDS)}</span>
      </button>
    </li>
  )
}
