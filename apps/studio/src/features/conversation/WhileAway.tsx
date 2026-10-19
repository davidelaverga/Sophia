// What came while the tab was hidden, marked in the room's chat (docs/plans/messages-while-away.md, costuras seam #10):
// a divider above the first message that came, and, while that divider is out of the chat's view and not yet reached,
// a line at the chat's head with Jump. The project's shell keeps what came (unread-title.ts), past a visit to another
// view; once the divider has been wholly in view, or the person sends something, it is behind them.
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry } from '@sophia/contracts'
import { awayWords, CameWhileAway, dividerAt, type Away } from './unread-title.ts'

/** Where the history's divider is found: the room's chat of a call kept out of sight may be on the page too. */
const DIVIDER = '.while-away-divider'

const NOTHING = () => undefined

/** The divider: above which message of the discussion, and its words. */
export interface AwayMark {
  id: string
  words: string
}

/** The divider, where the first message that came starts: what happened, between two hairlines. Jump focuses it. */
export function AwayDivider({ words }: { words: string }) {
  return (
    <span className="while-away-divider" tabIndex={-1}>
      {words}
    </span>
  )
}

/** At the chat's head while the divider is out of view: how many came, and Jump. A status: it never takes the focus. */
function AwayLine({ count, onJump }: { count: number; onJump: () => void }) {
  return (
    <p className="while-away-line" role="status">
      {awayWords(count)}.{' '}
      <button type="button" className="text-button" onClick={onJump}>
        {count === 1 ? 'Jump to it' : 'Jump to the first'}
      </button>
    </p>
  )
}

/** Whether the divider lies wholly in the history's view; null while the history isn't drawn (the panel closed). */
function dividerSeen(history: HTMLElement): boolean | null {
  const divider = history.querySelector(DIVIDER)
  if (!divider || history.getClientRects().length === 0) return null
  const box = history.getBoundingClientRect()
  const at = divider.getBoundingClientRect()
  return at.top >= box.top - 1 && at.bottom <= box.bottom + 1
}

interface History {
  history: RefObject<HTMLDivElement | null>
  /** The reader follows the newest line (Conversation's useFollowing). */
  following: RefObject<boolean>
}

/**
 * The absence whose divider is out of view, measured as it is drawn, as the history opens and as it scrolls; seen
 * wholly in view, it is reached. Drawn while the reader follows the newest line, the history keeps to the bottom.
 */
function useFarFrom({ history, following }: History, open: string | null, reach: (first: string) => void) {
  const [far, setFar] = useState<string | null>(null)
  const check = useCallback(() => {
    const seen = history.current && open ? dividerSeen(history.current) : null
    if (seen === null || !open) return
    setFar(seen ? null : open)
    if (seen) reach(open)
  }, [history, open, reach])
  useLayoutEffect(() => {
    const el = history.current
    if (el && open && following.current) el.scrollTop = el.scrollHeight
    check()
  }, [history, following, open, check])
  useEffect(() => {
    const el = history.current
    if (!el || !open) return undefined
    // After the history's own observer (useFollowOnResize), made first: an opening panel is at its newest line here.
    const observer = new ResizeObserver(check)
    observer.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [history, open, check])
  return far !== null && far === open
}

/** The line leaving moves the history up: what the reader sees stays where it was on screen. */
function useSteadyHistory(history: RefObject<HTMLDivElement | null>, lined: boolean) {
  const top = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = history.current
    if (!el) return
    const now = el.getBoundingClientRect().top
    if (!lined && top.current !== null) el.scrollTop -= top.current - now
    top.current = lined ? now : null
  }, [history, lined])
}

/**
 * The divider, above the first drawn of what came, with how many came and, while the divider is still to be reached,
 * the absence it marks, named by its first message; null while nothing came or none of it is drawn.
 */
function markOf(away: Away | null, entries: readonly DiscussionEntry[]) {
  const id = dividerAt(away, entries)
  if (!away || !id) return null
  const count = away.ids.length
  return { id, words: awayWords(count), count, open: away.reached ? null : (away.ids[0] ?? null) }
}

/**
 * The chat's mark of what came while away: the divider above the first drawn of it, the line while that divider is out
 * of view, and what sending tells the shell.
 */
export function useWhileAway(scroll: History, entries: readonly DiscussionEntry[]) {
  const whileAway = useContext(CameWhileAway)
  const mark = markOf(whileAway?.away ?? null, entries)
  const open = mark?.open ?? null
  const reach = whileAway?.reach ?? NOTHING
  const lined = useFarFrom(scroll, open, reach)
  useSteadyHistory(scroll.history, lined)
  const jump = () => {
    const divider = scroll.history.current?.querySelector<HTMLElement>(DIVIDER)
    divider?.scrollIntoView({ block: 'start' })
    divider?.focus({ preventScroll: true })
    if (open) reach(open)
  }
  return {
    divider: mark,
    line: lined && mark ? <AwayLine count={mark.count} onJump={jump} /> : null,
    sent: whileAway?.sent,
  }
}
