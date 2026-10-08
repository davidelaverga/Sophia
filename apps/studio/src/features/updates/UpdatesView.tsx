// Updates (docs/plans/room-updates.md): what changed since this person last looked (A13's digest, built as A12's recap)
// and the project's meetings, each opening its recap in the same sheet as on leaving. Shown only under the vision flag,
// where the fixture pages answer; elsewhere Updates is still «Coming» (PendingView).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { getSince, listMeetings, markSeen, type Digest, type MeetingSummary } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { canInvite } from '../access/useAccess.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { RecapPart, RecapSheet } from '../voice/MeetingRecap.tsx'
import { namers, recapSections } from '../voice/recap-view.ts'
import { digestLead, lengthShares, meetingRow, type DateWords } from './updates-view.ts'
import { clock, dayOf, sameDay } from '../../app/time-words.ts'
import { useArrival } from '../studio/project-go.tsx'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  membership: Membership | undefined
  /** The call this person is in, if any: joining or leaving starts or ends a meeting, so the list is read again. */
  inCall: boolean
}

/** Updates: the digest first, then the meetings. Both are read again as the project's feed moves. */
/** Whether the meeting runs, as the list says it; undefined when the list no longer holds it. */
const runningOf = (meetings: readonly MeetingSummary[], id: string): boolean | undefined => {
  const row = meetings.find((m) => m.id === id)
  return row ? row.endedAt === null : undefined
}

export function UpdatesView({ projectId, identity, snapshot, membership, inCall }: Props) {
  const me = membership?.actorId ?? ''
  return (
    <section className="updates" aria-labelledby="updates-title">
      <h2 id="updates-title">Updates</h2>
      {snapshot && <SinceYouLooked projectId={projectId} identity={identity} cursor={snapshot.cursor} me={me} />}
      {snapshot && (
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

/** «Since you last looked»: the digest, and Mark as seen. */
function SinceYouLooked({ projectId, identity, cursor, me }: SinceProps) {
  const since = useQuery({
    queryKey: ['vision', 'since', projectId, cursor],
    queryFn: ({ signal }) => getSince(identity.token, projectId, signal),
    placeholderData: keepPreviousData,
    retry: false,
  })
  return (
    <section className="updates-part" aria-labelledby="since-title">
      <h3 id="since-title">Since you last looked</h3>
      <Waiting words="Reading what changed…" waiting={since.isPending} />
      {since.isError && since.data === undefined && (
        <p className="sheet-lead" role="alert">
          What changed couldn’t be read.{' '}
          <button type="button" className="text-button" onClick={() => void since.refetch()}>
            Try again
          </button>
        </p>
      )}
      {since.isError && since.data !== undefined && <p className="sheet-lead">This may be out of date.</p>}
      {/* Keyed by its range: what a Mark as seen said goes with the digest it was pressed on. */}
      {since.data && (
        <DigestBody key={since.data.toSequence} digest={since.data} projectId={projectId} identity={identity} me={me} />
      )}
    </section>
  )
}

function DigestBody({ digest, projectId, identity, me }: Omit<SinceProps, 'cursor'> & { digest: Digest }) {
  const sections = recapSections(digest, namers(me, NO_NAMES, digest.names).shown)
  const lead = digestLead(digest)
  const seen = useMarkSeen(projectId, identity)
  return (
    <>
      {lead && <p className="sheet-lead">{lead}</p>}
      {sections.map((s) => (
        <RecapPart key={s.title} section={s} records={digest} level={4} />
      ))}
      {sections.length > 0 && (
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

/** What a Mark as seen that didn't go through says: no reply, or the API's words. */
const seenWords = (error: Error) =>
  (error instanceof ApiError && error.status > 0 && error.message) || 'Not marked. Try again.'

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
