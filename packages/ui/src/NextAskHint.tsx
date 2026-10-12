// The next ask's key cap (docs/plans/next-ask.md): «Tab» in the field, beside the suggestion its placeholder shows; its tip
// says why the suggestion is there, and a description the field points to (`aria-describedby` = `id`) says it to a
// screen reader with what Tab and Escape do. The field handles the keys (`nextAskKey`).
import { Tip } from './Tip.tsx'

export interface NextAskHintProps {
  /** The description's id, for the field's `aria-describedby`. */
  id: string
  /** The suggestion, as the placeholder shows it. */
  words: string
  /** Why it is suggested, in words: «Because it is proposed and not decided». */
  why: string
}

export function NextAskHint({ id, words, why }: NextAskHintProps) {
  return (
    <span className="next-ask has-tip">
      <kbd aria-hidden>Tab</kbd>
      <Tip label={why} align="end" />
      <span id={id} className="sr-only">
        Suggested: {words}. Tab puts it in the field; Escape puts it away.
      </span>
    </span>
  )
}
