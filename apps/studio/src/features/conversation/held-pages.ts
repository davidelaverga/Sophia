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

const stores = new Map<string, Store>()
let learned = 0

function storeOf(projectId: string): Store {
  const found = stores.get(projectId)
  if (found) return found
  const made: Store = { changes: { ids: new Map(), resyncs: 0 }, listeners: new Set() }
  stores.set(projectId, made)
  return made
}

function tell(store: Store, changes: Changes) {
  store.changes = changes
  for (const listener of store.listeners) listener()
}

/** The feed applied a message's correction or withdrawal: its id is kept, however many come at once. */
export function contributionChanged(projectId: string, id: string): void {
  const store = storeOf(projectId)
  learned += 1
  tell(store, { ...store.changes, ids: new Map([...store.changes.ids, [id, learned]]) })
}

/** The feed lost its place and read the snapshot again: what changed meanwhile is unknown. */
export function feedResynced(projectId: string): void {
  const store = storeOf(projectId)
  tell(store, { ...store.changes, resyncs: store.changes.resyncs + 1 })
}

/** What the feed reported for a project so far. */
export const changesOf = (projectId: string): Changes => storeOf(projectId).changes

export function useContributionChanges(projectId: string): Changes {
  const store = storeOf(projectId)
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

interface HeldMaps {
  entries: ReadonlyMap<string, DiscussionEntry>
  withdrawn: ReadonlyMap<string, WithdrawnEntry>
}

/**
 * A page read again over what was held: the page decides for its own span only (from its oldest to its newest), so a
 * message withdrawn there leaves and one corrected shows its words; what lies outside the span stays.
 */
export function withPage(held: HeldMaps, page: DiscussionPage): HeldMaps {
  const entries = new Map(held.entries)
  const withdrawn = new Map(held.withdrawn)
  const span = [...page.entries, ...(page.withdrawn ?? [])].toSorted(inOrder)
  const [start, end] = [span[0], span.at(-1)]
  if (start && end)
    for (const [id, entry] of entries) if (inOrder(entry, start) >= 0 && inOrder(entry, end) <= 0) entries.delete(id)
  for (const entry of page.entries) entries.set(entry.id, entry)
  for (const w of page.withdrawn ?? []) withdrawn.set(w.id, w)
  for (const id of withdrawn.keys()) entries.delete(id)
  return { entries, withdrawn }
}

interface Held extends HeldMaps {
  projectId: string
  atStart: boolean
}

/**
 * Keeps the held pages honest as the feed reports changes: returns the held ids not to show while their page is read
 * again. A late answer is used only if nothing newer was learned for its messages since it was asked.
 */
export function useHeldRefresh(input: {
  projectId: string
  token: string
  held: Held | null
  setHeld: (next: (h: Held | null) => Held | null) => void
  window: readonly Placed[]
}): ReadonlySet<string> {
  const { projectId, token, held, setHeld, window } = input
  const changes = useContributionChanges(projectId)
  const asked = useRef(new Map<string, number>())
  const resyncs = useRef(changes.resyncs)
  const [stale, setStale] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const drop = () => setHeld((h) => (h && h.projectId === projectId ? null : h))
    if (changes.resyncs !== resyncs.current) {
      resyncs.current = changes.resyncs
      if (held) drop()
      return
    }
    if (!held) return
    const ids = staleHeld(changes, asked.current, held.entries, new Set(window.map((w) => w.id)))
    if (ids.length === 0) return
    const now = new Map(ids.map((id) => [id, changes.ids.get(id) ?? 0]))
    for (const [id, n] of now) asked.current.set(id, n)
    setStale((s) => new Set([...s, ...ids]))
    const items = [...held.entries.values(), ...held.withdrawn.values(), ...window]
    const anchors = new Set(ids.map((id) => anchorOf(id, items)).filter((a): a is string => a !== undefined))
    const current = () => [...now].every(([id, n]) => asked.current.get(id) === n)
    for (const anchor of anchors)
      getDiscussionPage(token, projectId, anchor).then(
        (page) => {
          if (!current()) return
          setHeld((h) => (h && h.projectId === projectId ? { ...h, ...withPage(h, page) } : h))
          setStale((s) => new Set([...s].filter((id) => !now.has(id))))
        },
        () => {
          drop()
          setStale(new Set())
        },
      )
  }, [changes, held, projectId, setHeld, token, window])
  return stale
}
