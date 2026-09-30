// A wait that goes on says so. After a few seconds without an answer, a screen adds one line: it is still working,
// and the first answer after an idle spell can take up to a minute (a hosted API may have to start first).
import { useEffect, useState } from 'react'

/** A wait shorter than this needs no words. */
export const SLOW_AFTER_MS = 6000

export const SLOW_NOTE = 'Taking longer than usual. After a quiet spell, the first answer can take up to a minute.'

/** True once `waiting` has lasted `after` ms without a break, and false again as soon as the wait ends. */
export function useSlow(waiting: boolean, after = SLOW_AFTER_MS): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!waiting) return undefined
    const timer = setTimeout(() => setSlow(true), after)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [waiting, after])
  return waiting && slow
}
