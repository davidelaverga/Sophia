// A text field held to its most characters (characters.ts: capped), as maxLength held it but counted as the API
// counts. While an input method composes its words are left alone; once it is done, they are held against the value
// the composition began from, so text already there is never the one cut.
import { useRef, type ChangeEvent, type CompositionEvent } from 'react'
import { capped } from './characters.ts'

type Field = HTMLInputElement | HTMLTextAreaElement

export function useCapped(most: number, value: string, set: (next: string) => void) {
  const before = useRef(value)
  return {
    onChange: (e: ChangeEvent<Field>) => {
      const next = e.target.value
      set(e.nativeEvent instanceof InputEvent && e.nativeEvent.isComposing ? next : capped(value, next, most))
    },
    onCompositionStart: () => {
      before.current = value
    },
    onCompositionEnd: (e: CompositionEvent<Field>) => set(capped(before.current, e.currentTarget.value, most)),
  }
}
