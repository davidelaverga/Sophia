// A goal's owner and target date (docs/plans/goal-owner-date.md, A25), kept beside the goal. Read with the project's
// cursor, as the notes are, so a change made elsewhere is read as the project moves. Its row says them («Marco · due
// 30 Oct 2026»); its sheet lets an editor or an admin set them, compare-and-set: a save someone else beat is said, and
// the sheet shows what stands now. A viewer reads them.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { GoalTarget, ProjectMember } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { ApiError, getGoalTargets, getProjectMembers, setGoalTarget } from '../../api/client.ts'
import { useMembership } from '../access/useAccess.ts'
import type { NotesFor } from './GoalNotes.tsx'
import { notesRead } from './goal-notes.ts'
import { dayOf } from './goal-day.ts'
import { dueOf, dueWords, type Due } from './goal-due.ts'

export { dayOf } from './goal-day.ts'

type At = Pick<NotesFor, 'projectId' | 'identity' | 'cursor'>

const targetsKey = (at: At) => ['goal-targets', at.projectId, at.identity.name]

/**
 * The goals' targets, by goal id, read again as the project moves, with how the read stands: a goal's health waits on
 * its date (targets-robust.md; Codex P2 on #372), so an empty list while reading, or after a failure, is not «no dates».
 */
export function useTargetsRead(at: At) {
  const read = useQuery({
    queryKey: [...targetsKey(at), at.cursor],
    queryFn: () => getGoalTargets(at.identity.token, at.projectId),
    placeholderData: keepPreviousData,
  })
  const targets: ReadonlyMap<string, GoalTarget> = new Map((read.data?.targets ?? []).map((t) => [t.goalId, t]))
  return { targets, state: notesRead(read), refetch: () => void read.refetch() }
}

/** The goals' targets alone, by goal id: what the sheet's own date reads. */
export const useGoalTargets = (at: At): ReadonlyMap<string, GoalTarget> => useTargetsRead(at).targets

/** The project's members, for naming an owner and choosing one. */
export function useMembers(at: At): readonly ProjectMember[] {
  const read = useQuery({
    queryKey: ['members', at.projectId, at.identity.name],
    queryFn: () => getProjectMembers(at.identity.token, at.projectId),
    staleTime: 60_000,
  })
  return read.data?.members ?? []
}

const ownerName = (members: readonly ProjectMember[], id: string) =>
  members.find((m) => m.actorId === id)?.name ?? 'A member'

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

type Note = 'saved' | 'stale' | 'failed' | null

const NOTE: Record<Exclude<Note, null>, string> = {
  saved: 'Saved',
  stale: 'Someone changed it meanwhile; here is what it says now.',
  failed: 'Couldn’t save the owner and date. Try again.',
}

/** What a viewer reads: «Owner · Marco · Target date · 30 Oct 2026», with «none» for either not set. */
const targetWords = (target: GoalTarget | undefined, members: readonly ProjectMember[]) =>
  `Owner · ${target?.ownerId ? ownerName(members, target.ownerId) : 'none'} · Target date · ${
    target?.targetDate ? dayOf(target.targetDate) : 'none'
  }`

/** A save's outcome: «Saved» as a status; a stale or failed save as an alert. */
function TargetNote({ note }: { note: Note }) {
  if (!note) return null
  return note === 'saved' ? <p role="status">{NOTE.saved}</p> : <p role="alert">{NOTE[note]}</p>
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
            {m.name ?? 'A member'}
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
        onChange={(e) => setDate(e.target.value)}
      />
      <Button kind="pill" type="submit" disabled={props.saving}>
        {props.saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

/** The sheet's owner and date: a form for an editor or an admin, the words for a viewer. */
export function GoalTargetSection({ goalId, at }: { goalId: string; at: At }) {
  const target = useGoalTargets(at).get(goalId)
  const members = useMembers(at)
  const role = useMembership(at.projectId, at.identity.name, at.identity.token).data?.role
  const client = useQueryClient()
  const [state, setState] = useState<{ note: Note; saving: boolean }>({ note: null, saving: false })
  const save = (ownerId: string | null, targetDate: string | null) => {
    setState({ note: null, saving: true })
    const body = { ownerId, targetDate, expectedRevision: target?.revision ?? 0 }
    setGoalTarget(at.identity.token, at.projectId, goalId, body).then(
      () => {
        setState({ note: 'saved', saving: false })
        void client.invalidateQueries({ queryKey: targetsKey(at) })
      },
      (err: unknown) => {
        const stale = err instanceof ApiError && err.code === 'stale_revision'
        setState({ note: stale ? 'stale' : 'failed', saving: false })
        if (stale) void client.invalidateQueries({ queryKey: targetsKey(at) })
      },
    )
  }
  const may = role === 'admin' || role === 'editor'
  return (
    <section className="goal-sheet-section goal-target" aria-label="Owner and date">
      {may ? (
        // Keyed by the target's revision: what stands now fills the form again once it is read.
        <TargetForm key={target?.revision ?? 0} target={target} members={members} onSave={save} saving={state.saving} />
      ) : (
        <p>{targetWords(target, members)}</p>
      )}
      <TargetNote note={state.note} />
    </section>
  )
}
