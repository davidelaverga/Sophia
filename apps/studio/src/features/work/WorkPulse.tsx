// renderPulse → WorkPulse (frontend bindings): what changed in the project, from the SSE feed.
// Quiet by design; no percent-complete, no invented progress, no sequence numbers.
import { useEffect, useState } from 'react'
import type { Event as ProjectEvent } from '@sophia/contracts'
import { isCursorAdvance } from '@sophia/contracts/validate'
import type { Feed } from '../../projectors/projection.ts'
import type { Connection } from '../studio/useProjectFeed.ts'
import { summaryLabel } from './labels.ts'

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

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
          {events.map((f) => (
            <li key={f.eventId} className="event">
              <span className="dot" aria-hidden />
              <span>{summaryLabel(f.summaryCode, f.type)}</span>
              <span className="muted">{ago(f.occurredAt, now)}</span>
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
