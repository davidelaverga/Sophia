// What changed since you last looked, read for Home (docs/plans/home-since-you-looked.md): A34's window for each
// project Home shows, where Updates is served (the vision or the attention flag); the news Sophia's sentence says as a
// visit begins, once per line, project, account and device (features/updates/since-said.ts); and a call's project, read
// once as the call ends, since what it held was in front of the person.
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { getSince, type Since } from '../../api/vision.ts'
import { ATTENTION } from '../../app/attention.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { VISION } from '../../app/vision.ts'
import { linesOf, readerOf, readSaid, rememberSaid, unsaid, type Known } from '../updates/since-said.ts'
import type { Said } from './places-view.ts'

/** Updates is a project view under either flag (ProjectShell): elsewhere Open Updates would open «Coming». */
const SINCE_SHOWN = VISION || ATTENTION

/** As fresh as the projects' own read (Places reads them every 20 s): an arrival sooner reads nothing again. */
const FRESH_MS = 20_000

/** Under Updates' own key, so a Mark as seen there (which reads `['vision', 'since', id]` again) reads this again too. */
export const homeSinceKey = (projectId: string) => ['vision', 'since', projectId, 'home'] as const

/** Whose Home: the account its memory is kept for, and the token that reads and names the reader. */
type Account = Pick<Identity, 'name' | 'token'>

const readOf =
  (token: string, projectId: string) =>
  ({ signal }: { signal: AbortSignal }) =>
    getSince(token, projectId, signal)

export interface SinceOptions {
  /** Home is the place arrived at: a visit begins each time it is again. */
  here: boolean
  /** A call has its own sentence and Catch up: nothing is read while it lasts. */
  inCall: boolean
  /** Sophia's sentence says something else now: the call, a session soon, a live room, the first project. */
  covered: boolean
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
function useWindows(token: string, ids: readonly string[], active: boolean): ReadonlyMap<string, Since> {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: homeSinceKey(id),
      queryFn: readOf(token, id),
      enabled: active,
      staleTime: FRESH_MS,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => new Map(results.flatMap((r, i) => (r.data && ids[i] ? [[ids[i], r.data] as const] : []))),
  })
}

/** Whether an arrival may say anything: on Home, under the flags, out of a call, under no other sentence, rows known. */
const mayTell = (o: Required<SinceOptions>, ids: readonly string[] | undefined) =>
  o.here && o.enabled && !o.inCall && !o.covered && ids !== undefined

/** A visit's news from the windows read before it: what is new to the reader here, and what to keep once said. */
function arrival(windows: ReadonlyMap<string, Since>, identity: Account): Visit {
  const news = unsaid(windows, readSaid(accountOf(identity)), readerOf(identity.token))
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
  { here, inCall, covered, enabled = SINCE_SHOWN }: SinceOptions,
): Visit {
  const windows = useWindows(identity.token, ids ?? [], enabled && here && !inCall)
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
 * kept. One read per call, after it; under the flags only.
 */
export function useCallSeen(identity: Account, call: string | null, enabled = SINCE_SHOWN): void {
  const client = useQueryClient()
  const was = useRef(call)
  useEffect(() => {
    const ended = was.current
    was.current = call
    if (!enabled || ended === null || ended === call) return
    const account = accountOf(identity)
    void client
      .fetchQuery({ queryKey: homeSinceKey(ended), queryFn: readOf(identity.token, ended), staleTime: 0, retry: false })
      .then((window) => rememberSaid(account, { [ended]: linesOf(window) }))
      .catch(() => undefined)
  }, [client, identity, call, enabled])
}
