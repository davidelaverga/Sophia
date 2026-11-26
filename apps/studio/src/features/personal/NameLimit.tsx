// A project name's field with its limit in sight (docs/plans/words-whole.md): held to the most characters as the API
// counts them (useCapped), its count under it as it comes near, and a polite line when a paste didn't all fit.
import { useState } from 'react'
import { cutWords, nameCount } from './name-limit.ts'
import { useCapped } from './useCapped.ts'

/** The field's handlers and description, and the line to put under it. */
export function useNameLimit(id: string, most: number, value: string, set: (next: string) => void) {
  const [cut, setCut] = useState(false)
  const capping = useCapped(most, value, set, setCut)
  const count = nameCount(value, most)
  const noteId = `${id}-limit`
  const shown = count !== null || cut
  return {
    input: { ...capping, 'aria-describedby': shown ? noteId : undefined },
    note: (
      // The cut is said once as it comes, politely, from a part mounted all along; the count is read with the field
      // (its description), never announced at every key.
      <p id={noteId} className="field-limit">
        <span aria-live="polite">{cut ? cutWords(most) : ''}</span>
        {count && <span className="field-limit-count">{count}</span>}
      </p>
    ),
  }
}
