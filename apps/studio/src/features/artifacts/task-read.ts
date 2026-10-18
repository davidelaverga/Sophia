// A39 task reads and this person's own refusal of them (V-C5-TASKS-READ-01), as the project's search keeps its own
// (search-view.ts, R-C4-SEARCH-READ-01): each read stamped when it is set out, a 401/403 kept in the account's query
// cache that ran the read, as it settles, for its project and resource (the project's list, or one report's), and
// nothing read before the last refusal shown again, whatever answers later. Only a read set out since shows again.
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { closedDoor } from '../studio/project-door.ts'

/** A read of tasks as it was read, and when that read was set out, in this page's order (`taskOrder`). */
export type TaskRead<T> = T & { readFrom: number }

let order = 0
/** This page's order of task reads and refusals: each call is later than every call before it. Never the clock. */
export const taskOrder = (): number => ++order

/** Where the account's query cache keeps when this person's own read of these tasks was last refused. */
export const tasksRefusedKey = (projectId: string, resource: string) => ['vision', 'tasks-refused', projectId, resource]

/** Keep this person's own refusal (401, 403) of a task read in the cache that ran it: later than every read before. */
export function keepTasksRefusal(client: QueryClient, projectId: string, resource: string): void {
  client.setQueryDefaults(tasksRefusedKey(projectId, resource), { gcTime: Infinity, staleTime: Infinity })
  client.setQueryData<number>(tasksRefusedKey(projectId, resource), (at = 0) => Math.max(at, taskOrder()))
}

async function stamped<T extends object>(
  client: QueryClient,
  scope: { projectId: string; resource: string },
  read: () => Promise<T>,
): Promise<TaskRead<T>> {
  const readFrom = taskOrder()
  try {
    return { ...(await read()), readFrom }
  } catch (error) {
    // Kept as the refused read settles, before its error reaches anything that renders it.
    if (closedDoor(error)) keepTasksRefusal(client, scope.projectId, scope.resource)
    throw error
  }
}

/** The query function of one task read (a report's list). */
export const taskRead =
  <T extends object>(projectId: string, resource: string, read: (signal: AbortSignal) => Promise<T>) =>
  ({ signal, client }: { signal: AbortSignal; client: QueryClient }): Promise<TaskRead<T>> =>
    stamped(client, { projectId, resource }, () => read(signal))

/** The query function of a paged task read (the project's list). */
export const taskPages =
  <T extends object>(
    projectId: string,
    resource: string,
    read: (cursor: string | null, signal: AbortSignal) => Promise<T>,
  ) =>
  ({
    pageParam,
    signal,
    client,
  }: {
    pageParam: string | null
    signal: AbortSignal
    client: QueryClient
  }): Promise<TaskRead<T>> =>
    stamped(client, { projectId, resource }, () => read(pageParam, signal))

/**
 * The reads that may show: none while this person's own read is refused, and none read before the last refusal
 * (`refusedAt`, 0 when never). Without a refusal, an ordinary failure keeps what was read.
 */
export function shownTaskReads<R extends { readFrom: number }>(
  reads: readonly R[] | undefined,
  refusedNow: boolean,
  refusedAt: number,
): readonly R[] | undefined {
  if (!reads || refusedNow) return undefined
  return reads.every((r) => r.readFrom > refusedAt) ? reads : undefined
}

/** When this person's own read of these tasks was last refused, in `taskOrder`; 0 when never. Only read here. */
export function useTasksRefused(projectId: string, resource: string): number {
  return useQuery({
    queryKey: tasksRefusedKey(projectId, resource),
    queryFn: () => 0,
    initialData: 0,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  }).data
}
