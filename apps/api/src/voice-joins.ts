// The canonical exchange of a voice-created task (A15, migration 0046), served only by an API with voice qualification
// on: the Lab joins a voice step to the task it created, and through the task to its output; and, on a task's detail,
// the sources it drew on that are withdrawn now, which the Lab joins to the note it forgot. Off, nothing is read of 0046
// and every task reads exactly as before.
import type pg from 'pg'
import type { NativeTask, NativeTaskDetail } from '@sophia/contracts'
import { readTaskExchanges, readWithdrawnSources } from '@sophia/persistence'

/** The tasks, each with the exchange a voice tool call created it in when one did. Inside the read's transaction. */
export async function withExchanges(
  c: pg.PoolClient,
  projectId: string,
  tasks: readonly NativeTask[],
): Promise<NativeTask[]> {
  const exchanges = await readTaskExchanges(
    c,
    projectId,
    tasks.map((t) => t.id),
  )
  return tasks.map((t) => {
    const exchangeId = exchanges.get(t.id)
    return exchangeId === undefined ? t : { ...t, exchangeId }
  })
}

/**
 * A task's detail with its exchange, and for a research, design or review task the sources it drew on that are withdrawn
 * now (withdrawnSourceIds, computed live). Inside the read's transaction, after the detail found the task visible.
 */
export async function withVoiceJoins(
  c: pg.PoolClient,
  projectId: string,
  detail: NativeTaskDetail,
): Promise<NativeTaskDetail> {
  const [task] = await withExchanges(c, projectId, [detail.task])
  const withdrawn = await readWithdrawnSources(c, projectId, detail.task.id)
  return {
    ...detail,
    ...(task ? { task } : {}),
    ...(withdrawn === null ? {} : { withdrawnSourceIds: withdrawn }),
  }
}
