// The words of the three places (direction C): the greeting, what each door says it opens, and how a project card in
// Work reads. Pure, so the copy is tested and components only render it.
import type { PersonalTurn, ProjectSummary } from '@sophia/contracts'
import { shortName } from '../voice/room-view.ts'
import { dayLabel, topicOf } from './conversation-view.ts'

const MINUTE = 60_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** A session this close (or already started) makes the Work door and its card say "Join the room". */
export const SOON_MIN = 10

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
 * What the Personal door opens: the conversation to continue, a first one to start, or a locked side. It names the
 * last day by what it was about (its first topic), or just now by the latest one.
 */
export function youDoor(input: {
  locked: LockedBy | null
  turns: readonly PersonalTurn[]
  notes: number
  now: Date
}): YouDoor {
  if (input.locked) {
    return {
      verb: 'Unlock',
      meta: input.locked === 'room' ? 'Locked while you’re in a room' : 'Your side is closed',
      notes: null,
    }
  }
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

/** What the Work door opens: the projects, a room about to start, or a first project. */
export function workDoor(projects: readonly ProjectSummary[], now: Date, callTitle: string | null): WorkDoor {
  if (projects.length === 0) {
    return { verb: 'Start a project', meta: 'Invite your team when you’re ready', count: '', shown: null, joins: null }
  }
  const list = workOrder(projects, now)
  const joins = callTitle ? null : (list.find((p) => soon(p, now)) ?? null)
  const carried = projects.reduce((n, p) => n + p.releases.filter((r) => r.mine).length, 0)
  const busiest = projects.toSorted((a, b) => peopleIn(b) - peopleIn(a))[0]
  return {
    verb: joins ? 'Join the room' : 'Open your projects',
    meta: workMeta(list, callTitle, now),
    count: `${projects.length} project${projects.length === 1 ? '' : 's'}${carried ? ` · ${carried} from you` : ''}`,
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
