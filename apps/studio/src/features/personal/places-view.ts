// The words of the three places (direction C): the greeting, what each door says it opens, how a project card in Work
// reads, who can see a place, how privacy works, and what a read that is slow or failed says. Pure, so the copy is
// tested and components only render it.
import type { PersonalTurn, ProjectSummary } from '@sophia/contracts'
import type { Place } from '../../app/route.ts'
import { shortName } from '../voice/room-view.ts'
import type { Way } from './arrive.ts'
import { dayLabel, topicOf } from './conversation-view.ts'
import { clock, dayInSentence, inTime } from '../../app/time-words.ts'

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
    rest: 'Opening it again asks you to confirm it’s you. It also locks by itself when you join a room, and stays locked until you open it.',
  },
] as const

/** The padlock on the line between the doors: what pressing it does, and its key. Only the person opens it. */
export const LOCK_TIP = {
  open: { label: 'Lock your personal space', keys: 'L' },
  you: { label: 'Unlock: confirm it’s you', keys: 'L' },
  room: { label: 'Locked when you joined a room. Unlock: confirm it’s you', keys: 'L' },
} as const

/** The edge from Work to Personal: where it goes, or why it is shut. */
export const EDGE_TIP = {
  open: 'Cross to Personal',
  you: 'Your personal space is locked. Opening it asks you to confirm it’s you.',
  room: 'Your personal space locked when you joined a room. Opening it asks you to confirm it’s you.',
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
  inCall: (names: string) => `Leave the call, then continue with ${names}.`,
} as const

/**
 * What the unlock sheet shows below the passkey: the press for the other ways, its wait while they load, the ways (at
 * once when there is no passkey), or that they couldn't load, as soon as that happens and before any press.
 */
export type OtherWaysShown = 'ask' | 'loading' | 'ways' | 'failed'

export function otherWaysShown(s: {
  ways: { passkey: boolean } | null
  failed: boolean
  asked: boolean
}): OtherWaysShown {
  if (s.failed) return 'failed'
  if (!s.ways) return s.asked ? 'loading' : 'ask'
  return s.asked || !s.ways.passkey ? 'ways' : 'ask'
}

/**
 * The code's one button: it stays through sending (so does the focus on it) until the code's field takes the focus,
 * then asks for a new code where one can be sent.
 */
export function codeButton(s: { codes: number; sending: boolean; canResend: boolean }) {
  const quiet = s.codes > 0
  if (s.sending) return { label: 'Sending…', quiet }
  if (!quiet) return { label: 'Email me a code', quiet }
  return s.canResend ? { label: 'Send a new code', quiet } : null
}

/** Beside the other ways: a provider waits until the call ends (signing in again leaves the page), or there is none. */
export function otherWaysNote(ways: { providers: readonly string[]; code: boolean }, inCall: boolean): string | null {
  if (ways.providers.length > 0) return inCall ? UNLOCK.inCall(ways.providers.join(' or ')) : null
  return ways.code ? null : UNLOCK.noOther
}

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

/** The hour's light in Personal (personal-moments.md §2). */
export type HourLight = 'morning' | 'day' | 'evening' | 'night'

/** Her light by the hour: morning from 5, the day from 11, evening from 18, night from 22. */
export function lightOf(now: Date): HourLight {
  const hour = now.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 18) return 'day'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
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
 * What the Personal door opens: the conversation to continue, or a locked space; null before a first word. It names the
 * last day by what it was about (its first topic), or just now by the latest one. Until the space has loaded it only
 * opens: a first conversation offered over one that is still loading would read as the old one gone.
 */
export function youDoor(input: {
  locked: LockedBy | null
  /** Undefined until the space has loaded. */
  turns: readonly PersonalTurn[] | undefined
  notes: number
  now: Date
}): YouDoor | null {
  if (input.locked) {
    return {
      verb: 'Unlock',
      meta: input.locked === 'room' ? 'Locked when you joined a room' : 'Locked on this device',
      notes: null,
    }
  }
  if (!input.turns) return { verb: 'Open', meta: '', notes: null }
  const said = input.turns.filter((t) => t.author === 'person')
  const last = said.at(-1)
  // Nothing said yet: nothing to continue. The line to her is the way in (Welcome).
  if (!last) return null
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

/** A day ahead in words: "today", "tomorrow", a weekday within the week, then the date (app/time-words.ts). */
const dayAhead = (date: Date, now: Date): string => dayInSentence(date, now.getTime())

/** When a session starts, in words: "starts in 12 min", "started", "today at 16:00", "Thursday at 16:00". */
export function sessionWhen(project: ProjectSummary, now: Date): string | null {
  const mins = minutesToSession(project, now)
  if (mins === null || !project.nextSession) return null
  if (mins <= 0) return 'started'
  if (mins < 60) return `starts ${inTime(project.nextSession.startsAt, now.getTime())}`
  const start = new Date(project.nextSession.startsAt)
  return `${dayAhead(start, now)} at ${clock(start)}`
}

const DAY_AHEAD_MS = 86_400_000

/** The soonest session in your projects that starts within 24 hours: a way to get ready for it with her. */
export function readyFor(projects: readonly ProjectSummary[], now: Date): Way | null {
  const next = projects
    .map((project) => ({ project, at: project.nextSession ? Date.parse(project.nextSession.startsAt) : NaN }))
    .filter(({ at }) => at > now.getTime() && at - now.getTime() <= DAY_AHEAD_MS)
    .toSorted((a, b) => a.at - b.at)[0]
  const session = next?.project.nextSession
  const when = next ? sessionWhen(next.project, now) : null
  if (!next || !session || !when) return null
  const said = when.startsWith('starts') ? `It ${when}.` : `It’s ${when}.`
  return {
    label: `Get ready for ${session.title} · ${next.project.title}`,
    note: when,
    words: `Help me get ready for ${session.title} in ${next.project.title}. ${said}`,
  }
}

/** "Davide, Luis and Sophia": the people in a room by their short names, Sophia last. */
export function roomNames(room: NonNullable<ProjectSummary['room']>): string {
  const names = [...room.people.map(shortName), ...(room.sophia ? ['Sophia'] : [])]
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

const peopleIn = (p: ProjectSummary) => p.room?.people.length ?? 0

/** Projects with a session about to start come first, the soonest first; then the rest as listed. */
export function workOrder(projects: readonly ProjectSummary[], now: Date): ProjectSummary[] {
  const starts = (p: ProjectSummary) =>
    soon(p, now) && p.nextSession ? Date.parse(p.nextSession.startsAt) : Number.POSITIVE_INFINITY
  return projects.toSorted((a, b) => {
    const x = starts(a)
    const y = starts(b)
    if (x === y) return 0
    return x < y ? -1 : 1
  })
}

/** All projects' count, under Home's rows: how many, and the notes carried from you. Nothing while they load. */
export function workCount(projects: readonly ProjectSummary[] | undefined): string {
  if (!projects || projects.length === 0) return ''
  const carried = projects.reduce((n, p) => n + p.releases.filter((r) => r.mine).length, 0)
  return `${String(projects.length)} project${projects.length === 1 ? '' : 's'}${carried ? ` · ${String(carried)} from you` : ''}`
}

/** Who is in a project's room and where: "Davide and Sophia are in Pitch deck" (Home's attention line). */
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

/** How many projects Home offers, one press each: the ones Work shows first, which the opening warmed. */
export const HOME_ROWS = 3

/**
 * A row's one press on Home: open the project, join its room, or, for the call you are in, go back to it. Leaving
 * stays with the bar's room pill: a press on your own project never hangs up.
 */
export type HomeAction = 'open' | 'join' | 'back'

export const HOME_ACTION: Record<HomeAction, string> = {
  open: 'Open',
  join: 'Join the room',
  back: 'Back to the room',
}

export interface HomeRow {
  project: ProjectSummary
  /** As Work reads it: its room, or its people and next session. */
  card: ProjectCard
  action: HomeAction
  /** Its session starts within SOON_MIN. */
  soon: boolean
  /** When its next session starts, in words (sessionWhen), or null. */
  when: string | null
  /** People are in its room now. */
  live: boolean
}

/** Home's projects: Work's first ones, in Work's order, each read as Work reads it. */
export function homeRows(
  projects: readonly ProjectSummary[],
  now: Date,
  inCallProject: string | null,
  count = HOME_ROWS,
): HomeRow[] {
  return workOrder(projects, now)
    .slice(0, count)
    .map((project) => {
      const card = projectCard(project, now, project.projectId === inCallProject)
      return {
        project,
        card,
        action: card.action === 'leave' ? 'back' : card.action,
        soon: soon(project, now),
        when: sessionWhen(project, now),
        live: peopleIn(project) > 0,
      }
    })
}

/** A piece of what Sophia says on Home: the project it is about is its strong part. */
export interface Said {
  text: string
  strong?: boolean
}

/**
 * The one thing that matters now, in Sophia's words, under the greeting: the call you are in, else a session about to
 * start, else people in a room, else that all is as you left it. Nothing while the projects load.
 */
export function sophiaSays(
  projects: readonly ProjectSummary[] | undefined,
  now: Date,
  call: { title: string } | null,
): Said[] {
  if (!projects) return []
  if (call) return [{ text: 'You’re in ' }, { text: call.title, strong: true }, { text: '’s room.' }]
  if (projects.length === 0) return [{ text: 'Start a project when you’re ready, or just talk to me.' }]
  return sessionSoon(projects, now) ?? roomLive(projects) ?? [{ text: 'Your projects are as you left them.' }]
}

/** "Standup in Product launch starts in 10 min.": the session about to start first, if one is. */
function sessionSoon(projects: readonly ProjectSummary[], now: Date): Said[] | null {
  const starting = workOrder(projects, now).find((p) => p.nextSession && soon(p, now))
  const when = starting ? sessionWhen(starting, now) : null
  if (!starting?.nextSession || !when) return null
  return [{ text: `${starting.nextSession.title} in ` }, { text: starting.title, strong: true }, { text: ` ${when}.` }]
}

/** "Davide and Sophia are in Pitch deck.": the busiest room, if anyone is in one. */
function roomLive(projects: readonly ProjectSummary[]): Said[] | null {
  const busiest = projects.toSorted((a, b) => peopleIn(b) - peopleIn(a))[0]
  if (!busiest?.room || peopleIn(busiest) === 0) return null
  const one = busiest.room.people.length === 1 && !busiest.room.sophia
  return [
    { text: `${roomNames(busiest.room)} ${one ? 'is' : 'are'} in ` },
    { text: busiest.title, strong: true },
    { text: '.' },
  ]
}

/** What a row of the index says quietly on its right: a session soon (amber), people in the room (teal), its people. */
export function rowNote(row: HomeRow): { text: string; tone: 'soon' | 'live' | 'quiet' } {
  const { project } = row
  if (row.action === 'back') return { text: 'You’re in the room', tone: 'live' }
  if (row.soon && project.nextSession && row.when) {
    return { text: `${project.nextSession.title} ${row.when}`, tone: 'soon' }
  }
  if (row.live && project.room) {
    const one = project.room.people.length === 1 && !project.room.sophia
    return { text: `${roomNames(project.room)} ${one ? 'is' : 'are'} here`, tone: 'live' }
  }
  return { text: membersLabel(project.members), tone: 'quiet' }
}
