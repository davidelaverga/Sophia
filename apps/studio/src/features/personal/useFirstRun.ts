// Whether Home shows its guided first run (docs/plans/home-first-run.md), holds its place, or is as it is today: read
// from the projects, the archived ones and the profile (both asked only while no project is active), and this
// browser's memory of an end, which another tab's end reaches too. The rules: first-run.ts.
import type { UseQueryResult } from '@tanstack/react-query'
import type { ProjectList } from '@sophia/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMyProfile } from '../../app/useMyProfile.ts'
import { useArchivedRead } from '../studio/Archive.tsx'
import {
  arrivedMidRun,
  browserStore,
  endedElsewhere,
  firstRunHolds,
  firstRunPending,
  firstRunShows,
  profileFacts,
  readFirstRunDone,
  rememberFirstRunDone,
  type FirstRunFacts,
} from './first-run.ts'

/** The archived list as the first run reads it: the list, a read on its way, or one that failed. */
const archivedOf = (read: UseQueryResult<ProjectList>): FirstRunFacts['archived'] =>
  read.data ? read.data.projects : read.isError ? 'failed' : 'reading'

/** Ended in another tab of this browser, for this account: it ends here too. */
function useEndedElsewhere(account: string, enabled: boolean, ended: () => void) {
  useEffect(() => {
    if (!enabled) return undefined
    const onStorage = (e: StorageEvent) => {
      if (endedElsewhere(e, account)) ended()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [account, enabled, ended])
}

/** A project arriving while it shows (an invitation accepted, another tab) ends it, remembered as any end is. */
function useEndedByArrival(shows: boolean, projects: readonly unknown[] | undefined, end: () => void) {
  const showed = useRef(false)
  useEffect(() => {
    if (arrivedMidRun(showed.current, projects)) end()
    showed.current = shows
  }, [shows, projects, end])
}

/** `enabled` false: never (a fixture's Home as it is today). */
export function useFirstRun(identity: Identity, projects: readonly unknown[] | undefined, enabled = true) {
  const account = accountOf(identity)
  const [done, setDone] = useState(() => !enabled || readFirstRunDone(browserStore(), account))
  const none = enabled && !done && projects?.length === 0
  const archived = useArchivedRead(identity, none)
  const { profile, trouble } = useMyProfile(identity, none)
  const facts: FirstRunFacts = {
    done,
    projects,
    archived: archivedOf(archived),
    profile: profileFacts(profile, trouble),
  }
  const shows = firstRunShows(facts)
  /** It ended (finished, «Not now», Escape, a project arrived): remembered on this browser; Home is as it is today. */
  const end = useCallback(() => {
    rememberFirstRunDone(browserStore(), account)
    setDone(true)
  }, [account])
  const ended = useCallback(() => setDone(true), [])
  useEndedElsewhere(account, enabled, ended)
  useEndedByArrival(shows, projects, end)
  return { shows, holds: firstRunHolds(facts), pending: firstRunPending(facts), profile: facts.profile, end }
}
