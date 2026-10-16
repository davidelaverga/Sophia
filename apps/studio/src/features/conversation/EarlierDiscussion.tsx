// The room's discussion further back than the snapshot's 50 (docs/plans/discussion-earlier.md, A23). «Earlier
// messages» reads one page before the oldest message shown and puts it above, the reader kept where they were. Once a
// page is read, every message the snapshot showed stays: its window moves on as new messages come, and none may fall
// between the pages and the window. At the first message, the chat says it starts there.
// A message can be corrected or withdrawn (A36, docs/plans/message-acts.md): the snapshot's window decides for the
// span it covers, so a message withdrawn there never stays from an earlier read; withdrawn places (tombstones, with the
// message acts flag) are held as messages are; and the reader's own act shows before the next read brings it.
// A message a search found beyond the window (A38) is read with the one page that ends at it, held apart from the
// window by a gap line until the reader fills it, a page at a time (segment-view.ts).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry, WithdrawnEntry } from '@sophia/contracts'
import { getDiscussionPage } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { Acted } from './MessageActions.tsx'
import { heldView, inOrder } from './message-acts.ts'
import { afterGap, closesGap, gapAfterPage } from './segment-view.ts'

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
  /** A page a search read stands apart: the gap is after this message, until the messages between are read (A38). */
  gap: string | null
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
  /** Reads the one page that ends just before `before` (a found message's next, A38), held apart from the window. */
  jump: (before: string) => void
  /** That read: under way, failed (the reader tries again), or not. */
  jumping: Reading
  /** Between a page a search read and the window: after which message, its read, and the press that fills it. */
  gap: { after: string; reading: Reading; fill: () => void } | null
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

/** A page of the discussion as the hooks below keep it. */
interface Page {
  entries: readonly DiscussionEntry[]
  withdrawn?: readonly WithdrawnEntry[] | undefined
  before: string | null
}

/** What a page a search found is read into: what the chat shows, and how a page is held. */
interface Holding {
  shown: readonly (DiscussionEntry | WithdrawnEntry)[]
  atStart: boolean
  gap: string | null
  hold: (page: Page, at: Pick<Held, 'atStart' | 'gap'>) => void
  closeGap: () => void
}

/**
 * A message a search found beyond the window (A38): the one page that ends at it, held apart by a gap until the reader
 * fills it, a page under the gap at a time, until a page meets it (segment-view.ts).
 */
function useFoundPage(projectId: string, token: string, at: Holding): Pick<Earlier, 'jump' | 'jumping' | 'gap'> {
  const [jumping, setJumping] = useState<Reading>('idle')
  const [filling, setFilling] = useState<Reading>('idle')
  const { shown, hold } = at
  const jump = (before: string) => {
    if (jumping === 'loading') return
    setJumping('loading')
    getDiscussionPage(token, projectId, before).then(
      (page) => {
        const gap = gapAfterPage([...page.entries, ...(page.withdrawn ?? [])], shown, before)
        hold(page, { atStart: page.before === null || at.atStart, gap })
        setJumping('idle')
      },
      () => setJumping('failed'),
    )
  }
  const gapAt = at.gap === null ? undefined : shown.find((s) => s.id === at.gap)
  const fill = () => {
    const below = gapAt && afterGap(shown, gapAt.id)
    if (!gapAt || filling === 'loading') return
    if (!below) return at.closeGap()
    setFilling('loading')
    getDiscussionPage(token, projectId, below.id).then(
      (page) => {
        const met = closesGap([...page.entries, ...(page.withdrawn ?? [])], gapAt, page.before === null)
        hold(page, { atStart: at.atStart, gap: met ? null : gapAt.id })
        setFilling('idle')
      },
      () => setFilling('failed'),
    )
  }
  return { jump, jumping, gap: gapAt ? { after: gapAt.id, reading: filling, fill } : null }
}

export function useEarlierDiscussion(
  projectId: string,
  identity: Identity,
  discussion: readonly DiscussionEntry[],
  history: RefObject<HTMLDivElement | null>,
  discussionWithdrawn: readonly WithdrawnEntry[] = NONE,
): Earlier {
  const [stored, setHeld] = useState<Held | null>(null)
  const [reading, setReading] = useState<Reading>('idle')
  const fromBottom = useRef<number | null>(null)
  const held = stored?.projectId === projectId ? stored : null
  const { acted, revise } = useActed(projectId)
  // Each window the snapshot shows is kept once pages are read, so a message leaving it stays.
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
  }, [discussion, discussionWithdrawn, projectId])
  // A page put above keeps the reader where they were: the distance from the bottom is what stays.
  useLayoutEffect(() => {
    const el = history.current
    if (el && fromBottom.current !== null) el.scrollTop = el.scrollHeight - fromBottom.current
    fromBottom.current = null
  }, [held, history])
  const { entries, withdrawn } = heldView(held, { entries: discussion, withdrawn: discussionWithdrawn }, acted)
  const atStart = held?.atStart ?? false
  /** A page read, kept with everything held and shown. */
  const hold = (page: Page, at: Pick<Held, 'atStart' | 'gap'>) =>
    setHeld({
      projectId,
      entries: withEntries(withEntries(held?.entries ?? new Map(), entries), page.entries),
      withdrawn: withEntries(withEntries(held?.withdrawn ?? new Map(), withdrawn), page.withdrawn ?? []),
      ...at,
    })
  const load = () => {
    const [oldest] = [...entries, ...withdrawn].toSorted(inOrder)
    if (!oldest || reading === 'loading') return
    setReading('loading')
    getDiscussionPage(identity.token, projectId, oldest.id).then(
      (page) => {
        const el = history.current
        fromBottom.current = el ? el.scrollHeight - el.scrollTop : null
        hold(page, { atStart: page.before === null, gap: held?.gap ?? null })
        setReading('idle')
      },
      () => setReading('failed'),
    )
  }
  const shown = [...entries, ...withdrawn]
  const closeGap = () => setHeld((h) => h && { ...h, gap: null })
  const found = useFoundPage(projectId, identity.token, { shown, atStart, gap: held?.gap ?? null, hold, closeGap })
  const offered = !atStart && shown.length >= WINDOW
  return { entries, withdrawn, offered, atStart, reading, load, revise, ...found }
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
