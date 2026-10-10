// The opening's work from React (docs/plans/entry-opening.md): the session known, Home's own reads settled, the
// person's likeliest projects warmed; then it hands off. A screen that reads nothing first (the sign-in after a link
// that failed, a link's question, the join page) is ready once drawn with its own face of the font.
import { useLayoutEffect, useRef } from 'react'
import type { AuthState } from './auth.ts'
import { PREPARE_AT_MOST_MS } from './entry-progress.ts'
import { cover, open, reach } from './entry.ts'

/** The font's own face, or this long at most: the first screen never waits on it longer. */
const FONT_AT_MOST_MS = 600

export const nextFrames = (then: () => void) => {
  let id = requestAnimationFrame(() => (id = requestAnimationFrame(then)))
  return () => cancelAnimationFrame(id)
}

export const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Signed in from this very tab (its code, its passkey): the person is looking at it. A session that arrives from
 * another tab (the email's link opened there) lands without an opening: they saw theirs in that tab, once.
 */
const signedInHere = () => document.visibilityState === 'visible' && document.hasFocus()

/**
 * The session's step, and readiness for a screen that reads nothing first. Signed in from the page itself (a code, a
 * passkey, a dev identity), the opening covers it, before that frame is painted, until the Studio is ready.
 */
export function useOpening(status: AuthState['status'], preparesStudio: boolean): void {
  const was = useRef(status)
  useLayoutEffect(() => {
    const before = was.current
    was.current = status
    if (status === 'loading') return undefined
    const fromHere = before !== 'loading' && before !== 'signed_in' && signedInHere()
    if (status === 'signed_in' && preparesStudio && fromHere) cover()
    if (status === 'signed_in') reach('session')
    if (preparesStudio) {
      const timer = setTimeout(() => void open(), PREPARE_AT_MOST_MS)
      return () => clearTimeout(timer)
    }
    let stop = () => undefined as void
    const faced = Promise.race([document.fonts.ready, wait(FONT_AT_MOST_MS)])
    let live = true
    // Anything but the Studio (a link that failed, a link's question, the join page): a short fade, nothing more.
    void faced.then(() => {
      if (live) stop = nextFrames(() => void open(true))
    })
    return () => {
      live = false
      stop()
    }
  }, [status, preparesStudio])
}
