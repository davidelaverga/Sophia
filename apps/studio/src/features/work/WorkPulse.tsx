// renderPulse → WorkPulse (frontend bindings): what changed in the project, from the SSE feed.
// Quiet by design; no percent-complete, no invented progress, no sequence numbers. Repeats close together
// fold into one row with a count (pulse.ts).
import { useEffect, useState } from 'react'
import type { Event as ProjectEvent } from '@sophia/contracts'
import { isCursorAdvance } from '@sophia/contracts/validate'
import type { Feed } from '../../projectors/projection.ts'
import type { Connection } from '../studio/useProjectFeed.ts'
import { pulseRows } from './pulse.ts'
import { ago as agoWords } from '../../app/time-words.ts'

/** When it happened, to the second while fresh (app/time-words.ts). */
const ago = (iso: string, now: number) => agoWords(iso, now, { seconds: true })

/** Nothing to show yet: say why, in the connection's own terms. */
const QUIET: Record<Connection, string> = {
  connecting: 'Connecting to the project…',
  live: 'Nothing new yet.',
  reconnecting: 'Reconnecting…',
  resyncing: 'Catching up…',
  denied: 'You can’t see this project’s activity.',
}

export function WorkPulse({ feed, connection }: { feed: Feed | null; connection: Connection }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const items = feed?.recent ?? []
  // Changes this person may not see stay private: one honest line for all of them, not a row each.
  const events = items.filter((f): f is ProjectEvent => !isCursorAdvance(f))
  const hidden = items.length - events.length
  return (
    <aside className="pulse" aria-labelledby="pulse-title">
      <div className="pulse-head">
        <h4 id="pulse-title">Work pulse</h4>
      </div>
      {items.length === 0 ? (
        <p className="empty">{QUIET[connection]}</p>
      ) : (
        <ol className="events">
          {pulseRows(events).map((row) => (
            <li key={row.key} className="event">
              <span className="dot" aria-hidden />
              <span>
                {row.label}
                {row.count > 1 && <span className="event-count"> ×{row.count}</span>}
              </span>
              <span className="muted">{ago(row.at, now)}</span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="event hidden-event">
              <span className="dot" aria-hidden />
              <span>
                {hidden} {hidden === 1 ? 'change' : 'changes'} you can’t see
              </span>
            </li>
          )}
        </ol>
      )}
    </aside>
  )
}
