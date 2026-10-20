// The project's human tasks in the brief (A39, the tasks flag's; docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md): open
// ones first, newest first, 50 at a time, each as the report's Tasks tab shows it (TaskRow): who it is for, its passage
// as a link (or that this reader can't follow it), Done and, for editors and admins, its owner. Read again as the feed
// moves. A task named in the address (#todo-<id>) is brought into view once for each time it is followed; one not
// among those read is read on its own, and the brief says so when it can't be shown.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, type ComponentProps } from 'react'
import { getProjectTask, listProjectTasks } from '../../api/tasks.ts'
import type { ProjectTask } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { TASKS } from '../../app/tasks.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { useMembership } from '../access/useAccess.ts'
import { TODO } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
import { closedDoor } from '../studio/project-door.ts'
import { shownTaskReads, taskPages, useTasksRefused } from './task-read.ts'
import { ProjectNewTask } from './PassageTask.tsx'
import { TaskRow, TasksPending } from './TaskList.tsx'
import { useFeedRefetch } from './useFeedRefetch.ts'
import { onePerTask } from './task-cache.ts'

interface Props {
  projectId: string
  identity: Identity
  cursor: string | undefined
}

export function ProjectTasks({ projectId, identity, cursor }: Props) {
  const me = useMembership(projectId, identity.name, identity.token).data
  const { read, pages, listed } = useProjectTaskPages(projectId, identity, cursor)
  const named = useNamedTask(projectId, identity, cursor, listed.length > 0 || read.isSuccess ? listed : undefined)
  if (!TASKS) return null
  return (
    <section className="project-tasks" aria-labelledby="project-tasks-title">
      <h3 id="project-tasks-title">Tasks</h3>
      {pages && <ProjectNewTask projectId={projectId} identity={identity} onAdded={() => void read.refetch()} />}
      {named.words && (
        <p className="task-none" role="status">
          {named.words}
        </p>
      )}
      {!pages || !me ? (
        <TasksPending failed={read.isError} onRetry={() => void read.refetch()} />
      ) : (
        <Rows
          tasks={[...(named.task ? [named.task] : []), ...listed]}
          row={{ me, projectId, identity, artifactId: null, onStale: () => [read.refetch(), named.refetch()] }}
        />
      )}
      {pages && read.hasNextPage && <MoreTasks read={read} />}
    </section>
  )
}

/**
 * The project's task pages, read again as the feed moves, and those that may show: each page stamped when its read is
 * set out, this person's own refusal (401, 403) kept as it settles, and nothing read before it shown again, no title,
 * count, More, origin or action, until a read set out since answers (V-C5-TASKS-READ-01).
 */
function useProjectTaskPages(projectId: string, identity: Identity, cursor: string | undefined) {
  const read = useInfiniteQuery({
    queryKey: ['tasks', 'project', projectId, identity.name],
    queryFn: taskPages<Awaited<ReturnType<typeof listProjectTasks>>>(projectId, 'project', (after, signal) =>
      listProjectTasks(identity.token, projectId, after, signal),
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: TASKS,
    retry: 1,
  })
  useFeedRefetch(TASKS ? cursor : undefined, read)
  const refusedAt = useTasksRefused(projectId, 'project')
  const pages = shownTaskReads(read.data?.pages, read.isError && closedDoor(read.error), refusedAt)
  return { read, pages, listed: onePerTask(pages?.flatMap((p) => p.tasks) ?? []) }
}

/**
 * The next page (4321099448): on its way, it says so where More is, and More doesn't ask again; failed (after the read's
 * own retry), it says only that more tasks couldn't be read, and offers to read them again. The rows read stay. A
 * refusal (401, 403) hides the whole list, this with it (shownTaskReads).
 */
function MoreTasks({
  read,
}: {
  read: { isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => unknown }
}) {
  const fetching = read.isFetchingNextPage
  const slow = useSlow(fetching)
  const failed = read.isFetchNextPageError && !fetching
  return (
    <div className="task-more">
      <p role="status" className="task-said">
        {fetching ? (slow ? `Loading more tasks… ${SLOW_NOTE}` : 'Loading more tasks…') : ''}
      </p>
      {failed && <p role="alert">Couldn’t read more tasks.</p>}
      <button
        type="button"
        className="text-button"
        aria-disabled={fetching || undefined}
        onClick={() => {
          if (!fetching) void read.fetchNextPage()
        }}
      >
        {failed ? 'Try again' : 'More tasks'}
      </button>
    </div>
  )
}

/** The rows, or that there are none. */
function Rows({ tasks, row }: { tasks: readonly ProjectTask[]; row: Omit<ComponentProps<typeof TaskRow>, 'task'> }) {
  if (tasks.length === 0) return <p className="task-none">No tasks yet.</p>
  return (
    <ul className="task-rows" aria-label="Project tasks">
      {tasks.map((task) => (
        <TaskRow key={task.taskId} task={task} {...row} />
      ))}
    </ul>
  )
}

/** The named task's row, brought into view and given the focus once it is shown, once each time it is followed. */
function useBroughtIntoView(named: { id: string | null; seq: number }, ready: boolean) {
  const shown = useRef<string | null>(null)
  const key = named.id ? `${named.id}#${String(named.seq)}` : null
  useEffect(() => {
    if (!key || !ready || shown.current === key) return
    shown.current = key
    const row = document.getElementById(`todo-${named.id ?? ''}`)
    row?.scrollIntoView({ block: 'center' })
    row?.focus({ preventScroll: true })
  }, [key, ready, named.id])
}

/**
 * The task the address names (#todo-<id>): when it isn't among those read, it is read on its own (one read); brought
 * into view and given the focus once for each time the address is followed.
 */
function useNamedTask(
  projectId: string,
  identity: Identity,
  cursor: string | undefined,
  listed: readonly { taskId: string }[] | undefined,
) {
  const named = useAddressed(TODO)
  const among = named.id !== null && listed?.some((t) => t.taskId === named.id)
  // Read alone only when named and not among the tasks read; never otherwise, not even as the feed moves.
  const alone = named.id !== null && listed !== undefined && !among
  const one = useQuery({
    queryKey: ['tasks', 'one', projectId, named.id, identity.name],
    queryFn: ({ signal }) => getProjectTask(identity.token, projectId, named.id ?? '', signal),
    enabled: TASKS && alone,
    retry: false,
  })
  // Read again as the feed moves, as the list is: its owner, state and origin are this reader's now (R-C5-03). Only
  // while a task is named and read alone: a forced refetch ignores `enabled`, and the feed's step reads a task no
  // longer named (the address cleared, or Back) as a move, which would read an empty id (R-C5-04).
  const refetchNamed = one.refetch
  const follow = useCallback(
    (o: { cancelRefetch: boolean }) => (alone ? refetchNamed(o) : undefined),
    [alone, refetchNamed],
  )
  useFeedRefetch(TASKS && alone ? cursor : undefined, { isFetching: one.isFetching, refetch: follow })
  useBroughtIntoView(named, among || one.isSuccess)
  return { ...namedView(alone, one), refetch: () => (alone ? one.refetch() : undefined) }
}

/** What the named task shows: itself while read; once a read is refused, not what was read before (R-C5-03). */
function namedView(alone: boolean, one: { data: ProjectTask | undefined; isError: boolean }) {
  if (!alone) return { task: null, words: null }
  if (one.isError) return { task: null, words: 'The task you opened isn’t available.' }
  return { task: one.data ?? null, words: null }
}
