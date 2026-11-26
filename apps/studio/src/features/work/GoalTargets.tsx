// A goal's owner and target date (docs/plans/goal-owner-date.md, A25), kept beside the goal. Read with the project's
// cursor, as the notes are, so a change made elsewhere is read as the project moves. Its row says them («Marco · due
// 30 Oct 2026»); its sheet lets an editor or an admin set them, compare-and-set: a save someone else beat is said, and
// the sheet shows what stands now. A save whose reply was lost is read again, and what landed is said, never blamed on a
// teammate (save-reply-lost.md). A viewer reads them.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { GoalTarget, GoalTargetList, ProjectMember } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { ApiError, getGoalTargets, getProjectMembers, setGoalTarget } from '../../api/client.ts'
import { replyLost } from '../../api/reply-lost.ts'
import { useMembership } from '../access/useAccess.ts'
import type { NotesFor } from './GoalNotes.tsx'
import { notesRead } from './goal-notes.ts'
import { dayOf } from './goal-day.ts'
import { dueOf, dueWords, type Due } from './goal-due.ts'
import { memberName } from '../../app/person-name.ts'

export { dayOf } from './goal-day.ts'

type At = Pick<NotesFor, 'projectId' | 'identity' | 'cursor'>

const targetsKey = (at: At) => ['goal-targets', at.projectId, at.identity.name]

/** The newest targets read for this project and viewer, at whichever cursor: what the next cursor's read starts from. */
function lastRead(client: QueryClient, at: At) {
  const [newest] = client
    .getQueryCache()
    .findAll({ queryKey: targetsKey(at) })
    .filter((query) => query.state.data !== undefined)
    .toSorted((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
  return newest && { data: client.getQueryData<GoalTargetList>(newest.queryKey), at: newest.state.dataUpdatedAt }
}

/**
 * The goals' targets, by goal id, read again as the project moves, with how the read stands: a goal's health waits on
 * its date (targets-robust.md; Codex P2 on #372), so an empty list while reading, or after a failure, is not «no dates».
 * Each cursor's read starts from the last one read, as stale, so it is read at once, and a read that fails after the
 * project moved keeps what was read (`stale`), never «failed» over an owner and a date on screen (silent-reads.md).
 */
export function useTargetsRead(at: At) {
  const client = useQueryClient()
  const read = useQuery({
    queryKey: [...targetsKey(at), at.cursor],
    queryFn: () => getGoalTargets(at.identity.token, at.projectId),
    initialData: () => lastRead(client, at)?.data,
    initialDataUpdatedAt: () => lastRead(client, at)?.at,
  })
  const targets: ReadonlyMap<string, GoalTarget> = new Map((read.data?.targets ?? []).map((t) => [t.goalId, t]))
  return { targets, state: notesRead(read), refetch: () => void read.refetch() }
}

/**
 * The project's members, for naming an owner and choosing one, with how the read stands: an empty list after a
 * failure is not «no one» (silent-reads.md).
 */
export function useMembersRead(at: At) {
  const read = useQuery({
    queryKey: ['members', at.projectId, at.identity.name],
    queryFn: () => getProjectMembers(at.identity.token, at.projectId),
    staleTime: 60_000,
  })
  const members: readonly ProjectMember[] = read.data?.members ?? []
  return { members, state: notesRead(read), refetch: () => void read.refetch() }
}

/** The project's members alone: what a row and the invite sheet name. */
export const useMembers = (at: At): readonly ProjectMember[] => useMembersRead(at).members

const ownerName = (members: readonly ProjectMember[], id: string) =>
  memberName(members.find((m) => m.actorId === id)?.name)

/** Against what a row's target is read: the viewer (named «You»), their calendar day, and whether the goal is done. */
export interface TargetAt {
  me: string
  today: string
  done: boolean
}

/**
 * What a goal's row says of its target: «Marco · due 30 Oct 2026», «You · overdue since 30 Oct 2026» (goal-overdue.md),
 * either part alone, or nothing; with how its date stands.
 */
export function targetLine(
  target: GoalTarget | undefined,
  members: readonly ProjectMember[],
  at: TargetAt,
): { text: string; due: Due | null } | null {
  const due = dueOf(target?.targetDate, at.today, at.done)
  const owner = target?.ownerId === at.me ? 'You' : target?.ownerId ? ownerName(members, target.ownerId) : null
  const parts = [owner, target?.targetDate ? dueWords(target.targetDate, due) : null].filter(Boolean)
  return parts.length > 0 ? { text: parts.join(' · '), due } : null
}

type Note = 'saved' | 'checked' | 'lost' | 'stale' | 'failed' | null

const NOTE: Record<Exclude<Note, null>, string> = {
  saved: 'Saved',
  checked: 'Saved. The reply was slow, so we checked.',
  lost: 'Not saved. Try again.',
  stale: 'Someone changed it meanwhile; here is what it says now.',
  failed: 'Couldn’t save the owner and date. Try again.',
}

/** What a viewer reads: «Owner · Marco · Target date · 30 Oct 2026», with «none» for either not set. */
const targetWords = (target: GoalTarget | undefined, members: readonly ProjectMember[]) =>
  `Owner · ${target?.ownerId ? ownerName(members, target.ownerId) : 'none'} · Target date · ${
    target?.targetDate ? dayOf(target.targetDate) : 'none'
  }`

/** A save's outcome: «Saved» as a status, checked or not; one not saved, stale or failed as an alert. */
function TargetNote({ note }: { note: Note }) {
  if (!note) return null
  return note === 'saved' || note === 'checked' ? <p role="status">{NOTE[note]}</p> : <p role="alert">{NOTE[note]}</p>
}

/**
 * After a lost reply, what stands says whether the save landed: the goal's owner and date as sent, or not; with the
 * targets read, which the sheet then stands on. A read that fails too tells nothing, so today's words stay.
 */
async function checked(
  at: At,
  goalId: string,
  sent: Pick<GoalTarget, 'ownerId' | 'targetDate'>,
): Promise<{ note: Note; read?: GoalTargetList }> {
  try {
    const read = await getGoalTargets(at.identity.token, at.projectId)
    const now = read.targets.find((t) => t.goalId === goalId)
    const landed = (now?.ownerId ?? null) === sent.ownerId && (now?.targetDate ?? null) === sent.targetDate
    return { note: landed ? 'checked' : 'lost', read }
  } catch {
    return { note: 'failed' }
  }
}

function TargetForm(props: {
  target: GoalTarget | undefined
  members: readonly ProjectMember[]
  onSave: (ownerId: string | null, date: string | null) => void
  saving: boolean
}) {
  const [owner, setOwner] = useState(props.target?.ownerId ?? '')
  const [date, setDate] = useState(props.target?.targetDate ?? '')
  return (
    <form
      className="goal-target-form"
      onSubmit={(e) => {
        e.preventDefault()
        props.onSave(owner || null, date || null)
      }}
    >
      <label className="field-label" htmlFor="goal-owner">
        Owner
      </label>
      <select id="goal-owner" className="field" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">No owner</option>
        {props.members.map((m) => (
          <option key={m.actorId} value={m.actorId}>
            {memberName(m.name)}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="goal-date">
        Target date
      </label>
      <input
        id="goal-date"
        className="field"
        type="date"
        min="2000-01-01"
        max="2100-12-31"
        value={date}
        aria-describedby={saidDay(date) ? 'goal-date-said' : undefined}
        onChange={(e) => setDate(e.target.value)}
      />
      {/* The browser's field follows the system («12/15/2026»); under it, the day as the Studio says it. */}
      {saidDay(date) && (
        <p id="goal-date-said" className="when-said">
          {dayOf(date)}
        </p>
      )}
      <Button kind="pill" type="submit" disabled={props.saving}>
        {props.saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

/** Whether a field's date reads as a day: a year of five digits, which the field allows, never says «Invalid Date». */
const saidDay = (date: string) => date !== '' && Number.isFinite(Date.parse(`${date}T00:00:00Z`))

/** The targets or the members unread, with nothing kept: said in place of the owner and date, never as «none». */
function TargetUnread({ onRetry }: { onRetry: () => void }) {
  return (
    <p role="alert">
      The owner and date can’t be read right now.{' '}
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </p>
  )
}

/** The sheet's owner and date: a form for an editor or an admin, the words for a viewer; a failed read, said. */
export function GoalTargetSection({ goalId, at }: { goalId: string; at: At }) {
  const dates = useTargetsRead(at)
  const target = dates.targets.get(goalId)
  const { members, ...people } = useMembersRead(at)
  const unread = [dates, people].filter((read) => read.state === 'failed')
  const role = useMembership(at.projectId, at.identity.name, at.identity.token).data?.role
  const client = useQueryClient()
  const [state, setState] = useState<{ note: Note; saving: boolean }>({ note: null, saving: false })
  const save = (ownerId: string | null, targetDate: string | null) => {
    setState({ note: null, saving: true })
    const body = { ownerId, targetDate, expectedRevision: target?.revision ?? 0 }
    // Read again after a save, landed or maybe: the form then stands on the revision now read.
    const said = (note: Note) => {
      setState({ note, saving: false })
      void client.invalidateQueries({ queryKey: targetsKey(at) })
    }
    setGoalTarget(at.identity.token, at.projectId, goalId, body).then(
      () => said('saved'),
      async (err: unknown) => {
        if (replyLost(err)) {
          const { note, read } = await checked(at, goalId, body)
          // What was read is what the form stands on before the line is said: a Save pressed at once goes against it.
          if (read) client.setQueriesData<GoalTargetList>({ queryKey: targetsKey(at) }, read)
          return said(note)
        }
        const stale = err instanceof ApiError && err.code === 'stale_revision'
        if (stale) said('stale')
        else setState({ note: 'failed', saving: false })
      },
    )
  }
  const may = role === 'admin' || role === 'editor'
  return (
    <section className="goal-sheet-section goal-target" aria-label="Owner and date">
      {unread.length > 0 ? (
        <TargetUnread onRetry={() => unread.forEach((read) => read.refetch())} />
      ) : may ? (
        // Keyed by the target's revision: what stands now fills the form again once it is read.
        <TargetForm key={target?.revision ?? 0} target={target} members={members} onSave={save} saving={state.saving} />
      ) : (
        <p>{targetWords(target, members)}</p>
      )}
      <TargetNote note={state.note} />
    </section>
  )
}
