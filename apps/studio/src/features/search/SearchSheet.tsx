// Search the project (docs/plans/room-search.md): A13's `search`, in a sheet from the project's head (or `/`). Every
// hit shows its title, the record's own words and where it is from, and opens it: a report at its version (a section at
// its heading), a meeting's recap, the brief for a decision or a note, or the room's chat at a message. Under the
// vision flag (the proposal), or the search flag (A38, served: docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md).
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Goal, Membership, Snapshot } from '@sophia/contracts'
import { Icon, Tip } from '@sophia/ui'
import { searchProject } from '../../api/search.ts'
import { listMeetings, type SearchHit } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { Waiting } from '../../app/Waiting.tsx'
import { canInvite } from '../access/useAccess.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { useAskSophia } from '../studio/project-go.tsx'
import { useKnownNames } from '../studio/useKnownNames.ts'
import { DATE_WORDS } from '../updates/UpdatesView.tsx'
import { RecapSheet } from '../voice/MeetingRecap.tsx'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import type { View } from '../../app/route.ts'
import { GOAL, TASK } from '../resources/link.ts'
import type { GoalPlan } from '../work/GoalList.tsx'
import { useLedger, type NotesFor } from '../work/GoalNotes.tsx'
import { notesRead, withNotes } from '../work/goal-notes.ts'
import { HEALTH_LABEL, healthOf, withDue } from '../work/goals-glance.ts'
import { useGoalTargets } from '../work/GoalTargets.tsx'
import { todayOf } from '../work/goal-due.ts'
import { useNow } from '../../app/use-now.ts'
import { around, hitRunning, hitSource, localHits, marked, TASK_LEAD, type LocalHit } from './search-view.ts'

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
  /** A message (A38): the room's chat, at that message. */
  onMessage: (hit: SearchHit) => void
  /** The project's plans, when read: the search finds tasks in them (search-goals.md). */
  plans: Readonly<Record<string, GoalPlan>> | undefined
  /** The served board's first read is under way: zero found is no answer yet (search-honest.md). */
  boardReading: boolean
  /** A goal's or a task's sheet, in its view, named in the address. */
  onThere: (view: View, id: string, address: string) => void
}

/** What the search finds in what the Studio holds: the goals, the board's plans and its first read, the notes. */
function useLocal(props: Props, names: ReadonlyMap<string, string>): SheetProps['local'] {
  const { projectId, identity, snapshot, membership, onClose } = props
  const goToLocal = (hit: LocalHit) => {
    searchAnchor()?.focus()
    onClose()
    if (hit.kind === 'goal') props.onThere('goals', hit.id, GOAL)
    else props.onThere('work', hit.id, TASK)
  }
  return {
    goals: snapshot?.goals ?? [],
    plans: props.plans,
    reading: props.boardReading,
    // The goals' notes as Goals reads them (the same ledger query): a difficulty calls a goal to attention here too.
    notes: { projectId, identity, me: membership?.actorId ?? '', names, cursor: snapshot?.cursor },
    onLocal: goToLocal,
  }
}

/** The search's sheet, and the meeting a recap hit opens. */
export function ProjectSearch(props: Props) {
  const { projectId, identity, snapshot, membership, room, open, onClose, onBrief, onMessage } = props
  const names = useKnownNames(room)
  const local = useLocal(props, names)
  const [meeting, setMeeting] = useState<string | null>(null)
  const running = useRunning(projectId, identity.token, meeting)
  const viewer = useDocumentViewer()
  const askSophia = useAskSophia()
  // Nothing found: the words to Sophia instead, in a new conversation (docs/plans/ask-instead.md).
  const askInstead =
    askSophia &&
    ((q: string) => {
      onClose()
      askSophia(q)
    })
  const go = (hit: SearchHit) => {
    // What a hit opens gives the focus back to Search when it closes: the hit pressed goes with the sheet.
    searchAnchor()?.focus()
    onClose()
    if (hit.kind === 'recap') setMeeting(hit.meetingId ?? hit.id)
    else if (hit.kind === 'report' || hit.kind === 'report_section') {
      const at = hit.cite.anchor ? { section: hit.cite.anchor } : {}
      viewer?.open({ artifactId: hit.id, versionId: hit.cite.recordId, ...at })
    } else if (hit.kind === 'message') onMessage(hit)
    else onBrief()
  }
  return (
    <>
      {open && (
        <SearchSheet
          projectId={projectId}
          identity={identity}
          onClose={onClose}
          onHit={go}
          onAsk={askInstead}
          local={local}
        />
      )}
      {meeting && snapshot && (
        <RecapSheet
          projectId={projectId}
          identity={identity}
          meetingId={meeting}
          running={running}
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

/**
 * Whether the meeting a recap hit opens runs, read with the project's latest meeting as it opens: leaving from the
 * running one's sheet opens no second, and from a past one's, the recap of the call left.
 */
function useRunning(projectId: string, token: string, meeting: string | null): boolean | undefined {
  const latest = useQuery({
    queryKey: ['vision', 'meetings', projectId, 'running', meeting],
    queryFn: ({ signal }) => listMeetings(token, projectId, 1, signal),
    enabled: meeting !== null,
    gcTime: 0,
    retry: false,
  })
  return meeting === null ? undefined : hitRunning(meeting, latest.data?.meetings)
}

interface SheetProps {
  projectId: string
  identity: Identity
  onClose: () => void
  onHit: (hit: SearchHit) => void
  /** Nothing found: the words to Sophia instead; null where she can't be asked. */
  onAsk: ((q: string) => void) | null
  /** The goals and tasks the Studio holds, found first (search-goals.md); the board's first read, and the notes. */
  local: {
    goals: readonly Goal[]
    plans: Props['plans']
    reading: boolean
    notes: NotesFor
    onLocal: (hit: LocalHit) => void
  }
}

/**
 * The goals and tasks found, each goal's health as Goals reads it, with its latest note; until the notes are read, or
 * when they can't be, no health is said: one missing a difficulty is not (search-honest.md).
 */
function useFound(local: SheetProps['local'], q: string): LocalHit[] {
  const ledger = useLedger(local.notes)
  const known = notesRead(ledger) === 'read' || notesRead(ledger) === 'stale'
  const targets = useGoalTargets(local.notes)
  const today = todayOf(new Date(useNow(60 * 60_000)))
  const noted = withNotes(local.goals, local.plans, ledger.data?.entries ?? [], local.notes.me, local.notes.names)
  // A goal past its date reads as its row does (goal-overdue-health.md).
  const plans = withDue(local.goals, noted, targets, today)
  return localHits(local.goals, local.plans, q, (g) => (known ? HEALTH_LABEL[healthOf(g, plans[g.id])] : null))
}

function SearchSheet({ projectId, identity, onClose, onHit, onAsk, local }: SheetProps) {
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
  const found = useFound(local, q)
  const settledText = text.trim() === q
  return (
    <Sheet id="search-title" title="Search this project" onClose={onClose} returnTo={searchAnchor}>
      <input
        ref={field}
        type="search"
        className="search-field"
        aria-label="Search this project"
        placeholder="Goals, tasks, decisions, notes, reports, meetings"
        // The service searches at most 200 characters (A38).
        maxLength={200}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {asked && (
        <SearchOutcome
          search={search}
          q={q}
          hits={hits.length + found.length}
          typing={!settledText}
          boardReading={local.reading}
          onAsk={onAsk}
        />
      )}
      <ul className="search-hits" aria-label="Results">
        {/* The last query's hits are no answer to the next: none is offered under it until its own come. */}
        {settledText &&
          found.map((hit) => <Found key={`${hit.kind} ${hit.id}`} hit={hit} q={q} onOpen={local.onLocal} />)}
        {asked &&
          !search.isPlaceholderData &&
          settledText &&
          hits.map((hit, i) => <Hit key={`${String(i)} ${hit.kind} ${hit.id}`} hit={hit} q={q} onHit={onHit} />)}
      </ul>
      {asked && text.trim() === q && search.hasNextPage && !search.isPlaceholderData && <MoreResults search={search} />}
    </Sheet>
  )
}

type Search = ReturnType<typeof useSearch>

/**
 * Whether the search has its answer, and whether it is still being read: while the words settle, or the board's tasks
 * are still on their way, the count so far is no answer (search-honest.md).
 */
function stateOf(search: Search, typing: boolean, boardReading: boolean) {
  const fetching = (search.isFetching || search.isPending) && !search.isFetchingNextPage
  return {
    settled: search.isSuccess && !search.isPlaceholderData && !typing && !boardReading,
    reading: fetching || boardReading,
  }
}

/** What the search says about itself: under way, failed, or found nothing. */
function SearchOutcome(props: {
  search: ReturnType<typeof useSearch>
  q: string
  hits: number
  typing: boolean
  /** The board's first read under way: its tasks may still answer (search-honest.md). */
  boardReading: boolean
  onAsk: ((q: string) => void) | null
}) {
  const { search, q, hits } = props
  const { settled, reading } = stateOf(search, props.typing, props.boardReading)
  return (
    <>
      {/* Fetching, waiting for the network, or for the board: either way the list waits for this query. */}
      <Waiting words="Searching…" waiting={reading} />
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
      {settled && hits === 0 && <AskInstead q={q} onAsk={props.onAsk} />}
    </>
  )
}

/** Nothing found: the words to Sophia instead, where she can be asked (docs/plans/ask-instead.md). */
function AskInstead({ q, onAsk }: { q: string; onAsk: ((q: string) => void) | null }) {
  if (!onAsk) return null
  return (
    <button type="button" className="text-button search-ask" onClick={() => onAsk(q)}>
      Ask Sophia about “{q}”
    </button>
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

/** Words with the query's matches marked (search-goals.md). */
function Marked({ text, q }: { text: string; q: string }) {
  return <>{marked(text, q).map((piece, i) => (piece.mark ? <mark key={i}>{piece.text}</mark> : piece.text))}</>
}

/** A goal or a task the Studio holds: its title, the words that answered, what it is; a press to its sheet. */
function Found({ hit, q, onOpen }: { hit: LocalHit; q: string; onOpen: (hit: LocalHit) => void }) {
  return (
    <li>
      <button type="button" className="search-hit" data-kind={hit.kind} onClick={() => onOpen(hit)}>
        <span className="search-hit-title">
          <Marked text={hit.title} q={q} />
        </span>
        {hit.words && (
          <span className="search-hit-snippet">
            <Marked text={around(hit.words, q)} q={q} />
          </span>
        )}
        <span className="search-hit-source">
          {/* Found by who does it, the doer is marked as a title is (search-honest.md). */}
          {hit.doer === undefined ? (
            hit.source
          ) : (
            <>
              {TASK_LEAD}
              <Marked text={hit.doer} q={q} />
            </>
          )}
        </span>
      </button>
    </li>
  )
}

function Hit({ hit, q, onHit }: { hit: SearchHit; q: string; onHit: (hit: SearchHit) => void }) {
  return (
    <li>
      <button type="button" className="search-hit" onClick={() => onHit(hit)}>
        <span className="search-hit-title">
          <Marked text={hit.title} q={q} />
        </span>
        {/* A decision or a note is its own words: its title says them already; a long one is cut around the match. */}
        {hit.snippet !== hit.title && (
          <span className="search-hit-snippet">
            <Marked text={around(hit.snippet, q)} q={q} />
          </span>
        )}
        <span className="search-hit-source">{hitSource(hit, DATE_WORDS)}</span>
      </button>
    </li>
  )
}
