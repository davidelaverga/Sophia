// Finding in the conversation (personal-moments.md §3): Ctrl or ⌘ F while Personal is in sight, or Find in its head,
// opens a line under the head. The turns mark what matches, the current match in sight; Enter goes on, Shift Enter
// back, round at either end; Esc closes it and gives the focus back to where it was. It looks in what is read, and
// "Look further back" reads earlier days.
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import { keyLabel, onMac, useShortcuts } from '../../app/shortcuts.ts'
import type { Row } from './conversation-view.ts'
import { focusConversation, focusSoon } from './focus.ts'
import { useEscape } from './useEscape.ts'
import { foundIn, pieces, type Found } from './find-view.ts'

/** What the turns mark: the query, and the match that is current. */
export interface Lens {
  query: string
  current: Found | null
}

export const FindLens = createContext<Lens | null>(null)

/** How the find key reads in a tip: Ctrl+F, or ⌘F on a Mac. */
export const FIND_KEYS = keyLabel('mod+f', onMac)

/** A turn's words, what matches the lens marked, the current match set apart. */
export function Marked({ rowKey, text }: { rowKey: string; text: string }) {
  const lens = useContext(FindLens)
  if (!lens) return text
  return pieces(text, lens.query).map((p, i) => {
    if (p.n === null) return <Fragment key={i}>{p.text}</Fragment>
    const current = lens.current?.key === rowKey && lens.current.n === p.n
    return (
      <mark key={i} className={current ? 'current' : undefined}>
        {p.text}
      </mark>
    )
  })
}

interface BarProps {
  query: string
  count: number
  at: number
  more: boolean
  onQuery: (query: string) => void
  onStep: (by: 1 | -1) => void
  onMore: () => void
  onClose: () => void
}

function FindBar({ query, count, at, more, onQuery, onStep, onMore, onClose }: BarProps) {
  const said = !query.trim() ? '' : count ? `${String(at + 1)} of ${String(count)}` : 'No match'
  return (
    <div className="c3-find" role="search" aria-label="Find in your conversation">
      <div className="field quiet">
        <input
          id="c-find"
          type="search"
          aria-label="Find in your conversation"
          aria-keyshortcuts={onMac ? 'Meta+F' : 'Control+F'}
          placeholder="Find in your conversation"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          // Enter steps (Esc is the find line's layer, useEscape, wherever the focus is in it).
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            e.preventDefault()
            onStep(e.shiftKey ? -1 : 1)
          }}
        />
      </div>
      <span className="c3-find-count" aria-live="polite">
        {said}
      </span>
      <button className="ghost" type="button" aria-label="Previous match" disabled={!count} onClick={() => onStep(-1)}>
        ↑
      </button>
      <button className="ghost" type="button" aria-label="Next match" disabled={!count} onClick={() => onStep(1)}>
        ↓
      </button>
      {more && (
        <button className="text-button" type="button" onClick={onMore}>
          Look further back
        </button>
      )}
      <button className="ghost has-tip" type="button" aria-label="Close find" onClick={onClose}>
        <Icon name="close" />
        <Tip label="Close" keys="Esc" side="bottom" align="end" />
      </button>
    </div>
  )
}

/** The element the focus was on, unless it was nowhere (the page itself). */
const focused = () =>
  document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null

const sameAs = (a: Found | null) => (b: Found) => a?.key === b.key && a.n === b.n

/** The focus back where it was, if that is still on the page; else the conversation. */
function giveBack(to: HTMLElement | null): void {
  if (to?.isConnected) to.focus({ preventScroll: true })
  else focusConversation()
}

/**
 * Find, for a conversation's rows while `on` (Personal in sight, no talk over it, the conversation not covered):
 * whether it is open, how to open it, its line, and the lens the turns mark by. The current match is held as itself,
 * so earlier days read in before it leave it current.
 */
/**
 * Find pressed while the notes cover the conversation (`uncover` puts them away): it opens once the conversation is in
 * reach again, a render later. Never a press that does nothing.
 */
function useOnceUncovered(on: boolean, uncover: (() => void) | null, show: () => void): () => void {
  const [asked, setAsked] = useState(false)
  const latest = useRef(show)
  useEffect(() => {
    latest.current = show
  })
  useEffect(() => {
    if (!asked || !on) return
    setAsked(false)
    latest.current()
  }, [asked, on])
  return () => {
    if (!uncover) return
    uncover()
    setAsked(true)
  }
}

/**
 * Whether find is open, and how it opens and closes: Ctrl or ⌘ F and the toggle while `on`, Esc wherever its focus is,
 * the focus given back on closing; out of reach it closes and `clear`s what it held.
 */
function useFindOpen(on: boolean, uncover: (() => void) | null, clear: () => void) {
  const [open, setOpen] = useState(false)
  const back = useRef<HTMLElement | null>(null)
  const clearing = useRef(clear)
  useEffect(() => {
    clearing.current = clear
  })
  const askOpen = useOnceUncovered(on, uncover, () => {
    back.current = focused()
    setOpen(true)
    focusSoon('#c-find')
  })
  // The line is drawn and takes the focus within the key's own event: the letters typed next are the finder's.
  const openFind = () => {
    // Out of reach: under the notes, they are put away first; else (a talk, out of sight) it doesn't open.
    if (!on) return askOpen()
    if (!open) back.current = focused()
    flushSync(() => setOpen(true))
    const input = document.querySelector<HTMLInputElement>('#c-find')
    input?.focus({ preventScroll: true })
    input?.select()
  }
  const close = () => {
    setOpen(false)
    clear()
    giveBack(back.current)
  }
  useShortcuts({ 'mod+f': openFind }, on)
  useEscape(open && on, close)
  // Out of sight (another place, the padlock, a talk), it closes and keeps nothing: no query, nothing marked.
  useEffect(() => {
    if (on) return
    setOpen(false)
    clearing.current()
  }, [on])
  return { open, openFind, close }
}

export function useFind(
  rows: readonly Row[],
  on: boolean,
  more: boolean,
  readEarlier: () => void,
  uncover: (() => void) | null,
) {
  const [query, setQuery] = useState('')
  const [held, setHeld] = useState<Found | null>(null)
  const [steps, setSteps] = useState(0)
  const { open, openFind, close } = useFindOpen(on, uncover, () => {
    setQuery('')
    setHeld(null)
  })
  const found = useMemo(() => (open ? foundIn(rows, query) : []), [open, rows, query])
  const index = Math.max(0, found.findIndex(sameAs(held)))
  const current = found[index] ?? null
  // The current match comes into sight when it changes, or is stepped to again.
  const where = current ? `${current.key}:${String(current.n)}` : null
  useEffect(() => {
    if (where) document.querySelector('.msgs mark.current')?.scrollIntoView({ block: 'center' })
  }, [where, steps])
  const bar = open ? (
    <FindBar
      {...{ query, more }}
      count={found.length}
      at={index}
      onQuery={(q) => {
        setQuery(q)
        setHeld(null)
      }}
      onStep={(by) => {
        setHeld(found[(index + by + found.length) % Math.max(found.length, 1)] ?? null)
        setSteps((s) => s + 1)
      }}
      onMore={() => {
        // The match you are on stays current as earlier days come in before it; and the button goes once the last
        // page is read, so the focus waits in the finder.
        setHeld(current)
        document.querySelector<HTMLInputElement>('#c-find')?.focus({ preventScroll: true })
        readEarlier()
      }}
      onClose={close}
    />
  ) : null
  const lens = open && query.trim() ? { query, current } : null
  return { open, openFind, bar, lens }
}
