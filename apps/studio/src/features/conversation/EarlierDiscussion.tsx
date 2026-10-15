// The room's discussion further back than the snapshot's 50 (docs/plans/discussion-earlier.md, A23). «Earlier
// messages» reads one page before the oldest message shown and puts it above, the reader kept where they were. Once a
// page is read, every message the snapshot showed stays: its window moves on as new messages come, and none may fall
// between the pages and the window. At the first message, the chat says it starts there.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry } from '@sophia/contracts'
import { getDiscussionPage } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'

/** How many entries the snapshot holds: with fewer, it holds the whole discussion. */
const WINDOW = 50

interface Held {
  projectId: string
  /** Every entry read or seen since the first earlier page, by id. */
  entries: ReadonlyMap<string, DiscussionEntry>
  /** The first message is among them. */
  atStart: boolean
}

type Reading = 'idle' | 'loading' | 'failed'

export interface Earlier {
  entries: readonly DiscussionEntry[]
  /** «Earlier messages» is offered: older ones may remain. */
  offered: boolean
  atStart: boolean
  reading: Reading
  load: () => void
}

/** Oldest first, as the API orders them: by time, then by id. */
const inOrder = (a: DiscussionEntry, b: DiscussionEntry) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

const withEntries = (held: ReadonlyMap<string, DiscussionEntry>, more: readonly DiscussionEntry[]) => {
  const next = new Map(held)
  for (const entry of more) next.set(entry.id, entry)
  return next
}

export function useEarlierDiscussion(
  projectId: string,
  identity: Identity,
  discussion: readonly DiscussionEntry[],
  history: RefObject<HTMLDivElement | null>,
): Earlier {
  const [stored, setHeld] = useState<Held | null>(null)
  const [reading, setReading] = useState<Reading>('idle')
  const fromBottom = useRef<number | null>(null)
  const held = stored?.projectId === projectId ? stored : null
  // Each window the snapshot shows is kept once pages are read, so a message leaving it stays.
  useEffect(() => {
    setHeld((h) => (h && h.projectId === projectId ? { ...h, entries: withEntries(h.entries, discussion) } : h))
  }, [discussion, projectId])
  // A page put above keeps the reader where they were: the distance from the bottom is what stays.
  useLayoutEffect(() => {
    const el = history.current
    if (el && fromBottom.current !== null) el.scrollTop = el.scrollHeight - fromBottom.current
    fromBottom.current = null
  }, [held, history])
  const entries = held ? [...withEntries(held.entries, discussion).values()].toSorted(inOrder) : discussion
  const atStart = held?.atStart ?? false
  const load = () => {
    const oldest = entries[0]
    if (!oldest || reading === 'loading') return
    setReading('loading')
    getDiscussionPage(identity.token, projectId, oldest.id).then(
      (page) => {
        const el = history.current
        fromBottom.current = el ? el.scrollHeight - el.scrollTop : null
        setHeld({
          projectId,
          entries: withEntries(withEntries(held?.entries ?? new Map(), entries), page.entries),
          atStart: page.before === null,
        })
        setReading('idle')
      },
      () => setReading('failed'),
    )
  }
  return { entries, offered: !atStart && entries.length >= WINDOW, atStart, reading, load }
}

/** The words the one control says, by how the read goes. */
const EARLIER_WORDS: Record<Reading, string> = {
  idle: 'Earlier messages',
  loading: 'Loading…',
  failed: 'Try again',
}

/**
 * The discussion's top: «Earlier messages» while older ones may remain, its failure and retry, or its start. One control
 * for all three moments, so a keyboard's focus stays on it; reaching the start, the focus goes to the start, which takes
 * it (Codex P1 on #350).
 */
export function EarlierLine({ earlier }: { earlier: Earlier }) {
  const control = useRef<HTMLButtonElement>(null)
  const start = useRef<HTMLParagraphElement>(null)
  const held = useRef(false)
  useEffect(() => {
    // Without scrolling: the reader stays where the page above put them.
    if (earlier.atStart && held.current) start.current?.focus({ preventScroll: true })
  }, [earlier.atStart])
  if (earlier.atStart)
    return (
      <p ref={start} className="discussion-start" tabIndex={-1}>
        The start of the room’s chat
      </p>
    )
  if (!earlier.offered) return null
  const loading = earlier.reading === 'loading'
  return (
    <div className="discussion-earlier">
      {earlier.reading === 'failed' && <p role="alert">Couldn’t load earlier messages.</p>}
      <button
        ref={control}
        type="button"
        className="text-button"
        aria-disabled={loading || undefined}
        onClick={() => {
          // Whether the press came with the focus here: then the start, reached, takes it.
          held.current = document.activeElement === control.current
          if (!loading) earlier.load()
        }}
      >
        {EARLIER_WORDS[earlier.reading]}
      </button>
    </div>
  )
}
