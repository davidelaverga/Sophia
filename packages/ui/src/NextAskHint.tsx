// The next ask's key cap (docs/plans/next-ask.md): «Tab» in the field, beside what Tab would do (the suggestion its
// placeholder shows, or asking Sophia a question written; docs/plans/question-asks.md); its tip says why, and a
// description the field points to (`aria-describedby` = `id`) says it to a screen reader with what the keys do. The
// field handles the keys (`nextAskKey`, `questionKey`).
import { Tip } from './Tip.tsx'

export interface NextAskHintProps {
  /** The description's id, for the field's `aria-describedby`. */
  id: string
  /** What Tab does, for a screen reader: «Suggested: Sum it up. Tab puts it in the field; Escape puts it away.» */
  description: string
  /** Why, in words, for the tip: «Because it is proposed and not decided». */
  why: string
}

export function NextAskHint({ id, description, why }: NextAskHintProps) {
  return (
    <span className="next-ask has-tip">
      <kbd aria-hidden>Tab</kbd>
      <Tip label={why} align="end" />
      {/* Why, too: the tip is the pointer's; the field's description is the keyboard's and the screen reader's (Codex on
          #262). */}
      <span id={id} className="sr-only">
        {description} {why}.
      </span>
    </span>
  )
}
