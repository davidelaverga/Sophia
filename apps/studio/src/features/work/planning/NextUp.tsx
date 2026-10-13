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
}

/**
 * The focus is where the answer left it: the page's body, or the choice it disabled. Anywhere else in the decisions
 * (another decision's choice) is where the person moved to meanwhile, and stays theirs (Codex P2 on #263).
 */
const leftByAnswer = (at: Element | null) => at === document.body || (at?.matches(':disabled') ?? false)

export function NextUp({ next, onGo, onDone }: Props) {
  const press = useRef<HTMLButtonElement>(null)
  const said = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (leftByAnswer(document.activeElement)) (press.current ?? said.current)?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [next.words])
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
