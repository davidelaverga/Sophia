// Finding in the conversation (personal-moments.md §3): Ctrl or ⌘ F while Personal is in sight, or Find in its head,
// opens a line under the head. The turns mark what matches, the current match in sight; Enter goes on, Shift Enter
// back, round at either end; Esc closes it and gives the focus back to where it was. It looks in what is read, and
// "Look further back" reads earlier days.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import { keyLabel, onMac } from '../../app/shortcuts.ts'
import { useCommands } from '../../app/useCommands.ts'
import { askAbout, type Row } from './conversation-view.ts'
import { focusConversation } from './focus.ts'
import { useEscape } from './useEscape.ts'
import { foundIn, pieces, type Found } from './find-view.ts'
import { LinkedText } from '../../app/LinkedText.tsx'

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
  // Its web addresses are links, a mark inside one kept inside it (message-links.md).
  if (!lens) return <LinkedText text={text} />
  const current = lens.current?.key === rowKey ? lens.current.n : null
  return <LinkedText text={text} marks={pieces(text, lens.query)} current={current} />
}

interface BarProps {
  query: string
  count: number
  at: number
  more: boolean
  onQuery: (query: string) => void
  onStep: (by: 1 | -1) => void
  /** Earlier days are being read (from here or the days' menu): it says so and waits. */
  reading: boolean
  onMore: () => void
  onClose: () => void
  /** Nothing matches and nothing earlier is left to read: ask Sophia instead; absent where she can't be written to. */
  onAsk?: (() => void) | undefined
  /** The last ask wasn't taken (she can't answer now, another message is on its way): the count says so. */
  refused: boolean
}

function FindBar({ query, count, at, more, reading, onQuery, onStep, onMore, onClose, onAsk, refused }: BarProps) {
  const found = count ? `${String(at + 1)} of ${String(count)}` : 'No match'
  const said = !query.trim() ? '' : refused ? 'She can’t be asked now' : found
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
        <button
          className="text-button"
          type="button"
          aria-disabled={reading || undefined}
          onClick={() => {
            if (!reading) onMore()
          }}
        >
          {reading ? 'Reading…' : 'Look further back'}
        </button>
      )}
      {onAsk && !more && query.trim() !== '' && count === 0 && (
        <button className="text-button" type="button" aria-label={`Ask Sophia about “${query.trim()}”`} onClick={onAsk}>
          Ask Sophia
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
  const focusOnOpen = useRef(false)
  const askOpen = useOnceUncovered(on, uncover, () => {
    back.current = focused()
    focusOnOpen.current = true
    setOpen(true)
  })
  // Opened a render after the press (the notes put away first): the focus goes in once the line is drawn.
  useLayoutEffect(() => {
    if (!open || !focusOnOpen.current) return
    focusOnOpen.current = false
    const input = document.querySelector<HTMLInputElement>('#c-find')
    input?.focus({ preventScroll: true })
    input?.select()
  }, [open])
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
  useCommands([{ id: 'find', words: 'Find in the conversation', group: 'do', key: 'mod+f', run: openFind }], on)
  useEscape(open && on, close)
  // Out of sight (another place, the padlock, a talk), it closes and keeps nothing: no query, nothing marked.
  useEffect(() => {
    if (on) return
    setOpen(false)
    clearing.current()
  }, [on])
  return { open, openFind, close }
}

/**
 * Find, for a conversation's rows while `on` (Personal in sight, no talk over it, the conversation not covered):
 * whether it is open, how to open it, its line, and the lens the turns mark by. The current match is held as itself,
 * so earlier days read in before it leave it current.
 */
/**
 * Asking Sophia from Find (docs/plans/find-ask-sophia.md): the line goes as the field's words do, and Find closes only
 * once it is taken; refused (she can't answer now, another message is on its way), Find stays and says so (Codex on
 * #294). No press at all where she can't be written to.
 */
function useAsk(ask: ((words: string) => Promise<boolean>) | null, query: string, close: () => void) {
  const [refused, setRefused] = useState(false)
  const onAsk = ask
    ? () => {
        void ask(askAbout(query)).then((taken) => {
          if (taken) close()
          else setRefused(true)
        })
      }
    : undefined
  return { refused, reset: () => setRefused(false), onAsk }
}

export function useFind(
  rows: readonly Row[],
  on: boolean,
  back: { more: boolean; reading: boolean; read: () => Promise<void> },
  uncover: (() => void) | null,
  /** Sends Sophia a line as yours (actions.start); null where she can't be written to (docs/plans/find-ask-sophia.md). */
  ask: ((words: string) => Promise<boolean>) | null = null,
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
  // The match you are on is held as itself once there is one: earlier days read in before it (from here or the days'
  // menu) leave it current.
  useEffect(() => {
    if (current && !(held && sameAs(held)(current))) setHeld(current)
  }, [held, current])
  // The current match comes into sight when it changes, or is stepped to again. At once, not smoothly: the list keeps a
  // reader at its end as it resizes (the finder's count coming in), and a glide not yet away from the end was pulled
  // back there, the match out of sight.
  const where = current ? `${current.key}:${String(current.n)}` : null
  useEffect(() => {
    if (where) document.querySelector('.msgs mark.current')?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [where, steps])
  const asking = useAsk(ask, query, close)
  const bar = open ? (
    <FindBar
      {...{ query }}
      more={back.more}
      reading={back.reading}
      count={found.length}
      at={index}
      refused={asking.refused}
      onQuery={(q) => {
        asking.reset()
        setQuery(q)
        setHeld(null)
      }}
      onStep={(by) => {
        setHeld(found[(index + by + found.length) % Math.max(found.length, 1)] ?? null)
        setSteps((s) => s + 1)
      }}
      onMore={() => {
        // The button goes once the last page is read: the focus waits in the finder.
        document.querySelector<HTMLInputElement>('#c-find')?.focus({ preventScroll: true })
        void back.read()
      }}
      onClose={close}
      onAsk={asking.onAsk}
    />
  ) : null
  const lens = open && query.trim() ? { query, current } : null
  return { open, openFind, bar, lens }
}
