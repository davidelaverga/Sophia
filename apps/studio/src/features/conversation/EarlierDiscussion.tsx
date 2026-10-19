// The room's discussion further back than the snapshot's 50 (docs/plans/discussion-earlier.md, A23). «Earlier
// messages» reads one page before the oldest message shown and puts it above, the reader kept where they were. Once a
// page is read, every message the snapshot showed stays: its window moves on as new messages come, and none may fall
// between the pages and the window. At the first message, the chat says it starts there.
// A message can be corrected or withdrawn (A36, docs/plans/message-acts.md): the snapshot's window decides for the
// span it covers, so a message withdrawn there never stays from an earlier read; withdrawn places (tombstones, with the
// message acts flag) are held as messages are; and the reader's own act shows before the next read brings it.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry, WithdrawnEntry } from '@sophia/contracts'
import { getDiscussionPage } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { Acted } from './MessageActions.tsx'
import { useHeldRefresh } from './held-pages.ts'
import { heldView, inOrder } from './message-acts.ts'

/** How many entries the snapshot holds, withdrawn places included: with fewer, it holds the whole discussion. */
const WINDOW = 50

interface Held {
  projectId: string
  /** Every entry read or seen since the first earlier page, by id. */
  entries: ReadonlyMap<string, DiscussionEntry>
  /** Every withdrawn place read or seen since then, by id (A36). */
  withdrawn: ReadonlyMap<string, WithdrawnEntry>
  /** The first message is among them. */
  atStart: boolean
}

type Reading = 'idle' | 'loading' | 'failed'

export interface Earlier {
  entries: readonly DiscussionEntry[]
  /** Where withdrawn messages stood, oldest first (A36's tombstones; none without the message acts flag). */
  withdrawn: readonly WithdrawnEntry[]
  /** «Earlier messages» is offered: older ones may remain. */
  offered: boolean
  atStart: boolean
  reading: Reading
  load: () => void
  /** The reader's own act, shown until the chat is read again. */
  revise: (acted: Acted) => void
}

const withEntries = <T extends { id: string }>(held: ReadonlyMap<string, T>, more: readonly T[]) => {
  const next = new Map(held)
  for (const entry of more) next.set(entry.id, entry)
  return next
}

const NONE: readonly WithdrawnEntry[] = []

/** The reader's own acts, by message, until the chat is read again; `revise` records one. */
function useActed(projectId: string) {
  const [actedOn, setActed] = useState<{ projectId: string; acts: ReadonlyMap<string, Acted> } | null>(null)
  const acted: ReadonlyMap<string, Acted> = actedOn?.projectId === projectId ? actedOn.acts : new Map()
  const revise = (a: Acted) => {
    if (a.type === 'reread') return
    const id = a.type === 'withdrawn' ? a.withdrawn.id : a.entry.id
    setActed((now) => ({ projectId, acts: new Map([...(now?.projectId === projectId ? now.acts : []), [id, a]]) }))
  }
  return { acted, revise }
}

/** Each window the snapshot shows is kept once pages are read, so a message leaving it stays. */
function useWindowKept(
  projectId: string,
  discussion: readonly DiscussionEntry[],
  discussionWithdrawn: readonly WithdrawnEntry[],
  setHeld: (next: (h: Held | null) => Held | null) => void,
) {
  useEffect(() => {
    setHeld((h) =>
      h && h.projectId === projectId
        ? {
            ...h,
            entries: withEntries(h.entries, discussion),
            withdrawn: withEntries(h.withdrawn, discussionWithdrawn),
          }
        : h,
    )
  }, [discussion, discussionWithdrawn, projectId, setHeld])
}

export function useEarlierDiscussion(
  projectId: string,
  identity: Identity,
  discussion: readonly DiscussionEntry[],
  history: RefObject<HTMLDivElement | null>,
  shown: { withdrawn?: readonly WithdrawnEntry[] | undefined; cursor?: string | undefined } = {},
): Earlier {
  const discussionWithdrawn = shown.withdrawn ?? NONE
  const [stored, setHeld] = useState<Held | null>(null)
  const [reading, setReading] = useState<Reading>('idle')
  const fromBottom = useRef<number | null>(null)
  const held = stored?.projectId === projectId ? stored : null
  const { acted, revise } = useActed(projectId)
  useWindowKept(projectId, discussion, discussionWithdrawn, setHeld)
  // A page put above keeps the reader where they were: the distance from the bottom is what stays.
  useLayoutEffect(() => {
    const el = history.current
    if (el && fromBottom.current !== null) el.scrollTop = el.scrollHeight - fromBottom.current
    fromBottom.current = null
  }, [held, history])
  // A held message changed elsewhere is not shown while its page is read again (held-pages.ts, 4309253137).
  const [stale, epoch, erased] = useHeldRefresh({
    projectId,
    identity,
    held,
    setHeld,
    window: [...discussion, ...discussionWithdrawn],
    reading: reading === 'loading',
    cursor: shown.cursor,
  })
  const view = heldView(held, { entries: discussion, withdrawn: discussionWithdrawn }, acted)
  const receiptOf = (e: DiscussionEntry) => {
    const a = acted.get(e.id)
    return a?.type === 'corrected' && a.entry === e ? a.cursor : undefined
  }
  const entries = view.entries.filter((e) => !stale.has(e.id) && !erased(e, receiptOf(e)))
  const { withdrawn } = view
  const atStart = held?.atStart ?? false
  const load = () => {
    const [oldest] = [...entries, ...withdrawn].toSorted(inOrder)
    if (!oldest || reading === 'loading') return
    setReading('loading')
    const asOf = epoch()
    getDiscussionPage(identity.token, projectId, oldest.id).then(
      (page) => {
        // Pages let go while this was read: what it brings may be older than what is known; it is not kept.
        if (epoch() !== asOf) return setReading('idle')
        const el = history.current
        fromBottom.current = el ? el.scrollHeight - el.scrollTop : null
        setHeld({
          projectId,
          entries: withEntries(withEntries(held?.entries ?? new Map(), entries), page.entries),
          withdrawn: withEntries(withEntries(held?.withdrawn ?? new Map(), withdrawn), page.withdrawn ?? []),
          atStart: page.before === null,
        })
        setReading('idle')
      },
      () => setReading('failed'),
    )
  }
  const total = entries.length + withdrawn.length
  return { entries, withdrawn, offered: !atStart && total >= WINDOW, atStart, reading, load, revise }
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
