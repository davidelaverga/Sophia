// The room's discussion further back than the snapshot's 50 (docs/plans/discussion-earlier.md, A23). «Earlier
// messages» reads one page before the oldest message shown and puts it above, the reader kept where they were. Once a
// page is read, every message the snapshot showed stays: its window moves on as new messages come, and none may fall
// between the pages and the window. At the first message, the chat says it starts there.
// A message can be corrected or withdrawn (A36, docs/plans/message-acts.md): the snapshot's window decides for the
// span it covers, so a message withdrawn there never stays from an earlier read; withdrawn places (tombstones, with the
// message acts flag) are held as messages are; and the reader's own act shows before the next read brings it.
// A message a search found beyond the window (A38) is read with the one page that ends at it. Wherever messages between
// what was read were never read, a gap line says so until the reader fills it, a page at a time (segment-view.ts).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry, WithdrawnEntry } from '@sophia/contracts'
import { getDiscussionPage } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { Acted } from './MessageActions.tsx'
import { heldView, inOrder } from './message-acts.ts'
import { afterGap, gapsIn, pageLinks, windowLinks } from './segment-view.ts'

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
  /** Each message's next one, as reads showed it (A23 pages, the windows): where the next shown differs, a gap (A38). */
  links: ReadonlyMap<string, string>
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
  /** The page that ends just before `before`; null: the latest page (a search's newest message). */
  jump: (before: string | null) => void
  /** That read: under way, failed (the reader tries again), or not. */
  jumping: Reading
  /** Where messages between were never read (A38): after which messages, a gap's read, and the press that fills it. */
  gaps: { after: readonly string[]; reading: (after: string) => Reading; fill: (after: string) => void }
}

const withEntries = <T extends { id: string }>(held: ReadonlyMap<string, T>, more: readonly T[]) => {
  const next = new Map(held)
  for (const entry of more) next.set(entry.id, entry)
  return next
}

/** Entries added to those held, an entry never replaced by an older revision of itself (A36). */
const withNewer = (held: ReadonlyMap<string, DiscussionEntry>, more: readonly DiscussionEntry[]) => {
  const next = new Map(held)
  for (const entry of more) {
    const now = next.get(entry.id)
    if (!now || (entry.revision ?? 0) >= (now.revision ?? 0)) next.set(entry.id, entry)
  }
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

/** What a page a search found is read into: what the chat shows, its gaps, and how a page is held. */
interface Holding {
  shown: readonly (DiscussionEntry | WithdrawnEntry)[]
  atStart: boolean
  gaps: readonly string[]
  /** A page read before `before`, kept with everything held. */
  hold: (page: Page, before: string | null, atStart: boolean) => void
}

/**
 * Messages a search found beyond the window (A38): the one page that ends at each, and the gaps any reads leave, each
 * filled from below a page at a time, until no message between is unread (segment-view.ts).
 */
function useFoundPage(projectId: string, token: string, at: Holding): Pick<Earlier, 'jump' | 'jumping' | 'gaps'> {
  const [jumping, setJumping] = useState<Reading>('idle')
  const [filling, setFilling] = useState<{ after: string; reading: Reading } | null>(null)
  const { shown, hold } = at
  const jump = (before: string | null) => {
    if (jumping === 'loading') return
    setJumping('loading')
    getDiscussionPage(token, projectId, before).then(
      (page) => {
        hold(page, before, page.before === null || at.atStart)
        setJumping('idle')
      },
      () => setJumping('failed'),
    )
  }
  const fill = (after: string) => {
    const below = at.gaps.includes(after) ? afterGap(shown, after) : undefined
    if (!below || filling?.reading === 'loading') return
    setFilling({ after, reading: 'loading' })
    getDiscussionPage(token, projectId, below.id).then(
      (page) => {
        hold(page, below.id, page.before === null || at.atStart)
        setFilling(null)
      },
      () => setFilling({ after, reading: 'failed' }),
    )
  }
  const reading = (after: string): Reading => (filling?.after === after ? filling.reading : 'idle')
  return { jump, jumping, gaps: { after: at.gaps, reading, fill } }
}

/** Each window the snapshot shows is kept once pages are read, so a message leaving it stays, with its next one. */
function useKeptWindows(
  setHeld: (update: (h: Held | null) => Held | null) => void,
  projectId: string,
  discussion: readonly DiscussionEntry[],
  discussionWithdrawn: readonly WithdrawnEntry[],
) {
  useEffect(() => {
    setHeld((h) =>
      h && h.projectId === projectId
        ? {
            ...h,
            entries: withEntries(h.entries, discussion),
            withdrawn: withEntries(h.withdrawn, discussionWithdrawn),
            links: new Map([...h.links, ...windowLinks([...discussion, ...discussionWithdrawn])]),
          }
        : h,
    )
  }, [setHeld, discussion, discussionWithdrawn, projectId])
}

/** The snapshot's window: the latest messages and withdrawn places. */
interface Latest {
  entries: readonly DiscussionEntry[]
  withdrawn: readonly WithdrawnEntry[]
}

/**
 * A page read, added to what is held WHEN IT ANSWERS (R-C4-02): another read that answered first stays, with its links;
 * the start, once read, stays read; the current window goes last, as the latest.
 */
function heldWith(
  now: Held | null,
  projectId: string,
  read: { page: Page; before: string | null; start: boolean },
  win: Latest,
): Held {
  const { page, before, start } = read
  return {
    projectId,
    entries: withNewer(withNewer(now?.entries ?? new Map(), page.entries), win.entries),
    withdrawn: withEntries(withEntries(now?.withdrawn ?? new Map(), page.withdrawn ?? []), win.withdrawn),
    atStart: start || (now?.atStart ?? false),
    links: new Map([
      ...(now?.links ?? []),
      ...pageLinks([...page.entries, ...(page.withdrawn ?? [])], before),
      ...windowLinks([...win.entries, ...win.withdrawn]),
    ]),
  }
}

/** How a page read is held: against the held state and the window as they are when it answers, not when it was asked. */
function useHold(
  setHeld: (update: (h: Held | null) => Held | null) => void,
  projectId: string,
  discussion: readonly DiscussionEntry[],
  discussionWithdrawn: readonly WithdrawnEntry[],
) {
  const windowNow = useRef<Latest>({ entries: discussion, withdrawn: discussionWithdrawn })
  useLayoutEffect(() => {
    windowNow.current = { entries: discussion, withdrawn: discussionWithdrawn }
  }, [discussion, discussionWithdrawn])
  return (page: Page, before: string | null, start: boolean) =>
    setHeld((h) =>
      heldWith(h?.projectId === projectId ? h : null, projectId, { page, before, start }, windowNow.current),
    )
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
  // The window, consecutive: the latest messages, each one's next among them.
  const latest = windowLinks([...discussion, ...discussionWithdrawn])
  useKeptWindows(setHeld, projectId, discussion, discussionWithdrawn)
  // A page put above keeps the reader where they were: the distance from the bottom is what stays.
  useLayoutEffect(() => {
    const el = history.current
    if (el && fromBottom.current !== null) el.scrollTop = el.scrollHeight - fromBottom.current
    fromBottom.current = null
  }, [held, history])
  const { entries, withdrawn } = heldView(held, { entries: discussion, withdrawn: discussionWithdrawn }, acted)
  const atStart = held?.atStart ?? false
  const hold = useHold(setHeld, projectId, discussion, discussionWithdrawn)
  const load = () => {
    const [oldest] = [...entries, ...withdrawn].toSorted(inOrder)
    if (!oldest || reading === 'loading') return
    setReading('loading')
    getDiscussionPage(identity.token, projectId, oldest.id).then(
      (page) => {
        const el = history.current
        fromBottom.current = el ? el.scrollHeight - el.scrollTop : null
        hold(page, oldest.id, page.before === null)
        setReading('idle')
      },
      () => setReading('failed'),
    )
  }
  const shown = [...entries, ...withdrawn]
  // Without a page read, the window alone: consecutive, no gap.
  const gaps = held ? gapsIn(shown, new Map([...held.links, ...latest])) : []
  const found = useFoundPage(projectId, identity.token, { shown, atStart, gaps, hold })
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
