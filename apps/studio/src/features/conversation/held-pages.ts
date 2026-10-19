// Earlier pages kept honest (4309253137, docs/plans/message-acts.md): a message older than the snapshot's window,
// already read on an earlier page, corrected or withdrawn elsewhere. The feed's contribution.corrected/withdrawn
// events name it; their ids are kept here, per project, beyond the feed's bounded recent list. The chat stops showing
// the held words at once and reads again only the page that holds them; a failed read, or a feed that lost its place
// (a gap, a resync), lets the earlier span go, and «Earlier messages» reads it again.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DiscussionEntry, DiscussionPage, WithdrawnEntry } from '@sophia/contracts'
import { getDiscussionPage } from '../../api/client.ts'
import { inOrder } from './message-acts.ts'

/**
 * The events that change what a held message shows: a correction or a withdrawal (A36), and its recipients named again
 * at the same revision (A37's contribution.mentioned: no new words, a new mention; 4309755040).
 */
export const ACTS: ReadonlySet<string> = new Set([
  'contribution.corrected',
  'contribution.withdrawn',
  'contribution.mentioned',
])

/** The messages changed elsewhere, each with the order it was learned in, and how many times the feed resynced. */
export interface Changes {
  readonly ids: ReadonlyMap<string, number>
  readonly resyncs: number
  /** Of those, the corrections and withdrawals (they may erase a source other held messages share), by when learned. */
  readonly erasing?: ReadonlyMap<string, number>
  /** Of those, the feed cursor of each message's latest correction or withdrawal (R-B56-P1: what supersedes a receipt). */
  readonly erasedAt?: ReadonlyMap<string, string>
}

/** The events that may erase a message's source, with every message sharing it (A36, 0068; r4313704366). */
export const ERASING: ReadonlySet<string> = new Set(['contribution.corrected', 'contribution.withdrawn'])

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

/** The feed applied a message's correction or withdrawal (at `cursor`): its id is kept, however many come at once. */
export function contributionChanged(owner: string, id: string, erasing = false, cursor?: string): void {
  const store = storeOf(owner)
  learned += 1
  const ids = new Map([...store.changes.ids, [id, learned]])
  const was = store.changes.erasing ?? new Map<string, number>()
  const at = store.changes.erasedAt ?? new Map<string, string>()
  if (ids.size > KEPT) return tell(store, { ids: new Map(), resyncs: store.changes.resyncs + 1 })
  const erasedAt = erasing && cursor !== undefined ? new Map([...at, [id, cursor]]) : at
  tell(store, { ...store.changes, ids, erasing: erasing ? new Map([...was, [id, learned]]) : was, erasedAt })
}

/**
 * Whether the reader's own receipt (its act's event at `receipt`) was superseded by a correction or withdrawal learned
 * later (at `erased`, R-B56-P1): its words are erased then. Its own act's event, at the same cursor, does not.
 */
export const superseded = (receipt: string | null | undefined, erased: string | undefined): boolean =>
  receipt !== null && receipt !== undefined && erased !== undefined && BigInt(erased) > BigInt(receipt)

/**
 * What a correction or withdrawal of a message took with it (r4313704366): its old source, and with it the words of
 * every other message sharing it; nothing, when it was a shared reference (withdrawing one only detaches it); or
 * unknown, when the message is not held or shown as a written message here (a withdrawn place says nothing of it).
 */
export type Gone = { source: string } | 'kept' | 'unknown'

export function goneOf(id: string, held: HeldMaps | null, window: readonly Placed[]): Gone {
  const shown = window.find((w): w is Placed & DiscussionEntry => w.id === id && 'sourceId' in w)
  const entry = held?.entries.get(id) ?? shown
  if (!entry) return 'unknown'
  return entry.kind === 'reference' ? 'kept' : { source: entry.sourceId }
}

/** The held messages, other than those acted on, whose words were kept in a source now gone: none is shown. */
export function aliasesOf(held: HeldMaps | null, gone: ReadonlySet<string>, acted: ReadonlySet<string>): string[] {
  if (!held || gone.size === 0) return []
  return [...held.entries].filter(([id, e]) => !acted.has(id) && gone.has(e.sourceId)).map(([id]) => id)
}

/**
 * The messages in the snapshot's own window, other than those acted on, whose words were kept in a source now gone
 * (4316503664): none is shown, held pages or not, while the snapshot read since has yet to land, or failed.
 */
export function windowAliasesOf(window: readonly Placed[], gone: ReadonlySet<string>, acted: ReadonlySet<string>) {
  if (gone.size === 0) return []
  return window.filter((w) => !acted.has(w.id) && 'sourceId' in w && gone.has(String(w.sourceId))).map((w) => w.id)
}

/** The held pages without those aliases, every one of a batch (r4313704366 F3): never a partial undo. */
export function withoutAliases<H extends HeldMaps>(held: H, gone: ReadonlySet<string>, acted: ReadonlySet<string>): H {
  const drop = new Set(aliasesOf(held, gone, acted))
  if (drop.size === 0) return held
  return { ...held, entries: new Map([...held.entries].filter(([id]) => !drop.has(id))) }
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
  /** The reads actually out, of any epoch: each counted until it really ends, once (R physical pending). */
  physical = 0
  private asked = new Map<string, number>()
  /** The changes as last seen (render or step): what a let-go counts as asked. */
  private latest: Changes = { ids: new Map(), resyncs: 0 }
  private pending = new Set<string>()

  private readonly read: (anchor: string) => Promise<DiscussionPage>
  private readonly apply: (page: DiscussionPage, ids: readonly string[]) => readonly string[]
  private readonly drop: () => void
  /** A read ended: waiting work may now fit. */
  private readonly wake: () => void

  constructor(
    read: (anchor: string) => Promise<DiscussionPage>,
    apply: (page: DiscussionPage, ids: readonly string[]) => readonly string[],
    drop: () => void,
    wake: () => void = () => {},
  ) {
    this.read = read
    this.apply = apply
    this.drop = drop
    this.wake = wake
  }

  /** The held ids not to show: changed and not yet read again, or being read again. */
  fence(changes: Changes, held: HeldMaps, window: readonly Placed[]): ReadonlySet<string> {
    this.latest = changes
    const waiting = staleHeld(changes, this.asked, held.entries, new Set(window.map((w) => w.id)))
    return new Set([...this.pending, ...waiting])
  }

  /**
   * A new epoch (the held pages are let go): no older answer applies, and what was known at this moment counts as asked,
   * a copy taken now. Pages read after it are read fresh, so they are not fenced again for those changes (the
   * relinquish loop, R fallback-reload); a change learned later is newer than the copy and is fenced and read.
   */
  reset(): void {
    this.epoch += 1
    this.inflight = 0
    this.asked = new Map(this.latest.ids)
    this.pending = new Set()
  }

  step(changes: Changes, held: HeldMaps, window: readonly Placed[]): void {
    this.latest = changes
    if (this.inflight > 0) return
    const ids = staleHeld(changes, this.asked, held.entries, new Set(window.map((w) => w.id)))
    if (ids.length === 0) return
    const byAnchor = pagesFor(ids, [...held.entries.values(), ...held.withdrawn.values(), ...window])
    if (byAnchor.size > READS) return this.giveUp()
    // Older reads still out keep their place: new ones go only within what is left.
    if (this.physical + byAnchor.size > READS) return
    const asOf = this.epoch
    for (const id of ids) {
      this.asked.set(id, changes.ids.get(id) ?? 0)
      this.pending.add(id)
    }
    this.inflight = byAnchor.size
    for (const [anchor, mine] of byAnchor) {
      const sent = new Map(mine.map((id) => [id, this.asked.get(id)]))
      this.physical += 1
      this.read(anchor).then(
        (page) => {
          this.physical -= 1
          this.wake()
          if (this.epoch !== asOf) return
          this.inflight -= 1
          const current = mine.filter((id) => this.asked.get(id) === sent.get(id))
          for (const id of this.apply(page, current)) this.pending.delete(id)
        },
        () => {
          this.physical -= 1
          this.wake()
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

/** Whether a message as shown has words known erased (R-B55-P1). */
type Erased = (shown: { id: string; sourceId?: string; revision?: number }, receipt?: string | null) => boolean

/** Keeps the held pages honest as the feed reports changes: returns the held ids not to show (fenced at render). */
export function useHeldRefresh(input: {
  projectId: string
  identity: { name: string; token: string }
  held: Held | null
  setHeld: (next: (h: Held | null) => Held | null) => void
  window: readonly Placed[]
  /** A manual «Earlier» read is out: what is learned meanwhile stays new for the page it brings (4316503672). */
  reading?: boolean
}): readonly [ReadonlySet<string>, () => string, Erased] {
  const { projectId, held, setHeld, window } = input
  const changes = useContributionChanges(ownerOf(input.identity.name, projectId))
  const token = useRef(input.identity.token)
  token.current = input.identity.token
  const [tick, rendered] = useState(0)
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
        () => rendered((n) => n + 1),
      ),
  )
  const resyncs = useRef(changes.resyncs)
  const erasure = useErasure(changes, held, window, input.reading ?? false)
  useEffect(() => {
    if (changes.resyncs !== resyncs.current) {
      resyncs.current = changes.resyncs
      refresher.reset()
      setHeld((h) => (h && h.projectId === projectId ? null : h))
      return
    }
    if (erasure.fresh) {
      erasure.handled()
      // Which source went is unknown here: the held pages go, and a new epoch keeps any answer asked for before (a
      // page's read again or a manual «Earlier» one) from bringing them back (F2).
      if (erasure.unknown) {
        refresher.reset()
        return setHeld((h) => (h && h.projectId === projectId ? null : h))
      }
    }
    // Every time, not only when learned: a page let in since (a read asked for earlier) can't bring an alias back.
    if (held && aliasesOf(held, erasure.gone, erasure.acted).length > 0)
      setHeld((h) => (h && h.projectId === projectId ? withoutAliases(h, erasure.gone, erasure.acted) : h))
    else if (held) refresher.step(changes, held, window)
  }, [changes, erasure, held, projectId, refresher, setHeld, tick, window])
  // A manual «Earlier» read asked before an erasure was learned brings nothing back (F2: a named message's old words too).
  const epoch = () => `${refresher.epoch}:${erasure.generation()}`
  const inWindow = windowAliasesOf(window, erasure.gone, erasure.acted)
  if (!held) return [inWindow.length > 0 ? new Set(inWindow) : NONE_STALE, epoch, erasure.erased] as const
  // At render (F1): the aliases of a source gone, or every held message while which went is unknown, are not shown.
  const hidden = erasure.unknown ? [...held.entries.keys()] : aliasesOf(held, erasure.gone, erasure.acted)
  return [new Set([...refresher.fence(changes, held, window), ...hidden, ...inWindow]), epoch, erasure.erased] as const
}

/**
 * What each erasure took, told as learned, pages held or not: the window may hold an alias (4316503664). With none
 * held, a message not shown is told again once a page holds it (its source may be there).
 */
function learnGone(
  known: Map<string, Gone>,
  erasing: readonly [string, number][],
  held: HeldMaps | null,
  window: readonly Placed[],
  shownAt: Map<string, number>,
) {
  for (const [id, at] of erasing) {
    const key = `${id}@${at}`
    const gone = known.has(key) ? undefined : goneOf(id, held, window)
    if (gone === undefined || (!held && gone === 'unknown')) continue
    known.set(key, gone)
    // The revision it showed then: its erased words are that one, or older (R-B55-P1).
    if (typeof gone === 'object') shownAt.set(id, revisionOf(held?.entries.get(id) ?? window.find((w) => w.id === id)))
  }
}

const revisionOf = (shown: object | undefined) =>
  shown && 'revision' in shown && typeof shown.revision === 'number' ? shown.revision : 1

/**
 * The erasures learned (r4313704366), as this chat can tell them: the sources gone, the messages acted on, and whether
 * one learned since the last handling has a source unknown here. Read at render, from the held pages as they are.
 */
function useErasure(changes: Changes, held: HeldMaps | null, window: readonly Placed[], reading: boolean) {
  const known = useRef(new Map<string, Gone>())
  const shownAt = useRef(new Map<string, number>())
  const handledAt = useRef(0)
  const erasing = [...(changes.erasing ?? [])]
  learnGone(known.current, erasing, held, window, shownAt.current)
  // With none held and no read out, what is learned is handled at once: the first page read after it is read since,
  // and is not dropped for it (4316503672). Learned while a manual read is out, it stays new for the page that read
  // brings, so that page is fenced or let go for it as before (F2).
  const latest = held || !reading ? Math.max(0, ...erasing.map(([, at]) => at)) : handledAt.current
  const fresh = latest > handledAt.current
  const gone = new Set<string>()
  let unknown = false
  for (const [key, g] of known.current) {
    if (typeof g === 'object') gone.add(g.source)
    else if (g === 'unknown' && fresh && Number(key.slice(key.lastIndexOf('@') + 1)) > handledAt.current) unknown = true
  }
  const acted = new Set(erasing.map(([id]) => id))
  return {
    gone,
    acted,
    fresh,
    unknown,
    handled: () => (handledAt.current = latest),
    generation: () => handledAt.current,
    // A message shown with a source known gone is not shown (R-B55-P1): a snapshot read since that lags or fails still
    // has it so, the one acted on too. The acted one shows again at a newer revision (a read since, the reader's receipt).
    // A receipt shown (`receipt`: its act's cursor) goes once a later correction or withdrawal erased it (R-B56-P1).
    erased: (shown: { id: string; sourceId?: string; revision?: number }, receipt?: string | null) =>
      superseded(receipt, changes.erasedAt?.get(shown.id)) ||
      (shown.sourceId !== undefined &&
        gone.has(shown.sourceId) &&
        (shown.revision ?? 1) <= (shownAt.current.get(shown.id) ?? Infinity)),
  }
}

const NONE_STALE: ReadonlySet<string> = new Set()

/** At most this many pages are read again at once. */
export const READS = 3
