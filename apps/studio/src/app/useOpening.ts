// The opening's work from React (docs/plans/entry-opening.md): the session known, Home's own reads settled, the
// person's likeliest projects warmed; then it hands off. A screen that reads nothing first (the sign-in after a link
// that failed, a link's question, the join page) is ready once drawn with its own face of the font.
import { useIsFetching, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query'
import type { ProjectList } from '@sophia/contracts'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { AuthState } from './auth.ts'
import type { Identity } from './dev-identity.ts'
import { PREPARE_AT_MOST_MS, WARM_AT_MOST_MS } from './entry-progress.ts'
import { cover, open, reach, showing } from './entry.ts'
import { likeliest, warmCode, warmProjects } from './warm.ts'

/** The font's own face, or this long at most: the first screen never waits on it longer. */
const FONT_AT_MOST_MS = 600

const nextFrames = (then: () => void) => {
  let id = requestAnimationFrame(() => (id = requestAnimationFrame(then)))
  return () => cancelAnimationFrame(id)
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Signed in from this very tab (its code, its passkey): the person is looking at it. A session that arrives from
 * another tab (the email's link opened there) lands without an opening: they saw theirs in that tab, once.
 */
const signedInHere = () => document.visibilityState === 'visible' && document.hasFocus()

/**
 * The session's step, and readiness for a screen that reads nothing first. Signed in from the page itself (a code, a
 * passkey, a dev identity), the opening covers it, before that frame is painted, until the Studio is ready.
 */
export function useOpening(status: AuthState['status'], preparesStudio: boolean): void {
  const was = useRef(status)
  useLayoutEffect(() => {
    const before = was.current
    was.current = status
    if (status === 'loading') return undefined
    const fromHere = before !== 'loading' && before !== 'signed_in' && signedInHere()
    if (status === 'signed_in' && preparesStudio && fromHere) cover()
    if (status === 'signed_in') reach('session')
    if (preparesStudio) {
      const timer = setTimeout(() => void open(), PREPARE_AT_MOST_MS)
      return () => clearTimeout(timer)
    }
    let stop = () => undefined as void
    const faced = Promise.race([document.fonts.ready, wait(FONT_AT_MOST_MS)])
    let live = true
    // Anything but the Studio (a link that failed, a link's question, the join page): a short fade, nothing more.
    void faced.then(() => {
      if (live) stop = nextFrames(() => void open(true))
    })
    return () => {
      live = false
      stop()
    }
  }, [status, preparesStudio])
}

/** Home's own first reads, for this person: their space and their projects (usePersonal.ts). */
const homeRead = (name: string) => (q: Query) =>
  q.queryKey.length === 2 && (q.queryKey[0] === 'personal' || q.queryKey[0] === 'projects') && q.queryKey[1] === name

/** With Home ready: the likeliest projects warmed, and the code that comes later fetched, then all is ready. */
async function prepare(client: QueryClient, identity: Identity): Promise<void> {
  const list = client.getQueryData<ProjectList>(['projects', identity.name])
  const ids = list ? likeliest(list.projects, new Date()) : []
  warmCode()
  if (ids.length > 0) {
    reach('space')
    await Promise.race([warmProjects(client, ids, identity.name, identity.token), wait(WARM_AT_MOST_MS)])
  }
  reach('warm')
}

/**
 * Inside the signed-in Studio, while the opening is up: once Home's own reads have settled for two frames running,
 * its likeliest next places are made ready, and the opening hands off.
 */
export function OpeningPrepares({ identity }: { identity: Identity }): null {
  const client = useQueryClient()
  const reading = useIsFetching({ predicate: homeRead(identity.name) })
  const started = useRef(false)
  useEffect(() => {
    if (reading > 0 || started.current || !showing()) return undefined
    return nextFrames(() => {
      started.current = true
      void prepare(client, identity)
        .catch(() => undefined)
        .finally(() => void open())
    })
  }, [reading, client, identity])
  return null
}
