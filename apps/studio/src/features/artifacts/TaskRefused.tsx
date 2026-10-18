// A task refused to this person (task-detail-read.ts), said where it was, with one bounded way to read it again: Try
// again sets out the task's own GET (created if no reader holds it), stamped as every task read is. No automatic retry.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { taskQueryOf, taskRead } from './task-detail-read.ts'

export function TaskRefused({
  projectId,
  taskId,
  identity,
}: {
  projectId: string
  taskId: string
  identity: Identity
}) {
  const client = useQueryClient()
  const [reading, setReading] = useState(false)
  const again = () => {
    if (reading) return
    setReading(true)
    // The task's own readers read again (so what shows is the fresh answer); with none, one task GET is set out.
    const ofTask = taskQueryOf(projectId, taskId)
    const read =
      client.getQueryCache().findAll({ predicate: ofTask }).length > 0
        ? client.refetchQueries({ predicate: ofTask })
        : client.fetchQuery({
            queryKey: ['native-task', projectId, taskId, 'again', identity.name],
            queryFn: taskRead(projectId, taskId, () => getNativeTask(identity.token, projectId, taskId)),
            staleTime: 0,
          })
    void read.catch(() => undefined).finally(() => setReading(false))
  }
  return (
    <p className="goal-outcome" role="status">
      This task isn’t available to you.{' '}
      <button type="button" className="text-button" aria-disabled={reading || undefined} onClick={again}>
        Try again
      </button>
    </p>
  )
}
