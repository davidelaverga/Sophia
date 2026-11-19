// The header's word on the project feed (docs/plans/up-to-date-checked.md): whether the view is current, and, up to
// date, when the feed last heard from the project, in the app's words for a live reading (time-words.ts). The time is
// read as the pointer or the keyboard's focus comes onto the pill: nothing re-renders every second for it. The help is
// the kit's tip, shown on hover and on keyboard focus, and the pill's description (hand-and-sync-announced.md).
import { useId, useRef, useState } from 'react'
import { Tip } from '@sophia/ui'
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

type Asker = 'pointer' | 'focus'

/**
 * When the pill was last asked for its help: as the pointer or the focus came onto it; null once both have gone, so
 * the next one reads the time anew.
 */
function useAskedAt() {
  const [askedAt, setAskedAt] = useState<number | null>(null)
  const on = useRef<Record<Asker, boolean>>({ pointer: false, focus: false })
  const arrive = (by: Asker) => {
    on.current[by] = true
    setAskedAt(Date.now())
  }
  const go = (by: Asker) => {
    on.current[by] = false
    if (!on.current.pointer && !on.current.focus) setAskedAt(null)
  }
  return {
    askedAt,
    handlers: {
      onPointerEnter: () => arrive('pointer'),
      onPointerLeave: () => go('pointer'),
      onFocus: () => arrive('focus'),
      onBlur: () => go('focus'),
    },
  }
}

export function ConnectionPill({ connection, checkedAt }: Props) {
  const { askedAt, handlers } = useAskedAt()
  const helpId = useId()
  const help = askedAt === null ? CONNECTION[connection] : connectionHelp(connection, checkedAt(), askedAt)
  return (
    <span
      role="status"
      className="connection has-tip"
      data-state={connection}
      // Reached by keyboard: its help is read as the focus arrives, as the pointer's is on hover.
      tabIndex={0}
      aria-describedby={helpId}
      {...handlers}
    >
      <span className="connection-dot" aria-hidden />
      <span className="connection-label">{CONNECTION[connection]}</span>
      <Tip id={helpId} label={help} side="bottom" align="end" />
    </span>
  )
}
