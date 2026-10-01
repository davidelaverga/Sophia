// The words of the three places (direction C): the greeting, what each door says it opens, how a project card in Work
// reads, who can see a place, how privacy works, and what a read that is slow or failed says. Pure, so the copy is
// tested and components only render it.
import type { PersonalTurn, ProjectSummary } from '@sophia/contracts'
import type { Place } from '../../app/route.ts'
import { shortName } from '../voice/room-view.ts'
import { dayLabel, topicOf } from './conversation-view.ts'

const MINUTE = 60_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** A session this close (or already started) makes the Work door and its card say "Join the room". */
export const SOON_MIN = 10

/** The browser tab's title in each place, the way a project's reads ("Launch plan · Sophia"). */
export const PLACE_TITLE: Record<Place, string> = {
  home: 'Sophia',
  personal: 'Personal · Sophia',
  work: 'Work · Sophia',
}

/**
 * Where a read stands. Idle is a read that is not asked (the personal space behind the padlock); a read asked again
 * after a failure is loading, so Try again answers at once.
 */
export type ReadState = 'idle' | 'loading' | 'failed' | 'ready'

export function readState(read: { data: unknown; isFetching: boolean; isError: boolean }): ReadState {
  if (read.data !== undefined) return 'ready'
  if (read.isFetching) return 'loading'
  return read.isError ? 'failed' : 'idle'
}

/** A failed read, said where its content would be: nothing that failed to load may look empty (or deleted). */
export const READ_FAILED = {
  personal: 'Couldn’t load your personal space.',
  projects: 'Couldn’t load your projects.',
} as const

/** The first visit's one sentence about the line between the doors. */
export const INTRO = {
  lead: 'Private on the left, shared on the right.',
  rest: 'Nothing crosses unless you carry it, and the padlock locks your personal space.',
} as const

/** Who can see a place, as the bar's chip says it and explains it when pressed. */
export const WHO_SEES = {
  personal: {
    chip: 'Only you',
    name: 'Who can see your personal space',
    says: 'Only you can see this space. Your projects and their members can’t read it, and Sophia doesn’t bring it into them.',
  },
  work: {
    chip: 'Your team',
    name: 'Who can see Work',
    says: 'Everyone in these projects sees what’s here, including what you carried over.',
  },
} as const

/** How privacy works, in three rules. */
export const PRIVACY_RULES = [
  {
    lead: 'Private on the left, shared on the right.',
    rest: 'Your personal space is yours alone. Your projects and their members can’t read it, and Sophia doesn’t bring it into them.',
  },
  {
    lead: 'Nothing crosses unless you carry it.',
    rest: 'A note goes to one project exactly as written, and you can take it back.',
  },
  {
    lead: 'The padlock locks your personal space.',
    rest: 'Opening it again asks for your passkey. It also locks by itself when you join a room.',
  },
] as const

/** The padlock on the line between the doors: what pressing it does, and its key when it has one. */
export const LOCK_TIP = {
  open: { label: 'Lock your personal space', keys: 'L' },
  you: { label: 'Unlock with your passkey', keys: 'L' },
  room: { label: 'Locked while you’re in a room. Leaving opens it.', keys: null },
} as const

/** The edge from Work to Personal: where it goes, or why it is shut. */
export const EDGE_TIP = {
  open: 'Cross to Personal',
  you: 'Your personal space is locked. Opening it asks for your passkey.',
  room: 'Your personal space is locked while you’re in a room.',
} as const

/** Confirming it's the same person before the personal space opens again. */
export const UNLOCK = {
  title: 'Unlock your personal space',
  withPasskey: 'Confirm it’s you with your passkey.',
  plain: 'Confirm it’s you.',
  otherAccount: 'That was another account. Your personal space stays locked.',
  failed: 'That didn’t work. Try another way.',
  dev: 'Dev identities: nothing is checked here.',
  waysFailed: 'The ways to confirm it’s you couldn’t load.',
  noOther: 'No other way is set up for this account.',
  sending: (to: string) => `Sending a code to ${to}…`,
  sent: (to: string) => `Code sent to ${to}`,
  /** Signing in again with a provider leaves the page, and a call can't come along. */
  inCall: (names: string) => `${names} isn’t offered during a call: it leaves this page, and the call would end.`,
} as const

/** The name a greeting uses: a provider's first name, or a dev identity's own name; never an email. */
export function firstName(identity: { name: string; displayName?: string | null }): string | null {
  const shown = identity.displayName?.trim()
  if (shown) return shown.split(/\s+/)[0] ?? null
  return identity.name.includes('@') ? null : identity.name
}

export function greeting(hour: number, name: string | null, fresh: boolean): string {
  const hello = fresh ? 'Welcome' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${hello}, ${name}` : hello
}

export const dateLine = (now: Date) =>
  now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })

export type LockedBy = 'you' | 'room'

export interface YouDoor {
  verb: string
  meta: string
  /** How many notes the door offers to open, or null to offer none. */
  notes: number | null
}

/**
 * What the Personal door opens: the conversation to continue, a first one to start, or a locked space. It names the
 * last day by what it was about (its first topic), or just now by the latest one. Until the space has loaded it only
 * opens: a first conversation offered over one that is still loading would read as the old one gone.
 */
export function youDoor(input: {
  locked: LockedBy | null
  /** Undefined until the space has loaded. */
  turns: readonly PersonalTurn[] | undefined
  notes: number
  now: Date
}): YouDoor {
  if (input.locked) {
    return {
      verb: 'Unlock',
      meta: input.locked === 'room' ? 'Locked while you’re in a room' : 'Locked on this device',
      notes: null,
    }
  }
  if (!input.turns) return { verb: 'Open', meta: '', notes: null }
  const said = input.turns.filter((t) => t.author === 'person')
  const last = said.at(-1)
  if (!last) return { verb: 'Start talking', meta: 'Sophia is here whenever you are', notes: null }
  const at = new Date(last.createdAt)
  const justNow = input.now.getTime() - at.getTime() < 15 * MINUTE
  const thatDay = said.find((t) => startOfDay(new Date(t.createdAt)) === startOfDay(at)) ?? last
  const meta = `${justNow ? 'Just now' : dayLabel(at, input.now)} · ${topicOf((justNow ? last : thatDay).text)}`
  return { verb: 'Continue', meta, notes: input.notes || null }
}

export const notesLabel = (n: number) => `${n} note${n === 1 ? '' : 's'}`

/** Minutes until the next session starts (negative once it started), or null without one. */
export function minutesToSession(project: ProjectSummary, now: Date): number | null {
  const next = project.nextSession
  return next ? Math.ceil((new Date(next.startsAt).getTime() - now.getTime()) / MINUTE) : null
}

const soon = (project: ProjectSummary, now: Date) => {
  const mins = minutesToSession(project, now)
  return mins !== null && mins <= SOON_MIN
}

/** A day ahead in words: "today", "tomorrow", a weekday within the week, then the date. */
export function dayAhead(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** When a session starts, in words: "starts in 12 min", "started", "today at 16:00", "Thursday at 16:00". */
export function sessionWhen(project: ProjectSummary, now: Date): string | null {
  const mins = minutesToSession(project, now)
  if (mins === null || !project.nextSession) return null
  if (mins <= 0) return 'started'
  if (mins < 60) return `starts in ${mins} min`
  const start = new Date(project.nextSession.startsAt)
  const clock = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dayAhead(start, now)} at ${clock}`
}

/** "Davide, Luis and Sophia": the people in a room by their short names, Sophia last. */
export function roomNames(room: NonNullable<ProjectSummary['room']>): string {
  const names = [...room.people.map(shortName), ...(room.sophia ? ['Sophia'] : [])]
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

const peopleIn = (p: ProjectSummary) => p.room?.people.length ?? 0

/** Projects with a session about to start come first, then the rest as listed. */
export function workOrder(projects: readonly ProjectSummary[], now: Date): ProjectSummary[] {
  return projects.toSorted((a, b) => Number(soon(b, now)) - Number(soon(a, now)))
}

export interface WorkDoor {
  verb: string
  meta: string
  count: string
  /** The projects have loaded: until then the door shows no room, not the empty seats of a first project. */
  known: boolean
  /** The project whose room the door shows (the busiest), or null to show empty seats. */
  shown: ProjectSummary | null
  /** The project "Join the room" joins, when a session is about to start. */
  joins: ProjectSummary | null
}

function workMeta(list: readonly ProjectSummary[], callTitle: string | null, now: Date): string {
  if (callTitle) return `You’re in ${callTitle}`
  const next = list.find((p) => p.nextSession)
  const when = next ? sessionWhen(next, now) : null
  if (next && when) return `${next.title} · ${when}`
  const first = list[0]
  return first ? `${first.title}${list.length > 1 ? ` and ${list.length - 1} more` : ''}` : ''
}

/**
 * What the Work door opens: the projects, a room about to start, or a first project. Until the projects have loaded it
 * only opens them: "Start a project" over a list that is still loading would read as the projects gone.
 */
export function workDoor(
  projects: readonly ProjectSummary[] | undefined,
  now: Date,
  callTitle: string | null,
): WorkDoor {
  const none = { count: '', shown: null, joins: null }
  if (!projects) {
    return { verb: 'Open your projects', meta: callTitle ? `You’re in ${callTitle}` : '', known: false, ...none }
  }
  if (projects.length === 0) {
    return { verb: 'Start a project', meta: 'Invite your team when you’re ready', known: true, ...none }
  }
  const list = workOrder(projects, now)
  const joins = callTitle ? null : (list.find((p) => soon(p, now)) ?? null)
  const carried = projects.reduce((n, p) => n + p.releases.filter((r) => r.mine).length, 0)
  const busiest = projects.toSorted((a, b) => peopleIn(b) - peopleIn(a))[0]
  return {
    verb: joins ? 'Join the room' : 'Open your projects',
    meta: workMeta(list, callTitle, now),
    count: `${projects.length} project${projects.length === 1 ? '' : 's'}${carried ? ` · ${carried} from you` : ''}`,
    known: true,
    shown: busiest && peopleIn(busiest) > 0 ? busiest : null,
    joins,
  }
}

/** The caption under the Work door's room: who is in it and where. */
export function roomCaption(project: ProjectSummary | null): string {
  if (!project?.room || project.room.people.length === 0) return ''
  const names = roomNames(project.room)
  const one = project.room.people.length === 1 && !project.room.sophia
  return `${names} ${one ? 'is' : 'are'} in ${project.title}`
}

export const membersLabel = (members: number) =>
  members <= 1 ? 'Just you' : `You and ${members - 1} other${members === 2 ? '' : 's'}`

export interface ProjectCard {
  /** Who is in the room now, when anyone is ("Davide, Luis and Sophia are in the room"). */
  presence: string | null
  meta: string
  action: 'leave' | 'join' | 'open'
}

/** A card's one action, in the words the room itself uses. */
export const CARD_ACTION: Record<ProjectCard['action'], string> = {
  leave: 'Leave the room',
  join: 'Join the room',
  open: 'Open',
}

/** Where a carried note came from, as Work shows it. */
export const carriedFrom = (mine: boolean, ownerName: string) =>
  mine ? 'from your personal space' : `from ${shortName(ownerName)}’s personal space`

/** How a project reads in Work: its room if someone is in it, else its people and next session; and its one action. */
export function projectCard(project: ProjectSummary, now: Date, inCallHere: boolean): ProjectCard {
  const live = peopleIn(project) > 0
  const when = sessionWhen(project, now)
  const presence =
    live && project.room
      ? `${roomNames(project.room)} ${project.room.people.length === 1 && !project.room.sophia ? 'is' : 'are'} in the room`
      : null
  const meta = `${membersLabel(project.members)}${when ? ` · session ${when}` : ''}`
  const action = inCallHere ? 'leave' : live || soon(project, now) ? 'join' : 'open'
  return { presence, meta, action }
}
