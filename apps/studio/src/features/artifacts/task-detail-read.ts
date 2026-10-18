// A native task's own detail read and this person's own refusal of it (R-native-task-own-absence), kept apart from any
// report's: each task GET is stamped when set out; its own 401/403/not_found is kept, as it settles, in the account's
// query cache that ran it, for that project and task; so is the newest allowed read. While refused since, the task's
// detail (its private question, allowance, outputs, progress) is withheld; a task GET set out since and allowed
// restores it. A report read never lifts it, and it never marks a report.
import { useCallback, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ownReportRefusal } from './report-read.ts'

let order = 0
const taskOrder = (): number => ++order

export const taskFenceKey = (projectId: string, taskId: string) => ['task-fence', projectId, taskId]

export interface TaskFence {
  refusedAt: number
  allowedFrom: number
}

const NONE: TaskFence = { refusedAt: 0, allowedFrom: 0 }

export interface TaskOwner {
  client: QueryClient
  projectId: string
  taskId: string
}

function keep(owner: TaskOwner, next: (was: TaskFence) => TaskFence): void {
  const key = taskFenceKey(owner.projectId, owner.taskId)
  owner.client.setQueryDefaults(key, { gcTime: Infinity, staleTime: Infinity })
  owner.client.setQueryData<TaskFence>(key, (was) => next(was ?? NONE))
}

/** One task GET, stamped and settled: its own refusal (the same 401/403/not_found test as a report's) is the task's. */
export async function ownedTaskRead<T>(owner: TaskOwner, read: () => Promise<T>): Promise<T> {
  const readFrom = taskOrder()
  try {
    const value = await read()
    keep(owner, (was) => ({ ...was, allowedFrom: Math.max(was.allowedFrom, readFrom) }))
    return value
  } catch (error) {
    if (ownReportRefusal(error)) keep(owner, (was) => ({ ...was, refusedAt: taskOrder() }))
    throw error
  }
}

/** A task GET's query function, in the query's own client (its account). */
export const taskRead =
  <T>(projectId: string, taskId: string, read: () => Promise<T>) =>
  ({ client }: { client: QueryClient }): Promise<T> =>
    ownedTaskRead({ client, projectId, taskId }, read)

export const taskFenced = (fence: TaskFence): boolean => fence.refusedAt > fence.allowedFrom

/** Whether this task is refused to this person since its newest allowed read. Only read here. */
export function useTaskFence(projectId: string, taskId: string): boolean {
  const client = useQueryClient()
  // Registered and kept (never fetched) so the cache holds the key with its defaults; read from the cache itself as it
  // changes (as useNeedsRefused does), so a kept refusal withholds the task in the same render pass, not a frame later.
  useQuery({
    queryKey: taskFenceKey(projectId, taskId),
    queryFn: () => NONE,
    initialData: NONE,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return useSyncExternalStore(
    useCallback((changed: () => void) => client.getQueryCache().subscribe(changed), [client]),
    () => taskFenced(client.getQueryData<TaskFence>(taskFenceKey(projectId, taskId)) ?? NONE),
  )
}

/** Every reader’s query of this task (any native-task key variant, the origin’s included), in this cache. */
export const taskQueryOf =
  (projectId: string, taskId: string) =>
  (q: { queryKey: readonly unknown[] }): boolean =>
    (q.queryKey[0] === 'native-task' || q.queryKey[0] === 'native-task-origin') &&
    q.queryKey[1] === projectId &&
    q.queryKey[2] === taskId
