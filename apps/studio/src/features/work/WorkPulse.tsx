// renderPulse → WorkPulse (frontend bindings): what changed in the project, from the SSE feed.
// Quiet by design; no percent-complete, no invented progress.
import { useEffect, useState } from 'react'
import { isCursorAdvance } from '@sophia/contracts/validate'
import type { Feed } from '../../projectors/projection.ts'
import type { Connection } from '../studio/useProjectFeed.ts'
import { SUMMARY } from './labels.ts'

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function WorkPulse({ feed, connection }: { feed: Feed | null; connection: Connection }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const items = feed?.recent ?? []
  return (
    <aside className="pulse" aria-labelledby="pulse-title">
      <div className="pulse-head">
        <h4 id="pulse-title">Work pulse</h4>
        {feed && (
          <span className="mono muted" title="Last applied event">
            #{feed.cursor}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="empty">
          {connection === 'live'
            ? 'Quiet. New requests appear here as they’re admitted.'
            : 'Waiting for the project stream…'}
        </p>
      ) : (
        <ol className="events">
          {items.map((f) =>
            isCursorAdvance(f) ? (
              <li key={`adv-${f.sequence}`} className="event hidden-event">
                <span className="dot" aria-hidden />
                <span>Private update</span>
                <span className="mono muted">#{f.sequence}</span>
              </li>
            ) : (
              <li key={f.eventId} className="event">
                <span className="dot" aria-hidden />
                <span>{SUMMARY[f.summaryCode] ?? f.type}</span>
                <span className="muted">{ago(f.occurredAt, now)}</span>
                <span className="mono muted">#{f.sequence}</span>
              </li>
            ),
          )}
        </ol>
      )}
    </aside>
  )
}
