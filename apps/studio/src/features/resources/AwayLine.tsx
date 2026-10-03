// What changed since the viewer last looked, in one line from Sophia's light, with Mark seen: on the plan's board and
// in Resources alike (LFE-07.1, LFE-06.7). Nothing to say, nothing shown. The line is cut to fit; pressing it shows
// all of it, the counted rest included, so nothing is reachable only by hovering (WBC-01 G5).
import { useState } from 'react'

export interface Away {
  phrases: string[]
  more: number
  /** The counted rest, in full, when the caller keeps it. */
  rest?: string[]
}

interface Props {
  away: Away
  onSeen: () => void
  /** Where it sits: the board's bar or Resources' head. */
  className?: string
}

export function AwayLine({ away, onSeen, className }: Props) {
  const [open, setOpen] = useState(false)
  if (away.phrases.length === 0) return null
  const all = open ? [...away.phrases, ...(away.rest ?? [])] : away.phrases
  const counted = away.more > 0 && !(open && away.rest)
  const said = all.join(' · ') + (counted ? ` · and ${String(away.more)} more` : '')
  return (
    <p className={className ? `away-line ${className}` : 'away-line'} data-open={open || undefined} role="status">
      <span className="ask-light" aria-hidden />
      <button type="button" className="away-line-said" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="field-label">While you were away</span> {said}
      </button>
      <button type="button" className="away-line-seen" onClick={onSeen}>
        Mark seen
      </button>
    </p>
  )
}
