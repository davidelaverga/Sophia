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
import { nextLook, readable, waitingRevision, type AddressState, type Waiting } from './mention-view.ts'

const NONE: ReadonlyMap<string, Waiting> = new Map()

/** A seen write that fails is tried again while its message stays readable: at most this many times, waiting longer each. */
const SEEN_RETRIES = 3
const SEEN_RETRY_MS = 1000

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
    // A write that failed is tried again while the same occurrence stays readable where it is (#409 4305869903).
    const retries = seenRetries((id) => {
      const el = [...waitingEls()].find((e) => e instanceof HTMLElement && e.dataset.mentionNeed === id)
      if (el) seen(shownNeed(el, root))
    })
    const seen = (id: string | undefined) => {
      if (!id || marked.current.has(id)) return
      marked.current.add(id)
      void markNeedSeen(identity.token, id).then(again, () => {
        marked.current.delete(id)
        retries.retry(id)
      })
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
      retries.cancel()
      observer.disconnect()
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [client, identity.token, history, inView, ids, shown])
}

/**
 * A message named in the address (#message-<id>): brought into the chat's view once it is shown, and only once for
 * each time the address is followed, so later messages never pull the reader back. Not among the messages shown, it is
 * looked for in at most ADDRESS_PAGES earlier pages; withdrawn, or still not found at the chat's start, it is gone; not
 * found within those pages, it is further back.
 */
export function useMessageAddressed(
  history: RefObject<HTMLElement | null>,
  inView: boolean,
  earlier: Earlier,
  /** The chat's discussion has been read: until then nothing is concluded from what it doesn't show yet. */
  loaded: boolean,
  shown: string,
): AddressState {
  const named = useAddressed(MESSAGE)
  const key = named.id ? `${named.id}#${String(named.seq)}` : ''
  const [state, setState] = useState<{ key: string; at: AddressState; pages: number }>({
    key: '',
    at: 'none',
    pages: 0,
  })
  // Each time the address is followed starts anew; a state for an earlier one is not this one's.
  const at: AddressState = state.key === key ? state.at : key ? 'looking' : 'none'
  const pages = state.key === key ? state.pages : 0
  const { load, offered, atStart, reading, withdrawn } = earlier
  useEffect(() => {
    const id = named.id
    if (!inView || !loaded || !id || at !== 'looking') return
    const el = history.current?.querySelector(`[data-message="${CSS.escape(id)}"]`)
    const step = nextLook({
      found: !!el,
      withdrawn: withdrawn.some((w) => w.id === id),
      reading: reading === 'loading',
      failed: reading === 'failed',
      offered,
      atStart,
      pages,
    })
    if (step === 'wait') return
    if (step === 'load') {
      setState({ key, at: 'looking', pages: pages + 1 })
      load()
      return
    }
    // Brought into view once for this following of the address; later messages never pull the reader back.
    if (step === 'found') el?.scrollIntoView({ block: 'center' })
    setState({ key, at: step, pages })
  }, [history, inView, loaded, named.id, key, at, pages, load, offered, atStart, reading, withdrawn, shown])
  return at
}
