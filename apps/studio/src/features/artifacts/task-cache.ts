// What a task read holds, kept current as task writes answer (R-C5-01): a report's list (flat), the project's pages
// (infinite) and one task read alone (a deep link's), each in its own shape.
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { ProjectTask } from '../../api/vision.ts'

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
 * A task created (P on B20): a report's task list is read-authoritative. The Create's answer acknowledges the task but
 * never goes into that list, nor stamps it as read: the API leaves out a task whose origin this reader may no longer
 * follow (A39, a 200 without it), and a read may have been refused since. The list is read again instead, and only a
 * successful read of it shows the task; a refused one keeps withholding, as any read does. The answer is the caller's.
 */
export const taskRecorded = (queryClient: QueryClient, artifactId: string, viewer: string, _task: ProjectTask) =>
  void queryClient.invalidateQueries({ queryKey: tasksKey(artifactId, viewer), exact: true })

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

/**
 * The project's rows, one per task, from its pages in the order they were read (4320180800). Each page is its own read
 * and the open/done parts move between them: a task read open on one page and done on a later one comes twice. The row
 * kept is the copy of the newest revision (an older one read later never takes a done task back to open), at that
 * copy's place; at the same revision, the later read. Its origin is always the last read's: a read's origin is this
 * reader's projection now (one it may no longer follow reads unavailable without a new revision, as `admits` says),
 * so an older copy never brings back an origin a later read redacted.
 */
export function onePerTask(read: readonly ProjectTask[]): ProjectTask[] {
  const kept = new Map<string, number>()
  const last = new Map<string, ProjectTask>()
  read.forEach((task, i) => {
    last.set(task.taskId, task)
    const at = kept.get(task.taskId)
    const held = at === undefined ? undefined : read[at]
    if (!held || (task.revision ?? -1) >= (held.revision ?? -1)) kept.set(task.taskId, i)
  })
  return [...kept.values()]
    .toSorted((a, b) => a - b)
    .flatMap((i) => {
      const task = read[i]
      return task ? [{ ...task, from: (last.get(task.taskId) ?? task).from }] : []
    })
}
