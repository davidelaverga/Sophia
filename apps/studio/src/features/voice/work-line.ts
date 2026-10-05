// What Sophia's line says she is doing (docs/plans/room-work-line.md): with one native task the only work running, its
// note names it from the task's record (Studio's words, counts from the record, never the question's text). Pure, so
// the rules are unit-tested; useWorkWords reads the record as Work's card does.
import type { NativeTask, NativeTaskDetail, Snapshot } from '@sophia/contracts'
import { runningWork, WORKING_PHASES } from './room-view.ts'

/** The native task her line can speak of: the only work running. Two pieces, or a goal without a task: none. */
export function soleTask(snapshot: Pick<Snapshot, 'goals' | 'work'> | undefined): NativeTask | null {
  if (!snapshot || runningWork(snapshot) !== 1) return null
  const running = snapshot.work.filter((t) => WORKING_PHASES.has(t.phase))
  return running.length === 1 ? (running[0] ?? null) : null
}

/** The phases in which she is actually at it: queued, held or stopping, the count says it, as before. */
const DOING: ReadonlySet<NativeTask['phase']> = new Set(['dispatched', 'running'])

/** Whether the task's record says more than its kind: a research task at it, whose reads count. */
export const readsCount = (task: Pick<NativeTask, 'kind' | 'phase'> | null) =>
  task?.kind === 'research' && DOING.has(task.phase)

/** What she is doing, in her line's note; null when she isn't at it (queued, held, stopping). */
export function workWords(
  task: Pick<NativeTask, 'kind' | 'phase'>,
  detail: NativeTaskDetail | undefined,
): string | null {
  if (!DOING.has(task.phase)) return null
  if (task.kind === 'draft_brief') return 'Drafting the brief'
  const read = detail?.research?.reads.used ?? 0
  if (read === 0) return 'Researching'
  return `Researching · ${String(read)} ${read === 1 ? 'source' : 'sources'} read`
}
