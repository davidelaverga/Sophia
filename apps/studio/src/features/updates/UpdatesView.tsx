// Updates (docs/plans/room-updates.md): what changed since this person last looked (A13's digest, built as A12's recap)
// and the project's meetings, each opening its recap in the same sheet as on leaving. Shown under the vision flag, where
// the fixture pages answer, or the attention flag, where A34 serves the digest: the meetings only under the vision flag
// (ProjectShell decides); elsewhere Updates is still «Coming» (PendingView).
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { Button, Icon, Menu, MenuItem, Segmented, usePopover, type SegmentedItem } from '@sophia/ui'
import { ApiError } from '../../api/client.ts'
import { getSince, listMeetings, markSeen, type MeetingSummary, type Since } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { canInvite } from '../access/useAccess.ts'
import { closedDoor } from '../studio/project-door.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { RecapPart, RecapSheet, type LineGo } from '../voice/MeetingRecap.tsx'
import { namers, recapSections } from '../voice/recap-view.ts'
import {
  digestLead,
  kindCounts,
  KINDS,
  lengthShares,
  meetingRow,
  narrowRecords,
  peopleOf,
  shownSince,
  sinceOrder,
  type SinceRead,
  type DateWords,
  type Kind,
  type Narrowing,
} from './updates-view.ts'
import { ago, clock, dayOf, sameDay } from '../../app/time-words.ts'
import { useArrival, useProjectGo } from '../studio/project-go.tsx'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  membership: Membership | undefined
  /** The call this person is in, if any: joining or leaving starts or ends a meeting, so the list is read again. */
  inCall: boolean
  /** Whether the meetings and their recaps (A12, not served) show under the digest. */
  meetings: boolean
}

/** Updates: the digest first, then the meetings. Both are read again as the project's feed moves. */
/** Whether the meeting runs, as the list says it; undefined when the list no longer holds it. */
const runningOf = (meetings: readonly MeetingSummary[], id: string): boolean | undefined => {
  const row = meetings.find((m) => m.id === id)
  return row ? row.endedAt === null : undefined
}

export function UpdatesView({ projectId, identity, snapshot, membership, inCall, meetings }: Props) {
  const me = membership?.actorId ?? ''
  return (
    <section className="updates" aria-labelledby="updates-title">
      <h2 id="updates-title">Updates</h2>
      {snapshot && <SinceYouLooked projectId={projectId} identity={identity} cursor={snapshot.cursor} me={me} />}
      {snapshot && meetings && (
        <Meetings
          projectId={projectId}
          identity={identity}
          cursor={`${snapshot.cursor}:${inCall ? 'in' : 'out'}`}
          sheet={{ roomId: snapshot.room.id, title: snapshot.title, me, editor: canInvite(membership) }}
        />
      )}
    </section>
  )
}

const NO_NAMES: ReadonlyMap<string, string> = new Map()

interface SinceProps {
  projectId: string
  identity: Identity
  cursor: string
  me: string
}

const sinceRefusedKey = (projectId: string) => ['vision', 'since-refused', projectId]

/**
 * When this person's own read of the project's window was last refused (401, 403), in this page's order (`sinceOrder`,
 * taken when the refusal is seen; never the clock); 0 when never. Kept in the account's query cache (one per account,
 * app/account-cache.ts), so another view and back keeps it (R-C2-READ-01).
 */
function useSinceRefused(projectId: string): number {
  const client = useQueryClient()
  useQuery({
    queryKey: sinceRefusedKey(projectId),
    queryFn: () => 0,
    initialData: 0,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  // Read from the cache as it changes (its listeners are told at once), not as the query's observer is told a task
  // later: a refusal its read keeps (sinceRefusedNow) hides the window before the next frame (R-391-UPDATES-01).
  const refusedAt = useSyncExternalStore(
    useCallback((changed: () => void) => client.getQueryCache().subscribe(changed), [client]),
    () => client.getQueryData<number>(sinceRefusedKey(projectId)) ?? 0,
  )
  // A refusal is kept once, as its own read learns it (the query function, sinceRefusedNow): never again from a cached
  // error a remount observes, which would come after the remount's own recovery read and hide its answer (#391 4305867088).
  return refusedAt
}

/** A refusal of this person's own read, kept as it is learnt: later than every read set out before it. */
const sinceRefusedNow = (client: QueryClient, projectId: string) =>
  client.setQueryData<number>(sinceRefusedKey(projectId), (at = 0) => Math.max(at, sinceOrder()))

/** «Since you last looked»: the digest, and Mark as seen. */
function SinceYouLooked({ projectId, identity, cursor, me }: SinceProps) {
  const client = useQueryClient()
  const since = useQuery({
    queryKey: ['vision', 'since', projectId, cursor],
    queryFn: async ({ signal }): Promise<SinceRead> => {
      const readFrom = sinceOrder()
      // Refused (401, 403, known from the status alone): kept at once, before the query tells this view (R-391-UPDATES-01).
      const window = await getSince(identity.token, projectId, signal).catch((error: unknown) => {
        if (closedDoor(error)) sinceRefusedNow(client, projectId)
        throw error
      })
      return { window, readFrom }
    },
    placeholderData: keepPreviousData,
    retry: false,
  })
  const refusedAt = useSinceRefused(projectId)
  const shown = shownSince(since.data, since.isError && closedDoor(since.error), refusedAt)
  return (
    <section className="updates-part" aria-labelledby="since-title">
      <h3 id="since-title">Since you last looked</h3>
      <Waiting words="Reading what changed…" waiting={since.isPending} />
      {since.isError && shown === undefined && (
        <p className="sheet-lead" role="alert">
          What changed couldn’t be read.{' '}
          <button type="button" className="text-button" onClick={() => void since.refetch()}>
            Try again
          </button>
        </p>
      )}
      {since.isError && shown !== undefined && <p className="sheet-lead">This may be out of date.</p>}
      {/* Keyed by its range: what a Mark as seen said goes with the digest it was pressed on. */}
      {shown && (
        // Keyed by both ends of the range: one seen elsewhere moves its start, and a narrowing to a kind or a person no
        // longer in it starts afresh (Codex on #239).
        <DigestBody
          key={`${shown.fromSequence ?? 'start'}-${shown.toSequence}`}
          digest={shown}
          projectId={projectId}
          identity={identity}
          me={me}
        />
      )}
    </section>
  )
}

/** Where a line goes: the brief in the Studio view, or the task in Tasks (project-go.tsx); none outside a shell. */
function useLineGo(): LineGo | undefined {
  const go = useProjectGo()
  return go
    ? { brief: () => go({ view: 'studio', brief: true }), task: (taskId) => go({ view: 'work', taskId }) }
    : undefined
}

function DigestBody({ digest, projectId, identity, me }: Omit<SinceProps, 'cursor'> & { digest: Since }) {
  const nameOf = namers(me, NO_NAMES, digest.names).shown
  const [by, setBy] = useState<Narrowing>({ kind: 'all', person: null })
  const shown = narrowRecords(digest, by)
  // Since you last looked, when is half the news: each decided and kept line says it (updates-when.md).
  const sections = recapSections(shown, nameOf, false, (at) => ago(at, Date.now()))
  const any = recapSections(digest, nameOf).length > 0
  // A window with more after it is marked seen even with nothing listed in it: that is how the next one is read (A34).
  const markable = any || digest.more
  const lead = digestLead(digest)
  const seen = useMarkSeen(projectId, identity)
  const go = useLineGo()
  return (
    <>
      {lead && <p className="sheet-lead">{lead}</p>}
      {any && <Narrow digest={digest} me={me} by={by} onChange={setBy} />}
      {sections.map((s) => (
        <RecapPart key={s.title} section={s} records={shown} level={4} go={go} />
      ))}
      {any && sections.length === 0 && (
        <p className="sheet-lead">Nothing of that kind, or by them, since you last looked.</p>
      )}
      {markable && (
        <div className="recap-acts">
          <button
            type="button"
            className="pill"
            aria-disabled={seen.isPending || undefined}
            onClick={() => !seen.isPending && seen.mutate(digest.toSequence)}
          >
            Mark as seen
          </button>
          <span className="recap-said" role="status">
            {seen.isError ? seenWords(seen.error) : ''}
          </span>
        </div>
      )}
    </>
  )
}

interface NarrowProps {
  digest: Since
  me: string
  by: Narrowing
  onChange: (by: Narrowing) => void
}

/** The row over the digest: its kinds with their counts (only the kinds with lines), and who. */
function Narrow({ digest, me, by, onChange }: NarrowProps) {
  const counts = kindCounts(digest)
  const countOf = (id: Kind) => (id === 'all' ? 0 : counts[id])
  const items: SegmentedItem<Kind>[] = KINDS.filter((k) => k.id === 'all' || countOf(k.id) > 0).map((k) =>
    k.id === 'all' ? { id: k.id, label: k.label } : { id: k.id, label: k.label, count: countOf(k.id) },
  )
  return (
    <div className="updates-narrow">
      <Segmented
        role="radiogroup"
        label="Kind"
        size="sm"
        items={items}
        value={by.kind}
        onChange={(kind) => onChange({ ...by, kind })}
      />
      <PersonMenu
        people={peopleOf(digest, digest.names, me)}
        value={by.person}
        onChange={(person) => onChange({ ...by, person })}
      />
    </div>
  )
}

interface PersonProps {
  people: readonly { id: string; name: string }[]
  value: string | null
  onChange: (id: string | null) => void
}

/** «By everyone», or by one of those who appear: a small press, a menu of radio items. */
function PersonMenu({ people, value, onChange }: PersonProps) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const pick = (id: string | null) => () => {
    menu.opener.current?.focus()
    setOpen(false)
    onChange(id)
  }
  if (people.length === 0) return null
  const current = people.find((p) => p.id === value)?.name ?? 'everyone'
  return (
    <div ref={menu.wrap} className="updates-person">
      <Button
        ref={menu.opener}
        kind="pill"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        By {current}
        <Icon name="chevron" />
      </Button>
      {open && (
        <Menu popover={menu} label="By whom" align="start">
          <MenuItem checked={value === null} onClick={pick(null)}>
            Everyone
          </MenuItem>
          {people.map((p) => (
            <MenuItem key={p.id} checked={value === p.id} onClick={pick(p.id)}>
              {p.name}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}

/** What a Mark as seen that didn't go through says: the API's own words, else (no reply, or none it wrote) ours. */
const seenWords = (error: Error) =>
  (error instanceof ApiError && error.status > 0 && !error.code.startsWith('http_') && error.message) ||
  'Not marked. Try again.'

/** Writes what was seen (never lowered, so a second press is harmless), then reads the digest again. */
function useMarkSeen(projectId: string, identity: Identity) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sequence: string) => markSeen(identity.token, projectId, sequence),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vision', 'since', projectId] }),
  })
}

/** How the Studio says a date (app/time-words.ts): «Oct 4», «15:00», the year only when it isn't this one. */
export const DATE_WORDS: DateWords = {
  day: (at) => dayOf(at, Date.now()),
  time: clock,
  today: (at) => sameDay(at, new Date()),
}

interface MeetingsProps {
  projectId: string
  identity: Identity
  cursor: string
  sheet: { roomId: string; title: string; me: string; editor: boolean }
}

/** The project's meetings, newest first; a row opens its recap. */
function Meetings({ projectId, identity, cursor, sheet }: MeetingsProps) {
  const [open, setOpen] = useState<string | null>(null)
  // A meeting asked for from elsewhere (a report's source, project-go.tsx): its recap opens.
  useArrival('updates', (to) => setOpen(to.meetingId))
  const list = useQuery({
    queryKey: ['vision', 'meetings', projectId, cursor],
    queryFn: ({ signal }) => listMeetings(identity.token, projectId, 10, signal),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const meetings = list.data?.meetings ?? []
  const shares = lengthShares(meetings)
  return (
    <section className="updates-part" aria-labelledby="meetings-title">
      <h3 id="meetings-title">Meetings</h3>
      <Waiting words="Reading the meetings…" waiting={list.isPending} />
      {list.isError && list.data === undefined && (
        <p className="sheet-lead" role="alert">
          The meetings couldn’t be read.{' '}
          <button type="button" className="text-button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      )}
      {list.isError && list.data !== undefined && <p className="sheet-lead">This may be out of date.</p>}
      {list.isSuccess && meetings.length === 0 && (
        <p className="sheet-lead">No meetings yet. One starts when someone joins the room.</p>
      )}
      <ul className="meeting-rows">
        {meetings.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="meeting-row"
              data-running={m.endedAt === null || undefined}
              onClick={() => setOpen(m.id)}
            >
              {meetingRow(m, DATE_WORDS)}
              {/* How long it lasted, against the longest: a bar the eye compares; the running one a live dot. */}
              <span className="meeting-bar" aria-hidden style={{ '--share': String(shares.get(m.id) ?? 0) }} />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <RecapSheet
          projectId={projectId}
          identity={identity}
          meetingId={open}
          running={runningOf(meetings, open)}
          {...sheet}
          names={NO_NAMES}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
