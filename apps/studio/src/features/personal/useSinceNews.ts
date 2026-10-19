// What changed since you last looked, read for Home (docs/plans/home-since-you-looked.md): A34's window for each
// project Home shows, where Updates is served (the vision or the attention flag), and the news Sophia's sentence may
// say on this visit, once per window, project, account and device (features/updates/since-said.ts).
import { useQueries } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getSince, type Since } from '../../api/vision.ts'
import { ATTENTION } from '../../app/attention.ts'
import { VISION } from '../../app/vision.ts'
import { newsKeys, readSaid, rememberSaid, unsaid } from '../updates/since-said.ts'
import type { Said } from './places-view.ts'

/** Updates is a project view under either flag (ProjectShell): elsewhere Open Updates would open «Coming». */
const SINCE_SHOWN = VISION || ATTENTION

/** As fresh as the projects' own read (Places reads them every 20 s): an arrival sooner reads nothing again. */
const FRESH_MS = 20_000

/** Under Updates' own key, so a Mark as seen there (which reads `['vision', 'since', id]` again) reads this again too. */
export const homeSinceKey = (projectId: string) => ['vision', 'since', projectId, 'home'] as const

const NONE: ReadonlyMap<string, Since> = new Map()

export interface SinceOptions {
  /** Home is the place arrived at: a visit begins each time it is again. */
  here: boolean
  /** A call has its own sentence and Catch up: nothing is read while it lasts. */
  inCall: boolean
  /** The vision or attention flag by default; a fixture decides for itself. */
  enabled?: boolean
}

/**
 * The windows of `ids`, once every read settled. One read each, kept 20 s, only while `active`: never polled, never
 * retried; a read refused or failed says nothing.
 */
function useWindows(token: string, ids: readonly string[], active: boolean) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: homeSinceKey(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getSince(token, id, signal),
      enabled: active,
      staleTime: FRESH_MS,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => ({
      settled: results.every((r) => !r.isFetching),
      windows: new Map(results.flatMap((r, i) => (r.data && ids[i] ? [[ids[i], r.data] as const] : []))),
    }),
  })
}

/** This visit's number, and what was said before it began: a visit begins at each arrival on Home. */
function useVisit(account: string, here: boolean) {
  const [visit, setVisit] = useState(() => ({ n: 0, before: readSaid(account) }))
  const [wasHere, setWasHere] = useState(here)
  if (here !== wasHere) {
    setWasHere(here)
    if (here) setVisit((v) => ({ n: v.n + 1, before: readSaid(account) }))
  }
  return visit
}

/**
 * What this visit may say: the windows of the projects shown with news not said before it began, fixed once their
 * reads settle, so nothing comes or goes while Home stays open. Read only on Home, under the flags, never in a call.
 */
export function useSinceNews(
  token: string,
  account: string,
  ids: readonly string[],
  { here, inCall, enabled = SINCE_SHOWN }: SinceOptions,
): ReadonlyMap<string, Since> {
  const active = enabled && here && !inCall
  const read = useWindows(token, ids, active)
  const visit = useVisit(account, here)
  const [fixed, setFixed] = useState<{ visit: number; news: ReadonlyMap<string, Since> } | null>(null)
  // Not before the projects are known: a visit fixed with none would never say what their windows hold.
  if (active && ids.length > 0 && read.settled && fixed?.visit !== visit.n) {
    setFixed({ visit: visit.n, news: unsaid(read.windows, visit.before) })
  }
  return fixed?.visit === visit.n ? fixed.news : NONE
}

/** Once Sophia's sentence says the news, it is kept as said: the next arrival with the same windows says nothing. */
export function useSaidOnce(account: string, news: ReadonlyMap<string, Since>, says: readonly Said[]) {
  const said = says.some((s) => s.updates !== undefined)
  useEffect(() => {
    if (said) rememberSaid(account, newsKeys(news))
  }, [said, account, news])
}
