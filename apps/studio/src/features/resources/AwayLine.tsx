// What changed since the viewer last looked, in one line from Sophia's light, with Mark seen: on the plan's board and
// in Resources alike (LFE-07.1, LFE-06.7). Nothing to say, nothing shown.
export interface Away {
  phrases: string[]
  more: number
}

interface Props {
  away: Away
  onSeen: () => void
  /** Where it sits: the board's bar or Resources' head. */
  className?: string
}

export function AwayLine({ away, onSeen, className }: Props) {
  if (away.phrases.length === 0) return null
  const said = away.phrases.join(' · ') + (away.more > 0 ? ` · and ${String(away.more)} more` : '')
  return (
    <p className={className ? `away-line ${className}` : 'away-line'} title={said} role="status">
      <span className="ask-light" aria-hidden />
      <span className="away-line-said">
        <span className="field-label">While you were away</span> {said}
      </span>
      <button type="button" className="away-line-seen" onClick={onSeen}>
        Mark seen
      </button>
    </p>
  )
}
