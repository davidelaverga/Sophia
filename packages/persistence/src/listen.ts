import type pg from 'pg'

/** Channel notified on commit of every project_events insert (db/migrations/0005). Payload: project UUID. */
export const PROJECT_EVENTS_CHANNEL = 'sophia_project_events'

/**
 * Hold one pooled connection in LISTEN and call `onProject(projectId)` after each committed event.
 * Notifications carry no content; subscribers re-read under their own actor. Returns a stop function.
 */
export async function listenForProjectEvents(
  pool: pg.Pool,
  onProject: (projectId: string) => void,
  onError: (err: Error) => void,
): Promise<() => Promise<void>> {
  const client = await pool.connect()
  const handler = (msg: pg.Notification) => {
    if (msg.channel === PROJECT_EVENTS_CHANNEL && msg.payload) onProject(msg.payload)
  }
  client.on('notification', handler)
  client.on('error', onError)
  await client.query(`LISTEN ${PROJECT_EVENTS_CHANNEL}`)
  return async () => {
    client.off('notification', handler)
    await client.query(`UNLISTEN ${PROJECT_EVENTS_CHANNEL}`).catch(() => undefined)
    client.release()
  }
}
