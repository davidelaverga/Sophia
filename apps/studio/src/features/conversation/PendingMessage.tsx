// Messages to the room on their way, drawn at the end of the discussion before the server answers (chat-pace.md):
// dimmed while one goes; where its reply was lost, or it was refused with other words in the bar, the row says so and
// offers Try again (not while offline: the line above the bar says what waits). A row goes the moment the discussion
// holds its message (pendingOf), so nothing is drawn twice.
import { useEffect, useRef } from 'react'
import { RichText } from '../../app/RichText.tsx'
import { PENDING_WORDS, type Pending } from './pending-message.ts'

export interface PendingRow {
  key: string
  pending: Pending
  onRetry: () => void
}

export function PendingMessages({ rows, offline }: { rows: readonly PendingRow[]; offline: boolean }) {
  if (rows.length === 0) return null
  return (
    <ol className="discussion discussion-pending" aria-label="Your message on its way">
      {rows.map((row) => (
        <Row key={row.key} row={row} offline={offline} />
      ))}
    </ol>
  )
}

function Row({ row: { pending, onRetry }, offline }: { row: PendingRow; offline: boolean }) {
  const line = useRef<HTMLLIElement>(null)
  // In sight as it comes, as a sent message is: the discussion follows its end.
  useEffect(() => {
    // Braces: Chromium's scrollIntoView may return a promise, which an effect must never return.
    line.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  const words = PENDING_WORDS[pending.status]
  const again = !offline && (pending.status === 'unknown' || pending.status === 'failed')
  return (
    <li ref={line} className="contribution" data-pending={pending.status} aria-busy={pending.status === 'sending'}>
      <span className="contribution-author">You</span>
      <span className="contribution-text">
        <RichText text={pending.text} />
      </span>
      {words && (
        <span className="contribution-pending">
          {words}
          {again && (
            <>
              {' '}
              <button type="button" className="text-button" onClick={onRetry}>
                Try again
              </button>
            </>
          )}
        </span>
      )}
    </li>
  )
}
