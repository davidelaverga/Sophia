// The words Sophia's line says of her work (work-line.ts), from the task's record read as Work's card reads it: the
// same query key, so they share one cache. Each keeps its own 15 s timer (TanStack), so with a Work card mounted too
// the record may be read twice in 15 s; a brief, whose words need no record, is never read. Nor is it read while her
// line isn't there to say it: under a video stage, or in a room kept out of sight.

import { useOwnedTaskDetail } from '../artifacts/task-detail.ts'
import { useContext } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { ShortcutScope } from '../../app/shortcuts.ts'
import { readsCount, soleTask, workWords } from './work-line.ts'

const EVERY = 15_000

/** What she is doing, when one task of hers is the only work; null otherwise (the count says it then). */
export function useWorkWords(
  snapshot: Snapshot | undefined,
  projectId: string,
  identity: Identity,
  lineShown: boolean,
): string | null {
  const inSight = useContext(ShortcutScope)
  const task = soleTask(snapshot)
  const read = readsCount(task) && lineShown && inSight
  // The same key as WorkCard's: the same owned task read, and withheld while the task is refused.
  const { detail } = useOwnedTaskDetail({
    queryKey: ['native-task', projectId, task?.id, task?.phase, task?.resultSourceId, identity.name],
    projectId,
    taskId: task?.id,
    identity,
    enabled: read,
    refetchInterval: read ? EVERY : false,
  })
  return task ? workWords(task, detail) : null
}
