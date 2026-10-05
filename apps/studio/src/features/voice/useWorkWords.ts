// The words Sophia's line says of her work (work-line.ts), from the task's record read as Work's card reads it: the
// same query key, so a Work card and the room share one read; again every 15 s while the task runs.
import { useQuery } from '@tanstack/react-query'
import type { Snapshot } from '@sophia/contracts'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { soleTask, workWords } from './work-line.ts'

const EVERY = 15_000

/** What she is doing, when one task of hers is the only work; null otherwise (the count says it then). */
export function useWorkWords(snapshot: Snapshot | undefined, projectId: string, identity: Identity): string | null {
  const task = soleTask(snapshot)
  const detail = useQuery({
    queryKey: ['native-task', projectId, task?.id, task?.phase, task?.resultSourceId, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, task?.id ?? ''),
    enabled: !!task,
    refetchInterval: task ? EVERY : false,
  }).data
  return task ? workWords(task, detail) : null
}
