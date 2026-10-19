// What changed since you last looked, read for Home (docs/plans/home-since-you-looked.md): A34's window for each
// project Home shows, where Updates is served (the vision or the attention flag); the news Sophia's sentence says as a
// visit begins, once per line, project, account and device (features/updates/since-said.ts); and a call's project, read
// once as the call ends, since what it held was in front of the person, and again while that read hasn't taken: as
// Home is arrived at, or the browser is online again. And a project's own window as the person arrives in it, said once
// under its bar by the same memory (project-arrival-since.md).
import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { getSince, type Since } from '../../api/vision.ts'
import { ATTENTION } from '../../app/attention.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { VISION } from '../../app/vision.ts'
import {
  arrivalOf,
  linesOf,
  markPending,
  readerOf,
  readPending,
  readSaid,
  rememberSaid,
  settlePending,
  unsaid,
  type Arrival,
  type Known,
} from '../updates/since-said.ts'
import type { Said } from './places-view.ts'

/** Updates is a project view under either flag (ProjectShell): elsewhere Open Updates would open «Coming». */
const SINCE_SHOWN = VISION || ATTENTION

/** As fresh as the projects' own read (Places reads them every 20 s): an arrival sooner reads nothing again. */
const FRESH_MS = 20_000

/** Under Updates' own key, so a Mark as seen there (which reads `['vision', 'since', id]` again) reads this again too. */
export const homeSinceKey = (projectId: string) => ['vision', 'since', projectId, 'home'] as const

/** Whose Home: the account its memory is kept for, and the token that reads and names the reader. */
type Account = Pick<Identity, 'name' | 'token'>

/** A project's window, read: if its call's read was pending, this read is it, and it is kept (settlePending). */
const readOf =
  (identity: Account, projectId: string) =>
  async ({ signal }: { signal: AbortSignal }) => {
    const since = await getSince(identity.token, projectId, signal)
    settlePending(accountOf(identity), projectId, since)
    return since
  }

/** A call's project read after the call, kept as it comes (readOf); one that fails leaves it pending. */
const readAfter = (client: QueryClient, identity: Account, projectId: string) =>
  void client
    .fetchQuery({ queryKey: homeSinceKey(projectId), queryFn: readOf(identity, projectId), staleTime: 0, retry: false })
    .catch(() => undefined)

export interface SinceOptions {
  /** Home is the place arrived at: a visit begins each time it is again. */
  here: boolean
  /** A call has its own sentence and Catch up: nothing is read while it lasts. */
  inCall: boolean
  /** Sophia's sentence says something else now: the call, a session soon, a live room, the first project. */
  covered: boolean
  /** Every project the person has, by id, once read: an arrival reads a call's pending project only among them. */
  theirs: readonly string[] | undefined
  /** The vision or attention flag by default; a fixture decides for itself. */
  enabled?: boolean
}

/** What a visit says: each project's window trimmed to its news; and, to keep once said, those windows' lines whole. */
export interface Visit {
  news: ReadonlyMap<string, Since>
  lines: Known
}

const QUIET: Visit = { news: new Map(), lines: {} }

/** The windows of `ids` this page has read, by project, read again while `active` once 20 s old; never retried. */
function useWindows(identity: Account, ids: readonly string[], active: boolean): ReadonlyMap<string, Since> {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: homeSinceKey(id),
      queryFn: readOf(identity, id),
      enabled: active,
      staleTime: FRESH_MS,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => new Map(results.flatMap((r, i) => (r.data && ids[i] ? [[ids[i], r.data] as const] : []))),
  })
}

/**
 * The calls' projects still pending that the person has (`theirs`) and Home's rows (`ids`) leave out, read once each as
 * Home is arrived at with both known, or as they change (Codex P2 on #468, its review): else nothing reads one Home
 * doesn't show until the browser is `online` again, and the read once it is shown keeps whole what others did there
 * since the call. One the person no longer has is left to `online`: Home can't show it, and a read would be refused.
 */
function usePendingReads(
  identity: Account,
  ids: readonly string[] | undefined,
  theirs: readonly string[] | undefined,
  active: boolean,
): void {
  const client = useQueryClient()
  const rows = ids?.join(' ')
  const all = theirs?.join(' ')
  useEffect(() => {
    if (!active || rows === undefined || all === undefined) return
    const shown = rows.split(' ')
    const had = all.split(' ')
    for (const projectId of readPending(accountOf(identity)))
      if (had.includes(projectId) && !shown.includes(projectId)) readAfter(client, identity, projectId)
  }, [client, identity, active, rows, all])
}

/** Whether an arrival may say anything: on Home, under the flags, out of a call, under no other sentence, rows known. */
const mayTell = (o: Required<Omit<SinceOptions, 'theirs'>>, ids: readonly string[] | undefined) =>
  o.here && o.enabled && !o.inCall && !o.covered && ids !== undefined

/**
 * A visit's news from the windows read before it: what is new to the reader here, none of a call's project whose read
 * is pending, and what to keep once said.
 */
function arrival(windows: ReadonlyMap<string, Since>, identity: Account): Visit {
  const account = accountOf(identity)
  const news = unsaid(windows, readSaid(account), readerOf(identity.token), readPending(account))
  const lines = Object.fromEntries([...windows].filter(([id]) => news.has(id)).map(([id, w]) => [id, linesOf(w)]))
  return { news, lines }
}

/**
 * What this visit says. A visit begins at each arrival on Home and decides then, from the windows this page read before
 * it, for the projects drawn with it: Sophia's sentence is drawn with the news from its first frame, and nothing under
 * the greeting moves while Home stays open. It says nothing in a call, under another sentence, before its projects are
 * known, or before anything was read (a page's first arrival reads, the next says); its reads serve the next arrival.
 * Covered mid-visit, it is over for that visit. Read only on Home, under the flags, never in a call.
 */
export function useSinceNews(
  identity: Account,
  ids: readonly string[] | undefined,
  { here, inCall, covered, theirs, enabled = SINCE_SHOWN }: SinceOptions,
): Visit {
  const reads = enabled && here && !inCall
  const windows = useWindows(identity, ids ?? [], reads)
  usePendingReads(identity, ids, theirs, reads)
  const [visit, setVisit] = useState(QUIET)
  const [wasHere, setWasHere] = useState(false)
  if (here !== wasHere) {
    setWasHere(here)
    setVisit(mayTell({ here, inCall, covered, enabled }, ids) ? arrival(windows, identity) : QUIET)
  } else if (covered && visit.news.size > 0) {
    setVisit(QUIET)
  }
  return here ? visit : QUIET
}

/** Once Sophia's sentence says the news, its projects' windows are kept: none of it is said again on this device. */
export function useSaidOnce(identity: Account, visit: Visit, says: readonly Said[]) {
  const said = says.some((s) => s.updates !== undefined)
  const account = accountOf(identity)
  useEffect(() => {
    if (said) rememberSaid(account, visit.lines)
  }, [said, account, visit])
}

/**
 * A call's end, wherever the person is then (SignedIn): what its project held by then was in front of them, in the room
 * or its recap, so its window is read once and kept, and Home never tells them what their own call decided, made or
 * kept. One read per call, after it; under the flags only. Its project is pending until a read takes (Codex P2 on
 * #468): Home says nothing of it, Home's own read of it counts as the call's, an arrival on Home reads it if Home
 * doesn't show it (usePendingReads), and the browser back online reads it once more. No timer, no polling.
 */
export function useCallSeen(identity: Account, call: string | null, enabled = SINCE_SHOWN): void {
  const client = useQueryClient()
  const was = useRef(call)
  useEffect(() => {
    const ended = was.current
    was.current = call
    if (!enabled || ended === null || ended === call) return
    markPending(accountOf(identity), ended)
    readAfter(client, identity, ended)
  }, [client, identity, call, enabled])
  useEffect(() => {
    if (!enabled) return undefined
    const retry = () => {
      for (const projectId of readPending(accountOf(identity))) readAfter(client, identity, projectId)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [client, identity, enabled])
}

/** What a project's arrival weighs (project-arrival-since.md). */
export interface ArrivalOptions {
  /** The project is drawn: loaded, not refused. One kept out of sight behind its call is in a call (`inCall`). */
  drawn: boolean
  /** Its room holds a call, which has its own sentence and Catch up. */
  inCall: boolean
  /** Updates is the view: it says it all, and keeps what it shows. */
  atUpdates: boolean
  /** The newcomer's welcome held the place under the bar as the project opened. */
  welcomed: boolean
  /** The vision or attention flag by default; a fixture decides for itself. */
  enabled?: boolean
}

/** A visit to a project, one per open: reading its window, its line said, or over (nothing said, or no longer). */
type ArrivalStep = { step: 'reading' } | { step: 'said'; arrival: Arrival } | { step: 'over' }

/** What the window read says to this reader here, kept as soon as it is decided: shown is said. */
function arrivalNow(identity: Account, projectId: string, window: Since): ArrivalStep {
  const account = accountOf(identity)
  const said = arrivalOf(projectId, window, {
    said: readSaid(account),
    reader: readerOf(identity.token),
    pending: readPending(account),
  })
  if (!said) return { step: 'over' }
  rememberSaid(account, said.lines)
  return { step: 'said', arrival: said }
}

/**
 * What a project says as the person arrives in it: what others decided, made and kept since they last looked, once per
 * window, project, account and device, with Home (since-said.ts). One open, one visit (ProjectShell is keyed by the
 * project): it reads once the project is drawn, under Home's key and freshness, so an open just after Home reads
 * nothing, and decides after a commit, so the status that says it is there before its words. Nothing when the visit
 * begins at Updates or with the welcome; a call or Updates ends it, as `dismiss` does. Never polled or retried.
 */
export function useArrivalSince(
  identity: Account,
  projectId: string,
  { drawn, inCall, atUpdates, welcomed, enabled = SINCE_SHOWN }: ArrivalOptions,
) {
  const [visit, setVisit] = useState<ArrivalStep>(() => ({ step: atUpdates || welcomed ? 'over' : 'reading' }))
  const ends = inCall || atUpdates
  if (ends && visit.step !== 'over') setVisit({ step: 'over' })
  const reading = enabled && drawn && !ends && visit.step === 'reading'
  const read = useQuery({
    queryKey: homeSinceKey(projectId),
    queryFn: readOf(identity, projectId),
    enabled: reading,
    staleTime: FRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const settled = read.isFetching ? undefined : read.isError ? null : read.data
  useEffect(() => {
    if (!reading || settled === undefined) return
    setVisit(settled ? arrivalNow(identity, projectId, settled) : { step: 'over' })
  }, [reading, settled, identity, projectId])
  return { arrival: visit.step === 'said' ? visit.arrival : null, dismiss: () => setVisit({ step: 'over' }) }
}
