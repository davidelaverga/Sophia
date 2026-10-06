// The report pane's Tasks tab (docs/plans/room-passage-task.md), through the proposed A17 (issue #105): the report's
// tasks, open ones first, each with who it is for, the passage it came from (a link to its place in its version) and
// Done for whoever may. Read again as the feed moves. One key per Done (useAdmission); with no reply, only that same
// Done goes again. Only under the vision flag.
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Membership } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { finishTask, listTasks, type ProjectTask } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { VISION } from '../../app/vision.ts'
import { useMembership } from '../access/useAccess.ts'
import { passageLink, readLocator } from './passage-link.ts'
import { PASSAGE_PARAM } from './report-link.ts'
import { doneWords, mayFinish, ordered, ownerWords } from './task-view.ts'

const tasksKey = (artifactId: string, viewer: string) => ['vision', 'tasks', artifactId, viewer] as const

/** A task created (A17): into every read of its report's tasks, first and once (the feed may bring it too). */
export const taskRecorded = (queryClient: QueryClient, artifactId: string, viewer: string, task: ProjectTask) =>
  queryClient.setQueriesData<{ tasks: readonly ProjectTask[] }>(
    { queryKey: tasksKey(artifactId, viewer) },
    (was) => was && { tasks: [task, ...was.tasks.filter((t) => t.taskId !== task.taskId)] },
  )

/** A report's tasks, read again as the feed moves (a task is a record); none read outside the flag. */
export function useTasks(identity: Identity, artifactId: string, cursor: string | undefined) {
  return useQuery({
    queryKey: [...tasksKey(artifactId, identity.name), cursor],
    queryFn: ({ signal }) => listTasks(identity.token, artifactId, signal),
    enabled: VISION,
    placeholderData: keepPreviousData,
    retry: 1,
  })
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
  const queryClient = useQueryClient()
  if (tasks.isError) return <p className="task-none">The tasks can’t be read now.</p>
  if (!tasks.data || !me) return null
  /** A task done: into every read of the report's tasks, in its place. */
  const finished = (done: ProjectTask) =>
    queryClient.setQueriesData<{ tasks: readonly ProjectTask[] }>(
      { queryKey: tasksKey(artifactId, identity.name) },
      (was) => was && { tasks: was.tasks.map((t) => (t.taskId === done.taskId ? done : t)) },
    )
  const all = ordered(tasks.data.tasks)
  if (all.length === 0) return <p className="task-none">No tasks yet. Select a passage and press Task.</p>
  return (
    <ul className="task-rows" aria-label="Tasks">
      {all.map((task) => (
        <TaskRow
          key={task.taskId}
          task={task}
          me={me}
          artifactId={artifactId}
          send={(key) => finishTask(identity.token, projectId, task.taskId, key)}
          onDone={finished}
        />
      ))}
    </ul>
  )
}

interface RowProps {
  task: ProjectTask
  me: Membership
  artifactId: string
  send: (key: string) => Promise<ProjectTask>
  onDone: (task: ProjectTask) => void
}

/** The link to the passage a task came from, at its place in its version; none when the place isn't one. */
function hrefOf(task: ProjectTask, artifactId: string): string | null {
  const at = readLocator(`?${PASSAGE_PARAM}=${encodeURIComponent(task.from.passage)}`)
  return at ? passageLink(window.location, { artifactId, versionId: task.from.versionId }, at) : null
}

/** What a Done says: nothing while it waits; with no reply, so; a refusal, the API's words. */
function rowWords(state: ReturnType<typeof useAdmission<void, ProjectTask>>['state']): string | null {
  if (state.status === 'unknown') return 'Not sent. Try again.'
  if (state.status === 'rejected') return state.error instanceof ApiError ? state.error.message : 'Not sent.'
  return null
}

function TaskRow({ task, me, artifactId, send, onDone }: RowProps) {
  const write = useAdmission<void, ProjectTask>((key) => send(key))
  const sending = write.state.status === 'sending'
  const lost = write.state.status === 'unknown'
  const href = hrefOf(task, artifactId)
  const quote = `“${task.from.quote}”`
  const done = async () => {
    if (sending) return
    const result = await write.send(undefined)
    if (result) onDone(result)
  }
  return (
    <li className="task-row" data-done={task.doneBy !== null || undefined}>
      <span className="task-text">{task.text}</span>
      <span className="task-meta">
        {`For ${ownerWords(task, me.actorId)} · v${String(task.from.versionNumber)} · `}
        {href ? (
          // A tab of its own: following it here would reload the room, and leave the call.
          <a href={href} target="_blank" rel="noopener noreferrer">
            {quote}
          </a>
        ) : (
          quote
        )}
      </span>
      <span className="task-said" role="status">
        {task.doneBy === null ? rowWords(write.state) : doneWords(task, me.actorId)}
      </span>
      {mayFinish(task, me.actorId, me.role) && (
        <button type="button" className="pill" aria-disabled={sending || undefined} onClick={() => void done()}>
          {lost ? 'Try again' : 'Done'}
        </button>
      )}
    </li>
  )
}
