// A mention's attention in the room's chat (docs/plans/mentions.md, A37; the mentions flag's). The chat acknowledges
// exactly the occurrences the service lists as waiting for the reader (the Needs read's own ids, never one made up
// here), and only once the message is readable on screen. A message the address names (a mention opened from Home) is
// brought into view once; when it isn't among the messages shown, a few earlier pages are read to find it, and the
// chat says so when it can't be shown.
import { useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { listNeeds, markNeedSeen } from '../../api/needs.ts'
import { PersonalLocked } from '../../app/account-cache.ts'
import { tokenSubject } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { modalOnScreen } from '../../app/shortcuts.ts'
import { MENTIONS } from '../../app/mentions.ts'
import { MESSAGE } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
import type { Earlier } from './EarlierDiscussion.tsx'
import { beforeOf } from './message-before.ts'
import { nextLook, readable, waitingRevision, type AddressState, type Waiting } from './mention-view.ts'

const NONE: ReadonlyMap<string, Waiting> = new Map()

/** A seen write that fails is tried again while its message stays readable: at most this many times, waiting longer each. */
const SEEN_RETRIES = 3
const SEEN_RETRY_MS = 1000

/**
 * The mentions waiting for the reader in this project, by message: each one's need id exactly as the service lists it
 * (`mention:<project>:<revision>.<occurrence>:<message>`) and the message revision it is for, so it is attached only to
 * that revision shown (mention-view `needFor`). Read again as the project moves. The list is the person's mixed Needs
 * (their replies' words beside the mentions): while the personal padlock is shut it is neither read nor shown, and what
 * was read goes (forgetPersonalReads); opened again, it is read afresh (P1 4309009938).
 */
export function useMyMentions(
  identity: Identity,
  projectId: string,
  cursor: string | undefined,
): ReadonlyMap<string, Waiting> {
  const locked = useContext(PersonalLocked)
  const read = useQuery({
    queryKey: ['mentions', 'needs', tokenSubject(identity.token) ?? identity.token, cursor],
    queryFn: ({ signal }) => listNeeds(identity.token, signal),
    placeholderData: keepPreviousData,
    enabled: MENTIONS && !locked,
    retry: false,
  })
  const needs = read.data?.needs
  if (!needs || locked) return NONE
  return new Map(
    needs
      .filter((n) => n.kind === 'mention' && n.projectId === projectId && n.ref.kind === 'contribution')
      .flatMap((n): [string, Waiting][] => {
        const revision = waitingRevision(n.ref.within)
        return revision === null ? [] : [[n.ref.id, { need: n.id, revision }]]
      }),
  )
}

/** The waiting need an observed entry names, when the entry is readable in the chat's view (mention-view `readable`). */
function readNeed(change: IntersectionObserverEntry): string | undefined {
  const id = change.target instanceof HTMLElement ? change.target.dataset.mentionNeed : undefined
  const view = change.rootBounds?.height ?? 0
  return id && readable(change.intersectionRect.height, change.boundingClientRect.height, view) ? id : undefined
}

/** Every 5% of an entry, so a tall one is measured as it scrolls through. */
const STEPS = Array.from({ length: 21 }, (_, i) => i / 20)

/**
 * How much of an entry the chat shows, measured on the page: the part of it inside the chat's scrolled box. The chat's
 * scroll is followed with this too: an entry so tall that its most visible part is under the observer's first 5% step
 * (a short window) crosses no step after it first appears, so the observer alone would never see it fill the chat
 * (V on #409, measured: 4000 characters, 1344 px, in a 40 px chat).
 */
function shownNeed(el: Element, root: Element): string | undefined {
  const id = el instanceof HTMLElement ? el.dataset.mentionNeed : undefined
  const box = root.getBoundingClientRect()
  const top = box.top + root.clientTop
  const r = el.getBoundingClientRect()
  const visible = Math.min(r.bottom, top + root.clientHeight) - Math.max(r.top, top)
  return id && readable(visible, r.height, root.clientHeight) ? id : undefined
}

/**
 * Failed seen writes, tried again: at most SEEN_RETRIES times each, later each time, and only while the view lives (its
 * cleanup cancels them: hidden, another account, the occurrence changed). `again` checks the occurrence is still
 * readable before it writes.
 */
function seenRetries(again: (id: string) => void) {
  let live = true
  const attempts = new Map<string, number>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  return {
    retry: (id: string) => {
      const n = (attempts.get(id) ?? 0) + 1
      if (!live || n > SEEN_RETRIES) return
      attempts.set(id, n)
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (live) again(id)
      }, SEEN_RETRY_MS * n)
      timers.add(timer)
    },
    cancel: () => {
      live = false
      for (const timer of timers) clearTimeout(timer)
    },
  }
}

/** The reader's Needs, read again after a seen write (Home's and the chat's lists). */
function readNeedsAgain(client: QueryClient, subject: string) {
  void client.invalidateQueries({ queryKey: ['mentions', 'needs', subject] })
  void client.invalidateQueries({ queryKey: ['vision', 'needs', subject] })
}

/** The page is in the background (another tab, minimised): nothing on it is being read (R on db88, r4314628605). */
const backgrounded = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

/**
 * Calls `look` once a frame as the chat's scroll moves (`false`), and when the last visible modal over the page closes
 * or the page comes back to the foreground (`true`, 4308744385, r4314628605). Returns its stop.
 */
function watchShown(root: HTMLElement, look: (uncovered: boolean) => void): () => void {
  const onVisible = () => {
    if (!backgrounded()) look(true)
  }
  document.addEventListener('visibilitychange', onVisible)
  let frame = 0
  const onScroll = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      look(false)
    })
  }
  root.addEventListener('scroll', onScroll, { passive: true })
  let covered = modalOnScreen()
  let check = 0
  const cover = new MutationObserver(() => {
    if (check) return
    check = requestAnimationFrame(() => {
      check = 0
      const now = modalOnScreen()
      if (covered && !now) look(true)
      covered = now
    })
  })
  cover.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-modal', 'hidden', 'inert', 'open'],
  })
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    root.removeEventListener('scroll', onScroll)
    cancelAnimationFrame(frame)
    cover.disconnect()
    cancelAnimationFrame(check)
  }
}

/**
 * The waiting mentions the reader was shown are seen: the chat on screen (`inView`) and the message readable in its
 * view (mention-view `readable`), as the observer reports it or as the chat's scroll moves it. Each occurrence once; a
 * write that fails is tried again, a few times, while it stays readable, and again the next time it is shown.
 */
export function useMentionsSeen(
  identity: Identity,
  history: RefObject<HTMLElement | null>,
  inView: boolean,
  waiting: ReadonlyMap<string, Waiting>,
  shown: string,
) {
  const client = useQueryClient()
  const marked = useRef(new Set<string>())
  // The retries of the effect that is current: a write that fails after its effect was replaced (the chat moved on, the
  // same occurrence still waiting) is retried by the current one, never by a cancelled one (#409 4305869903).
  const retryOwner = useRef<ReturnType<typeof seenRetries> | null>(null)
  const ids = [...waiting.values()]
    .map((w) => w.need)
    .toSorted()
    .join(',')
  useEffect(() => {
    // Only what still waits is remembered: a later occurrence is a new id, and is marked when shown.
    marked.current = new Set([...marked.current].filter((id) => ids.split(',').includes(id)))
    const root = history.current
    if (!MENTIONS || !inView || !root || !ids || typeof IntersectionObserver === 'undefined') return undefined
    const subject = tokenSubject(identity.token) ?? identity.token
    const again = () => readNeedsAgain(client, subject)
    // A write that failed is tried again while the same occurrence stays readable where it is (#409 4305869903).
    // One falling due under a visible modal waits, due, for the last one to close (R92 on 4308744385).
    const retries = seenRetries((id) => {
      const el = [...waitingEls()].find((e) => e instanceof HTMLElement && e.dataset.mentionNeed === id)
      // Due while a modal covers the page or the page is in the background: it waits, due, for the reader's return.
      if (modalOnScreen() || backgrounded()) due.add(id)
      else if (el) seen(shownNeed(el, root))
    })
    retryOwner.current = retries
    const failed = new Set<string>()
    const due = new Set<string>()
    // A message under a visible modal (a sheet, a dialog) is not shown to the reader: nothing is marked or sent while one
    // covers the page (4308744385); the last one closing looks again at what the chat shows, as it stands.
    const seen = (id: string | undefined) => {
      if (!id || marked.current.has(id) || modalOnScreen() || backgrounded()) return
      marked.current.add(id)
      due.delete(id)
      void markNeedSeen(identity.token, id).then(again, () => {
        marked.current.delete(id)
        failed.add(id)
        retryOwner.current?.retry(id)
      })
    }
    const observer = new IntersectionObserver((changes) => changes.forEach((change) => seen(readNeed(change))), {
      root,
      threshold: STEPS,
    })
    const waitingEls = () => root.querySelectorAll('[data-mention-need]')
    for (const el of waitingEls()) observer.observe(el)
    // What the chat shows, read again as its scroll moves it, or as it stands once the last visible modal closes; an
    // occurrence whose write failed is sent then only when its bounded retry fell due under the modal, never early.
    const look = (uncovered: boolean) => {
      for (const el of waitingEls()) {
        const id = shownNeed(el, root)
        if (!uncovered || !id || !failed.has(id) || due.has(id)) seen(id)
      }
    }
    const stopLooking = watchShown(root, look)
    return () => {
      stopLooking()
      retries.cancel()
      if (retryOwner.current === retries) retryOwner.current = null
      observer.disconnect()
    }
  }, [client, identity.token, history, inView, ids, shown])
}

/** Where the look for an addressed message stands, for one following of the address. */
interface Look {
  key: string
  at: AddressState
  pages: number
  /** The page a search found it in has been asked for (A38). */
  jumped: boolean
}

/** The look after a step: still looking after a read it starts, else what it concluded. */
const lookAfter = (look: Look, step: Exclude<ReturnType<typeof nextLook>, 'wait'>): Look => {
  if (step === 'jump') return { ...look, jumped: true }
  if (step === 'load') return { ...look, pages: look.pages + 1 }
  return { ...look, at: step }
}

/** A read under way, or failed, as the look waits on it. */
const readOf = (reading: Earlier['reading']) => ({ reading: reading === 'loading', failed: reading === 'failed' })

/**
 * A search's page to read for this message: none without a search's hint, else still to read or read. A latest-page
 * hint (null) only said it was the newest when found: newer messages may have come since (4307870144), so once that
 * page is read without it, it is looked for in the bounded earlier pages as any address is, never said gone for that.
 */
export const jumpOf = (before: string | null | undefined, jumped: boolean): 'none' | 'unread' | 'read' => {
  // undefined: no search found it; null: it was the newest when found (the latest page), else the message after it.
  if (before === undefined) return 'none'
  if (!jumped) return 'unread'
  return before === null ? 'none' : 'read'
}

/**
 * A message named in the address (#message-<id>): brought into the chat's view once it is shown, and only once for
 * each time the address is followed, so later messages never pull the reader back. Not among the messages shown, it is
 * looked for in at most ADDRESS_PAGES earlier pages; withdrawn, or still not found at the chat's start, it is gone; not
 * found within those pages, it is further back. A message a search found (A38) is read with the one page that ends at
 * it instead (message-before.ts); a failed read waits for the reader's Try again (`retry`).
 */
export function useMessageAddressed(
  history: RefObject<HTMLElement | null>,
  inView: boolean,
  earlier: Earlier,
  /** The chat's discussion has been read: until then nothing is concluded from what it doesn't show yet. */
  loaded: boolean,
  shown: string,
): { at: AddressState; retry: (() => void) | null } {
  const named = useAddressed(MESSAGE)
  const key = named.id ? `${named.id}#${String(named.seq)}` : ''
  const [state, setState] = useState<Look>({ key: '', at: 'none', pages: 0, jumped: false })
  // Each time the address is followed starts anew; a state for an earlier one is not this one's.
  const look: Look = state.key === key ? state : { key, at: key ? 'looking' : 'none', pages: 0, jumped: false }
  const { at, pages, jumped } = look
  const { load, offered, atStart, withdrawn, jump } = earlier
  // Found by a search, its next message known: the one page that ends at it, whose read is the one waited on.
  const before = beforeOf(named.id)
  // The jump's read while the search's page is still the one waited on; once a stale latest-page hint (null) was read
  // without it and the look goes on earlier (jumpOf "none"), the earlier pages' own read is (R on 4307870144).
  // A jump requested is not a jump read: while this follow's own jump is under way or failed, that read is the one
  // waited on (and retried); only once it settled without the message does the earlier lookup's own read govern.
  const jumpRead = before !== undefined ? earlier.jumping(key) : 'idle'
  const reading =
    before !== undefined && (jumpOf(before, jumped) !== 'none' || jumpRead !== 'idle') ? jumpRead : earlier.reading
  useEffect(() => {
    const id = named.id
    if (!inView || !loaded || !id || at !== 'looking') return
    const el = history.current?.querySelector(`[data-message="${CSS.escape(id)}"]`)
    const seen = { found: !!el, withdrawn: withdrawn.some((w) => w.id === id), offered, atStart, pages }
    const step = nextLook({ ...seen, ...readOf(reading), jump: jumpOf(before, jumped) })
    if (step === 'wait') return
    setState(lookAfter({ key, at, pages, jumped }, step))
    if (step === 'jump' && before !== undefined) jump(before, key)
    else if (step === 'load') load()
    // Brought into view once for this following of the address; later messages never pull the reader back.
    else if (step === 'found') el?.scrollIntoView({ block: 'center' })
  }, [
    history,
    inView,
    loaded,
    named.id,
    key,
    at,
    pages,
    jumped,
    before,
    load,
    jump,
    offered,
    atStart,
    reading,
    withdrawn,
    shown,
  ])
  const retry =
    at === 'looking' && before !== undefined && earlier.jumping(key) === 'failed' ? () => jump(before, key) : null
  return { at, retry }
}
