// A mention's attention in the room's chat (docs/plans/mentions.md, A37; the mentions flag's). The chat acknowledges
// exactly the occurrences the service lists as waiting for the reader (the Needs read's own ids, never one made up
// here), and only once the message is readable on screen. A message the address names (a mention opened from Home) is
// brought into view once; when it isn't among the messages shown, a few earlier pages are read to find it, and the
// chat says so when it can't be shown.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { listNeeds, markNeedSeen } from '../../api/needs.ts'
import { tokenSubject } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { MENTIONS } from '../../app/mentions.ts'
import { MESSAGE } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
import type { Earlier } from './EarlierDiscussion.tsx'
import { beforeOf } from './message-before.ts'
import { nextLook, readable, waitingRevision, type AddressState, type Waiting } from './mention-view.ts'

const NONE: ReadonlyMap<string, Waiting> = new Map()

/**
 * The mentions waiting for the reader in this project, by message: each one's need id exactly as the service lists it
 * (`mention:<project>:<revision>.<occurrence>:<message>`) and the message revision it is for, so it is attached only to
 * that revision shown (mention-view `needFor`). Read again as the project moves.
 */
export function useMyMentions(
  identity: Identity,
  projectId: string,
  cursor: string | undefined,
): ReadonlyMap<string, Waiting> {
  const read = useQuery({
    queryKey: ['mentions', 'needs', tokenSubject(identity.token) ?? identity.token, cursor],
    queryFn: ({ signal }) => listNeeds(identity.token, signal),
    placeholderData: keepPreviousData,
    enabled: MENTIONS,
    retry: false,
  })
  const needs = read.data?.needs
  if (!needs) return NONE
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
 * The waiting mentions the reader was shown are seen: the chat on screen (`inView`) and the message readable in its
 * view (mention-view `readable`), as the observer reports it or as the chat's scroll moves it. Each occurrence once; a
 * write that fails is tried again the next time it is shown.
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
    const again = () => {
      void client.invalidateQueries({ queryKey: ['mentions', 'needs', subject] })
      void client.invalidateQueries({ queryKey: ['vision', 'needs', subject] })
    }
    const seen = (id: string | undefined) => {
      if (!id || marked.current.has(id)) return
      marked.current.add(id)
      void markNeedSeen(identity.token, id).then(again, () => marked.current.delete(id))
    }
    const observer = new IntersectionObserver((changes) => changes.forEach((change) => seen(readNeed(change))), {
      root,
      threshold: STEPS,
    })
    const waitingEls = () => root.querySelectorAll('[data-mention-need]')
    for (const el of waitingEls()) observer.observe(el)
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        for (const el of waitingEls()) seen(shownNeed(el, root))
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
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

/** A search's page to read for this message: none without a search's hint, else still to read or read. */
const jumpOf = (before: string | null | undefined, jumped: boolean) => {
  if (typeof before !== 'string') return 'none'
  return jumped ? 'read' : 'unread'
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
  const reading = typeof before === 'string' ? earlier.jumping : earlier.reading
  useEffect(() => {
    const id = named.id
    if (!inView || !loaded || !id || at !== 'looking') return
    const el = history.current?.querySelector(`[data-message="${CSS.escape(id)}"]`)
    const seen = { found: !!el, withdrawn: withdrawn.some((w) => w.id === id), offered, atStart, pages }
    const step = nextLook({ ...seen, ...readOf(reading), jump: jumpOf(before, jumped) })
    if (step === 'wait') return
    setState(lookAfter({ key, at, pages, jumped }, step))
    if (step === 'jump' && typeof before === 'string') jump(before)
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
    at === 'looking' && typeof before === 'string' && earlier.jumping === 'failed' ? () => jump(before) : null
  return { at, retry }
}
