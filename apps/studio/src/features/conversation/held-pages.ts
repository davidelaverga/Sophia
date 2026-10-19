// Earlier pages kept honest (4309253137, docs/plans/message-acts.md): a message older than the snapshot's window,
// already read on an earlier page, corrected or withdrawn elsewhere. The feed's contribution.corrected/withdrawn
// events name it; their ids are kept here, per project, beyond the feed's bounded recent list. The chat stops showing
// the held words at once and reads again only the page that holds them; a failed read, or a feed that lost its place
// (a gap, a resync), lets the earlier span go, and «Earlier messages» reads it again.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DiscussionEntry, DiscussionPage, WithdrawnEntry } from '@sophia/contracts'
import { getDiscussionPage } from '../../api/client.ts'
import { inOrder } from './message-acts.ts'

/** The events that change a message's words: a correction or a withdrawal (A36). */
export const ACTS: ReadonlySet<string> = new Set(['contribution.corrected', 'contribution.withdrawn'])

/** The messages changed elsewhere, each with the order it was learned in, and how many times the feed resynced. */
export interface Changes {
  readonly ids: ReadonlyMap<string, number>
  readonly resyncs: number
}

interface Store {
  changes: Changes
  listeners: Set<() => void>
}

/** The stores, one per account and project the feed follows (`owner`: `<account>:<project>`), forgotten when it stops. */
const stores = new Map<string, Store>()
let learned = 0
/** At most this many messages are kept: past it, the earlier pages are let go as after a resync. */
export const KEPT = 200

function storeOf(owner: string): Store {
  const found = stores.get(owner)
  if (found) return found
  const made: Store = { changes: { ids: new Map(), resyncs: 0 }, listeners: new Set() }
  stores.set(owner, made)
  return made
}

export const ownerOf = (account: string, projectId: string) => `${account}:${projectId}`

/** The feed stopped (another account, the project left): what it learned goes, and anyone listening is told. */
export function feedStopped(owner: string): void {
  const store = stores.get(owner)
  if (!store) return
  tell(store, { ids: new Map(), resyncs: store.changes.resyncs + 1 })
  if (store.listeners.size === 0) stores.delete(owner)
}

function tell(store: Store, changes: Changes) {
  store.changes = changes
  for (const listener of store.listeners) listener()
}

/** The feed applied a message's correction or withdrawal: its id is kept, however many come at once. */
export function contributionChanged(owner: string, id: string): void {
  const store = storeOf(owner)
  learned += 1
  const ids = new Map([...store.changes.ids, [id, learned]])
  if (ids.size > KEPT) tell(store, { ids: new Map(), resyncs: store.changes.resyncs + 1 })
  else tell(store, { ...store.changes, ids })
}

/** The feed lost its place and read the snapshot again: what changed meanwhile is unknown. */
export function feedResynced(owner: string): void {
  const store = storeOf(owner)
  tell(store, { ...store.changes, resyncs: store.changes.resyncs + 1 })
}

/** What the feed reported for a project so far. */
export const changesOf = (owner: string): Changes => storeOf(owner).changes

export function useContributionChanges(owner: string): Changes {
  const store = storeOf(owner)
  return useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    },
    () => store.changes,
  )
}

/** The held messages, outside the window, changed since they were last asked for (`asked`: id -> order). */
export function staleHeld(
  changes: Changes,
  asked: ReadonlyMap<string, number>,
  held: ReadonlyMap<string, unknown>,
  window: ReadonlySet<string>,
): string[] {
  return [...changes.ids]
    .filter(([id, n]) => (asked.get(id) ?? 0) < n && held.has(id) && !window.has(id))
    .map(([id]) => id)
}

interface Placed {
  id: string
  createdAt: string
}

/** The page that holds `id` is the one read before the message just newer than it. */
export function anchorOf(id: string, items: readonly Placed[]): string | undefined {
  const sorted = items.toSorted(inOrder)
  const at = sorted.findIndex((item) => item.id === id)
  return at < 0 ? undefined : sorted[at + 1]?.id
}

/** The changed messages grouped by the page that holds them: one read per page, however many changed in it. */
export function pagesFor(ids: readonly string[], items: readonly Placed[]): Map<string, string[]> {
  const byAnchor = new Map<string, string[]>()
  for (const id of ids) {
    const anchor = anchorOf(id, items)
    if (anchor) byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), id])
  }
  return byAnchor
}

interface HeldMaps {
  entries: ReadonlyMap<string, DiscussionEntry>
  withdrawn: ReadonlyMap<string, WithdrawnEntry>
}

/**
 * What a page read again says of the messages it was read for, and nothing else (a neighbour may be newer than this
 * page): one listed takes its words, one withdrawn there leaves, one its span covers but no longer lists leaves.
 * Returns the held maps and the ids the page settled.
 */
export function withPage(
  held: HeldMaps,
  page: DiscussionPage,
  ids: readonly string[],
): HeldMaps & { settled: string[] } {
  const entries = new Map(held.entries)
  const withdrawn = new Map(held.withdrawn)
  const span = [...page.entries, ...(page.withdrawn ?? [])].toSorted(inOrder)
  const [start, end] = [span[0], span.at(-1)]
  const settled: string[] = []
  for (const id of ids) {
    const listed = page.entries.find((e) => e.id === id)
    const gone = page.withdrawn?.find((w) => w.id === id)
    const was = entries.get(id)
    const covered = was && start && end && inOrder(was, start) >= 0 && inOrder(was, end) <= 0
    if (listed) entries.set(id, listed)
    else if (gone) {
      entries.delete(id)
      withdrawn.set(id, gone)
    } else if (covered) entries.delete(id)
    else continue
    settled.push(id)
  }
  return { entries, withdrawn, settled }
}

interface Held extends HeldMaps {
  projectId: string
  atStart: boolean
}

/**
 * The held pages' refresher, apart from React so its callbacks can be tested (R on 61dc). One batch of reads at a
 * time, at most READS pages: what changes meanwhile waits, fenced, for the next batch. Every drop (a failed read, too
 * many pages, a resync) starts a new epoch: an answer, or a failure, from an older one changes nothing.
 */
export class HeldRefresher {
  epoch = 0
  inflight = 0
  private asked = new Map<string, number>()
  private pending = new Set<string>()

  private readonly read: (anchor: string) => Promise<DiscussionPage>
  private readonly apply: (page: DiscussionPage, ids: readonly string[]) => readonly string[]
  private readonly drop: () => void

  constructor(
    read: (anchor: string) => Promise<DiscussionPage>,
    apply: (page: DiscussionPage, ids: readonly string[]) => readonly string[],
    drop: () => void,
  ) {
    this.read = read
    this.apply = apply
    this.drop = drop
  }

  /** The held ids not to show: changed and not yet read again, or being read again. */
  fence(changes: Changes, held: HeldMaps, window: readonly Placed[]): ReadonlySet<string> {
    const waiting = staleHeld(changes, this.asked, held.entries, new Set(window.map((w) => w.id)))
    return new Set([...this.pending, ...waiting])
  }

  /** A new epoch: what was asked is forgotten, and no older answer applies. */
  reset(): void {
    this.epoch += 1
    this.inflight = 0
    this.asked = new Map()
    this.pending = new Set()
  }

  step(changes: Changes, held: HeldMaps, window: readonly Placed[]): void {
    if (this.inflight > 0) return
    const ids = staleHeld(changes, this.asked, held.entries, new Set(window.map((w) => w.id)))
    if (ids.length === 0) return
    const byAnchor = pagesFor(ids, [...held.entries.values(), ...held.withdrawn.values(), ...window])
    if (byAnchor.size > READS) return this.giveUp()
    const asOf = this.epoch
    for (const id of ids) {
      this.asked.set(id, changes.ids.get(id) ?? 0)
      this.pending.add(id)
    }
    this.inflight = byAnchor.size
    for (const [anchor, mine] of byAnchor) {
      const sent = new Map(mine.map((id) => [id, this.asked.get(id)]))
      this.read(anchor).then(
        (page) => {
          if (this.epoch !== asOf) return
          this.inflight -= 1
          const current = mine.filter((id) => this.asked.get(id) === sent.get(id))
          for (const id of this.apply(page, current)) this.pending.delete(id)
        },
        () => {
          if (this.epoch === asOf) this.giveUp()
        },
      )
    }
  }

  private giveUp(): void {
    this.reset()
    this.drop()
  }
}

/** Keeps the held pages honest as the feed reports changes: returns the held ids not to show (fenced at render). */
export function useHeldRefresh(input: {
  projectId: string
  identity: { name: string; token: string }
  held: Held | null
  setHeld: (next: (h: Held | null) => Held | null) => void
  window: readonly Placed[]
}): ReadonlySet<string> {
  const { projectId, held, setHeld, window } = input
  const changes = useContributionChanges(ownerOf(input.identity.name, projectId))
  const token = useRef(input.identity.token)
  token.current = input.identity.token
  const [, rendered] = useState(0)
  const latest = useRef(held)
  latest.current = held
  // One refresher for this chat's life (its project is fixed for it: another project mounts another chat).
  const [refresher] = useState(
    () =>
      new HeldRefresher(
        (anchor) => getDiscussionPage(token.current, projectId, anchor),
        (page, ids) => {
          // Settled now, from the pages as last rendered: React may run the update itself later.
          const shown = latest.current
          const settled = shown && shown.projectId === projectId ? withPage(shown, page, ids).settled : []
          setHeld((h) => {
            if (!h || h.projectId !== projectId) return h
            const next = withPage(h, page, ids)
            return { ...h, entries: next.entries, withdrawn: next.withdrawn }
          })
          rendered((n) => n + 1)
          return settled
        },
        () => setHeld((h) => (h && h.projectId === projectId ? null : h)),
      ),
  )
  const resyncs = useRef(changes.resyncs)
  useEffect(() => {
    if (changes.resyncs !== resyncs.current) {
      resyncs.current = changes.resyncs
      refresher.reset()
      setHeld((h) => (h && h.projectId === projectId ? null : h))
    } else if (held) refresher.step(changes, held, window)
  }, [changes, held, projectId, refresher, setHeld, window])
  return held ? refresher.fence(changes, held, window) : NONE_STALE
}

const NONE_STALE: ReadonlySet<string> = new Set()

/** At most this many pages are read again at once. */
export const READS = 3
