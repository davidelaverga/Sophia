// The report pane's Tasks tab (docs/plans/room-passage-task.md): the report's tasks, open ones first, each with who it
// is for, the passage it came from (a link to its place in its version) and Done for whoever may. Read again as the
// feed moves. One key per Done (useAdmission); with no reply, only that same Done goes again. Under the vision flag,
// through the proposed A17; under the tasks flag, A39 served (api/tasks.ts, docs/handoffs/FND-C5-HUMAN-TASKS-attempt-
// 1.md): D-TASKS decides who finishes, editors and admins also claim, assign and release, a task's passage is a link
// only (never its words), and one this reader may not follow says so.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Membership } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { finishTask, listReportTasks, SERVED_TASKS, setTaskOwner, TASKABLE } from '../../api/tasks.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { ProjectTask } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMembership } from '../access/useAccess.ts'
import { useMemberNames } from '../conversation/MentionPicker.tsx'
import { labelOf } from '../conversation/mention-view.ts'
import { passageLink, readLocator } from './passage-link.ts'
import { PASSAGE_PARAM } from './report-link.ts'
import { doneWords, fromWords, mayAssign, mayFinish, ordered, ownerWords } from './task-view.ts'
import { byTime } from './review-view.ts'
import { useFeedRefetch } from './useFeedRefetch.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { canInvite } from '../access/useAccess.ts'

const tasksKey = (artifactId: string, viewer: string) => ['vision', 'tasks', artifactId, viewer] as const

/**
 * A task created: into the report's tasks by its time, once (the feed may bring it too); seeded when the first read is
 * still on its way or failed, so the task made is there at once.
 */
export const taskRecorded = (queryClient: QueryClient, artifactId: string, viewer: string, task: ProjectTask) =>
  queryClient.setQueryData<{ tasks: readonly ProjectTask[] }>(tasksKey(artifactId, viewer), (was) => ({
    tasks: byTime(was?.tasks ?? [], task, (t) => t.taskId),
  }))

/** A task changed: in every read of tasks that holds it (a report's, the project's), in its place. */
export function taskChanged(queryClient: QueryClient, task: ProjectTask) {
  const swap = (was: { tasks: readonly ProjectTask[] } | undefined) =>
    was && { ...was, tasks: was.tasks.map((t) => (t.taskId === task.taskId ? task : t)) }
  queryClient.setQueriesData<{ tasks: readonly ProjectTask[] }>({ queryKey: ['vision', 'tasks'] }, swap)
  queryClient.setQueriesData<{ tasks: readonly ProjectTask[] }>({ queryKey: ['tasks'] }, swap)
}

/** A report's tasks, read again as the feed moves (a task is a record); none read without tasks offered. */
export function useTasks(identity: Identity, artifactId: string, cursor: string | undefined) {
  const read = useQuery({
    queryKey: tasksKey(artifactId, identity.name),
    queryFn: ({ signal }) => listReportTasks(identity.token, artifactId, signal),
    enabled: TASKABLE,
    retry: 1,
  })
  useFeedRefetch(TASKABLE ? cursor : undefined, read)
  return read
}

interface Props {
  projectId: string
  identity: Identity
  artifactId: string
  cursor: string | undefined
}

export function TaskList({ projectId, identity, artifactId, cursor }: Props) {
  const me = useMembership(projectId, identity.name, identity.token).data
  const tasks = useTasks(identity, artifactId, cursor)
  if (!tasks.data) return <TasksPending failed={tasks.isError} onRetry={() => void tasks.refetch()} />
  if (!me) return null
  const all = ordered(tasks.data.tasks)
  if (all.length === 0) {
    // Only who may make one is told how; a viewer is told there are none.
    return (
      <p className="task-none">{canInvite(me) ? 'No tasks yet. Select a passage and press Task.' : 'No tasks yet.'}</p>
    )
  }
  return (
    <ul className="task-rows" aria-label="Tasks">
      {all.map((task) => (
        <TaskRow
          key={task.taskId}
          task={task}
          me={me}
          projectId={projectId}
          identity={identity}
          artifactId={artifactId}
          onStale={() => void tasks.refetch()}
        />
      ))}
    </ul>
  )
}

/** Before the first read: being read (with the slow note after a while), or failed, with Try again. */
export function TasksPending({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const slow = useSlow(!failed)
  if (failed) {
    return (
      <p className="task-none" role="alert">
        Tasks can’t be read now.{' '}
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      </p>
    )
  }
  return (
    <>
      <p className="task-none" role="status">
        Reading tasks…
      </p>
      {slow && (
        <p className="wait-note" role="status">
          {SLOW_NOTE}
        </p>
      )}
    </>
  )
}

/** Done's words: on its way, after no reply, or to press. */
const doneLabel = (sending: boolean, lost: boolean) => {
  if (sending) return 'Marking done…'
  return lost ? 'Try again' : 'Done'
}

interface RowProps {
  task: ProjectTask
  me: Membership
  projectId: string
  identity: Identity
  /** The report the row is shown under; a served task names its own. */
  artifactId: string | null
  /** The task changed elsewhere since it was shown (409): read it again. */
  onStale: () => void
}

/** The link to the passage a task came from, at its place in its version; none when it has none it may follow. */
function hrefOf(task: ProjectTask, artifactId: string | null): string | null {
  const from = task.from
  if (from === null || from === 'unavailable') return null
  const report = from.artifactId ?? artifactId
  const at = readLocator(`?${PASSAGE_PARAM}=${encodeURIComponent(from.passage)}`)
  return at && report ? passageLink(window.location, { artifactId: report, versionId: from.versionId }, at) : null
}

const STALE = 'This task changed meanwhile. It’s shown as it is now.'

/** What a write says: nothing while it waits; with no reply, so; a stale task, that it moved; a refusal, its words. */
function rowWords(state: ReturnType<typeof useAdmission<void, ProjectTask>>['state']): string | null {
  if (state.status === 'unknown') return 'Not confirmed. Try again.'
  if (state.status !== 'rejected') return null
  if (state.error instanceof ApiError && state.error.code === 'stale_revision') return STALE
  return state.error instanceof ApiError ? state.error.message : 'Not sent.'
}

/** The passage, as a link: A17's quote, A39's version; or that it isn't available to this reader. */
function From({ task, href }: { task: ProjectTask; href: string | null }) {
  const from = task.from
  const words = from !== null && from !== 'unavailable' && from.quote !== null ? `“${from.quote}”` : fromWords(task)
  if (words === null) return null
  return href ? (
    // A tab of its own: following it here would reload the room, and leave the call.
    <a href={href} target="_blank" rel="noopener noreferrer">
      {words}
    </a>
  ) : (
    <span>{words}</span>
  )
}

/** A17's rows say the version before the quote; A39's link names it. */
const versionWords = (task: ProjectTask) =>
  !SERVED_TASKS && task.from !== null && task.from !== 'unavailable' ? ` · v${String(task.from.versionNumber)}` : ''

export function TaskRow({ task, me, projectId, identity, artifactId, onStale }: RowProps) {
  const queryClient = useQueryClient()
  const write = useAdmission<void, ProjectTask>((key) => finishTask(identity.token, projectId, task, key))
  const sending = write.state.status === 'sending'
  const slow = useSlow(sending)
  const lost = write.state.status === 'unknown'
  const said = rowWords(write.state)
  const done = async () => {
    if (sending) return
    const result = await write.send(undefined)
    if (result) taskChanged(queryClient, result)
    // Served, a refusal may be a task changed meanwhile: it is read again (A17's proposal keeps its row as it was).
    else if (SERVED_TASKS) onStale()
  }
  return (
    <li className="task-row" id={`todo-${task.taskId}`} tabIndex={-1} data-done={task.doneBy !== null || undefined}>
      <span className="task-text">{task.text}</span>
      <span className="task-meta">
        {`For ${ownerWords(task, me.actorId, SERVED_TASKS)}${versionWords(task)} · `}
        <From task={task} href={hrefOf(task, artifactId)} />
      </span>
      <span className="task-said" role="status">
        {task.doneBy === null ? said : doneWords(task, me.actorId)}
      </span>
      {slow && <span className="task-said">{SLOW_NOTE}</span>}
      {mayFinish(task, me.actorId, me.role, SERVED_TASKS) && (
        <button type="button" className="pill" aria-disabled={sending || undefined} onClick={() => void done()}>
          {doneLabel(sending, lost)}
        </button>
      )}
      {SERVED_TASKS && task.doneBy === null && mayAssign(me.role) && (
        <TaskOwner task={task} me={me} projectId={projectId} identity={identity} onStale={onStale} />
      )}
    </li>
  )
}

interface OwnerProps {
  task: ProjectTask
  me: Membership
  projectId: string
  identity: Identity
  onStale: () => void
}

/** Whom an open served task is for (editors and admins, D-TASKS): Claim, Release, or a member; against its revision. */
function TaskOwner({ task, me, projectId, identity, onStale }: OwnerProps) {
  const queryClient = useQueryClient()
  const members = useMemberNames(projectId, identity, SERVED_TASKS)
  const [sending, setSending] = useState(false)
  const [words, setWords] = useState<string | null>(null)
  const assign = async (ownerId: string | null) => {
    if (sending) return
    setSending(true)
    setWords(null)
    try {
      taskChanged(queryClient, await setTaskOwner(identity.token, projectId, task, ownerId))
    } catch (err) {
      const stale = err instanceof ApiError && err.code === 'stale_revision'
      setWords(stale ? STALE : err instanceof ApiError ? err.message : 'Not sent.')
      if (stale) onStale()
    } finally {
      setSending(false)
    }
  }
  const busy = sending || undefined
  return (
    <span className="task-owner">
      {task.owner !== me.actorId && (
        <button type="button" className="text-button" aria-disabled={busy} onClick={() => void assign(me.actorId)}>
          Claim
        </button>
      )}
      {task.owner !== null && (
        <button type="button" className="text-button" aria-disabled={busy} onClick={() => void assign(null)}>
          Release
        </button>
      )}
      {members.known && (
        <select
          aria-label="Assign to"
          value=""
          disabled={sending}
          onChange={(e) => {
            if (e.target.value) void assign(e.target.value)
          }}
        >
          <option value="">Assign to…</option>
          {members.members
            .filter((m) => m.actorId !== task.owner)
            .map((m) => (
              <option key={m.actorId} value={m.actorId}>
                {m.actorId === me.actorId ? 'Me' : labelOf(m)}
              </option>
            ))}
        </select>
      )}
      {words && <span role="status">{words}</span>}
    </span>
  )
}
