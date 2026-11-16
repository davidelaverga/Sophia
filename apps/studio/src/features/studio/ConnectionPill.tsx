// The header's word on the project feed (docs/plans/up-to-date-checked.md): whether the view is current, and, up to
// date, when the feed last heard from the project, in the app's words for a live reading (time-words.ts). The time is
// read as the pointer comes onto the pill: nothing re-renders every second for it.
import { useState } from 'react'
import { ago } from '../../app/time-words.ts'
import type { Connection } from './useProjectFeed.ts'

/** The project feed, not the call: "Live" read as a call in progress, so it says whether the view is current. */
const CONNECTION: Record<Connection, string> = {
  connecting: 'Connecting',
  live: 'Up to date',
  reconnecting: 'Reconnecting',
  resyncing: 'Catching up',
  denied: 'No access',
}

/** «Up to date · checked 6 s ago» once the feed has heard from the project; every other state says only its word. */
function connectionHelp(connection: Connection, checkedAt: number | null, now: number): string {
  if (connection !== 'live' || checkedAt === null) return CONNECTION[connection]
  return `${CONNECTION.live} · checked ${ago(new Date(checkedAt).toISOString(), now, { seconds: true })}`
}

interface Props {
  connection: Connection
  /** When the stream last brought bytes (useProjectFeed), or null before it has. */
  checkedAt: () => number | null
}

export function ConnectionPill({ connection, checkedAt }: Props) {
  // When the pointer last came onto the pill: the help is said as of then.
  const [askedAt, setAskedAt] = useState<number | null>(null)
  return (
    <span
      role="status"
      className="connection"
      data-state={connection}
      title={askedAt === null ? CONNECTION[connection] : connectionHelp(connection, checkedAt(), askedAt)}
      onPointerEnter={() => setAskedAt(Date.now())}
    >
      <span className="connection-dot" aria-hidden />
      <span className="connection-label">{CONNECTION[connection]}</span>
    </span>
  )
}
