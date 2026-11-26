// A text field held to its most characters (characters.ts: capped), as maxLength held it but counted as the API
// counts. While an input method composes its words are left alone; once it is done, they are held against the value
// the composition began from, so text already there is never the one cut. `onCut` hears whether what was put in all
// fit, so the field can say so (name-limit.ts).
import { useRef, type ChangeEvent, type CompositionEvent } from 'react'
import { capped } from './characters.ts'

type Field = HTMLInputElement | HTMLTextAreaElement

export function useCapped(most: number, value: string, set: (next: string) => void, onCut?: (cut: boolean) => void) {
  const before = useRef(value)
  const held = (previous: string, next: string) => {
    const kept = capped(previous, next, most)
    onCut?.(kept !== next)
    set(kept)
  }
  return {
    onChange: (e: ChangeEvent<Field>) => {
      const next = e.target.value
      if (e.nativeEvent instanceof InputEvent && e.nativeEvent.isComposing) set(next)
      else held(value, next)
    },
    onCompositionStart: () => {
      before.current = value
    },
    onCompositionEnd: (e: CompositionEvent<Field>) => held(before.current, e.currentTarget.value),
  }
}
