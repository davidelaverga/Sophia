// What a task read holds, kept current as task writes answer (R-C5-01): a report's list (flat), the project's pages
// (infinite) and one task read alone (a deep link's), each in its own shape.
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { ProjectTask } from '../../api/vision.ts'
import { byTime } from './review-view.ts'
import { taskOrder, type TaskRead } from './task-read.ts'

export const tasksKey = (artifactId: string, viewer: string) => ['vision', 'tasks', artifactId, viewer] as const

/** A page of tasks as a read keeps it: a report's list, or one of the project's pages. */
interface TaskPage {
  tasks: readonly ProjectTask[]
}

/**
 * Whether a write's answer may replace what a read holds (4310419402): only a strictly newer revision. A read at the
 * same revision is this reader's current projection of it (an origin it may no longer follow reads 'unavailable'
 * without a new revision: R on 878), so a write answer at that revision never reinstalls what the read redacted; the
 * next allowed read replaces the query whole. Never an older revision over a newer one either — the feed or another
 * member's write may have been read since. An answer without a revision (A17's fixture tasks) stands
 * only over one without one, never over a served revision.
 */
export const admits = (held: { revision?: number }, incoming: { revision?: number }): boolean =>
  incoming.revision === undefined
    ? held.revision === undefined
    : held.revision === undefined || incoming.revision > held.revision

/**
 * A task created: into the report's tasks by its time, once (the feed may bring it too); seeded when the first read is
 * still on its way or failed, so the task made is there at once. A list read set out since the Create was sent
 * (`sentAt`, in `taskOrder`) that does not hold it decides instead: the API leaves out a task whose origin this reader
 * may no longer follow (A39), with a 200 and no refusal, so the answer never refills it — that list is read again, and
 * only that read brings the task back.
 */
export function taskRecorded(
  queryClient: QueryClient,
  artifactId: string,
  viewer: string,
  task: ProjectTask,
  sentAt: number,
) {
  const key = tasksKey(artifactId, viewer)
  const held = queryClient.getQueryData<TaskRead<TaskPage>>(key)
  if (held && held.readFrom > sentAt && !held.tasks.some((t) => t.taskId === task.taskId)) {
    void queryClient.invalidateQueries({ queryKey: key, exact: true })
    return
  }
  queryClient.setQueryData<TaskRead<TaskPage>>(key, (was) => ({
    ...was,
    // A newer copy already read (the feed's) stays: a late create answer goes in only where it is not older.
    tasks: (was?.tasks ?? []).some((t) => t.taskId === task.taskId && !admits(t, task))
      ? (was?.tasks ?? [])
      : byTime(was?.tasks ?? [], task, (t) => t.taskId),
    // A list read before a refusal stays so; one seeded now is as new as this write.
    readFrom: was?.readFrom ?? taskOrder(),
  }))
}

/**
 * A task changed: in every read of tasks that holds it, each kept in its own shape, and never over a newer copy
 * (4310419402). On the project's pages a task done (or open again) moves between their two parts — open first, then
 * done — so kept in place it would stand among the open ones and the next page's cursor would bring it again: those
 * pages are read again from the first (4310419406), any page read on its way dropped. An owner's change stays in place.
 */
export function taskChanged(queryClient: QueryClient, task: ProjectTask) {
  const current = (t: ProjectTask) => t.taskId === task.taskId && admits(t, task)
  const swap = (list: readonly ProjectTask[]) => list.map((t) => (current(t) ? task : t))
  queryClient.setQueriesData<TaskPage>(
    { queryKey: ['vision', 'tasks'] },
    (was) => was && { ...was, tasks: swap(was.tasks) },
  )
  const moved = queryClient
    .getQueriesData<InfiniteData<TaskPage>>({ queryKey: ['tasks', 'project'] })
    .filter(([, was]) =>
      was?.pages.some((p) => p.tasks.some((t) => current(t) && (t.doneAt === null) !== (task.doneAt === null))),
    )
  queryClient.setQueriesData<InfiniteData<TaskPage>>(
    { queryKey: ['tasks', 'project'] },
    (was) => was && { ...was, pages: was.pages.map((p) => ({ ...p, tasks: swap(p.tasks) })) },
  )
  for (const [queryKey] of moved) void queryClient.resetQueries({ queryKey, exact: true })
  queryClient.setQueriesData<ProjectTask>({ queryKey: ['tasks', 'one'] }, (was) => (was && current(was) ? task : was))
}
