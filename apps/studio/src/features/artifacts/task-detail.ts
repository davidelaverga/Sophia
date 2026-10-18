// A native task's detail as one reader reads it (its own task GET, task-detail-read.ts): withheld while the task is
// refused to this person, whoever saw the refusal. Each reader keeps its own query key; the fence is the task's.
import { useQuery } from '@tanstack/react-query'
import type { NativeTaskDetail } from '@sophia/contracts'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { taskRead, useTaskFence } from './task-detail-read.ts'

export interface OwnedTaskDetailRead {
  queryKey: readonly unknown[]
  projectId: string
  taskId: string | undefined
  identity: Identity
  enabled?: boolean
  refetchInterval?: number | false
  staleTime?: number
  retry?: number
}

export function useOwnedTaskDetail(read: OwnedTaskDetailRead) {
  const { projectId, taskId, identity } = read
  const id = taskId ?? ''
  const refused = useTaskFence(projectId, id)
  const query = useQuery({
    queryKey: read.queryKey,
    queryFn: taskRead(projectId, id, () => getNativeTask(identity.token, projectId, id)),
    enabled: (read.enabled ?? true) && taskId !== undefined,
    refetchInterval: read.refetchInterval ?? false,
    ...(read.staleTime === undefined ? {} : { staleTime: read.staleTime }),
    ...(read.retry === undefined ? {} : { retry: read.retry }),
    select: (detail: NativeTaskDetail) => (refused ? undefined : detail),
  })
  return { query, detail: query.data, refused: refused && taskId !== undefined }
}
