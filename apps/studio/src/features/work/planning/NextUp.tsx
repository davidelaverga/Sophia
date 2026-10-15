// Next up (docs/plans/next-up.md): one line under the board's bar once the viewer answers a decision, naming what waits on
// them next, a press that goes there. It takes the focus as the answer goes (from the page's body, where a disabled
// choice leaves it, or from inside the decisions), never from somewhere the person moved to meanwhile. With nothing
// next it says so, holds the focus, and leaves when the focus does.
import { useEffect, useRef } from 'react'
import { Icon } from '@sophia/ui'
import type { NextUp as Next } from './next-up.ts'

interface Props {
  next: Next
  /** Goes where the line names. */
  onGo: () => void
  /** The line has served (nothing next, the focus gone). */
  onDone: () => void
  /** The choice the answer went from: the focus is taken from it (or from the page), never from another. */
  from: Element | null
}

/**
 * The focus is where the answer left it: the page's body, or the very choice it went from. Anywhere else, another
 * decision's choice included, disabled by its own answer or not, is where the person moved to meanwhile, and stays
 * theirs (Codex on #263 and #277).
 */
const leftByAnswer = (at: Element | null, from: Element | null) => at === document.body || (at !== null && at === from)

export function NextUp({ next, from, onGo, onDone }: Props) {
  const press = useRef<HTMLButtonElement>(null)
  const said = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (leftByAnswer(document.activeElement, from)) (press.current ?? said.current)?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [next.words, from])
  if (next.kind === 'none')
    return (
      <p ref={said} className="next-up" role="status" tabIndex={-1} onBlur={onDone}>
        {next.words}
      </p>
    )
  return (
    <p className="next-up" role="status">
      <button ref={press} type="button" className="text-button" onClick={onGo}>
        {next.words}
        <Icon name="forward" size={12} />
      </button>
    </p>
  )
}
