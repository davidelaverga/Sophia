// Home's guided first run (docs/plans/home-first-run.md): the first time, with no projects, three short steps under the
// greeting (the name, alone or with a team, the first project), each one skippable. The rules and the words are here;
// FirstRun.tsx only renders them. Copy approved by Luis: verbatim.
import type { Profile } from '@sophia/contracts'
import type { ReadTrouble } from '../../app/profile-view.ts'

export type FirstStep = 'name' | 'how' | 'project'

const ORDER: readonly FirstStep[] = ['name', 'how', 'project']

/**
 * What the profile says for the first run: still being read; or no profile to change here (no route, a refusal, a read
 * that failed: a name that can't be saved isn't asked); or whether the person already chose their name (A32).
 */
export type ProfileFacts = 'reading' | 'none' | { chosen: boolean }

export interface FirstRunFacts {
  /** It ended on this browser (readFirstRunDone). */
  done: boolean
  /** The person's active projects; undefined until read (or while their read fails). */
  projects: readonly unknown[] | undefined
  /** Their archived ones (A30); undefined until read (or while their read fails). */
  archived: readonly unknown[] | undefined
  profile: ProfileFacts
}

/** Only the first time, with nothing: no project active or archived, each read answered, and the profile answered. */
export const firstRunShows = (f: FirstRunFacts): boolean =>
  !f.done && f.projects?.length === 0 && f.archived?.length === 0 && f.profile !== 'reading'

/** The profile as the first run reads it (profileFacts' cases). */
export function profileFacts(profile: Profile | null, trouble: ReadTrouble | null): ProfileFacts {
  if (profile) return { chosen: profile.chosen }
  return trouble ? 'none' : 'reading'
}

/** The steps asked: the name only of someone who hasn't chosen it, where it can be saved. */
export const firstSteps = (profile: ProfileFacts): readonly FirstStep[] =>
  profile !== 'reading' && profile !== 'none' && !profile.chosen ? ORDER : ORDER.slice(1)

/**
 * The step on screen: the first, before any; the one reached, else (the name chosen meanwhile, its step gone) the next
 * one asked after it.
 */
export function stepAt(steps: readonly FirstStep[], at: FirstStep | null): FirstStep {
  const from = at === null ? 0 : ORDER.indexOf(at)
  return ORDER.slice(from).find((s) => steps.includes(s)) ?? steps[steps.length - 1] ?? 'project'
}

/** The step after this one; null after the project, where the first run ends. */
export const afterStep = (step: FirstStep): FirstStep | null => ORDER[ORDER.indexOf(step) + 1] ?? null

/** Where Skip goes: on to the next step, the how taken as «On my own». */
export const afterSkip = (step: FirstStep): { next: FirstStep | null; team: false } => ({
  next: afterStep(step),
  team: false,
})

/** The name offered: the profile's, else the account provider's; never an email (the email stays the person's own). */
export function namePrefill(displayName: string | null, identity: { name: string; displayName?: string | null }) {
  const named = [displayName, identity.displayName, identity.name].map((n) => n?.trim() ?? '')
  return named.find((n) => n !== '' && !n.includes('@')) ?? ''
}

/** Per browser, per account: the profile has no field for it, and no new API is in scope (home-first-run.md). */
export const firstRunKey = (account: string) => `sophia.home.firstRun.v1.${account}`

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** The browser's storage, or none where reaching it throws. */
export function browserStore(): Store | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Whether the first run ended on this browser: storage blocked or gone reads as not (it may show once more). */
export function readFirstRunDone(store: Store | null, account: string): boolean {
  try {
    return store?.getItem(firstRunKey(account)) === 'done'
  } catch {
    return false
  }
}

/** It ended: finished, «Not now» or Escape. Storage that throws forgets it on reload, nothing more. */
export function rememberFirstRunDone(store: Store | null, account: string): void {
  try {
    store?.setItem(firstRunKey(account), 'done')
  } catch {
    // storage unavailable: it may show again on the next load
  }
}

/** Its words, as approved. */
export const FIRST_RUN = {
  skip: 'Skip',
  name: { title: 'What should people in your projects call you?', field: 'Your name', go: 'Continue' },
  how: {
    title: 'Will you work on your own or with a team?',
    alone: { title: 'On my own', note: 'A project for you and Sophia. You can invite people later.' },
    team: { title: 'With a team', note: 'A project you’ll invite people to.' },
  },
  project: {
    title: 'Name your first project',
    field: 'Project name',
    go: 'Start the project',
    notNow: 'Not now, just talk to Sophia',
  },
} as const

/** The presses' words while a write waits, or after no reply (the same key goes again). */
export const WAITING = { name: 'Saving…', project: 'Creating…', unknown: 'Try again' } as const
