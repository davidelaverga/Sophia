// What the room shows, derived from the project's room record (the input floor) and the people and
// video LiveKit reports. Pure, so the rules are unit-tested; React only renders the result.
import type { NativeTask, Snapshot } from '@sophia/contracts'

export type DockStatus = 'idle' | 'joining' | 'live' | 'reconnecting' | 'failed'

export type Device = 'microphone' | 'camera' | 'screen'

/** A device that LiveKit wouldn't turn off: what is still on, never that it couldn't start. */
const STILL_ON: Record<Device, string> = {
  microphone: 'The microphone couldn’t be turned off. Try again.',
  camera: 'The camera couldn’t be turned off. Try again.',
  screen: 'Screen sharing couldn’t stop. Try again.',
}

/**
 * What stopped a device, and what to do about it, for the way it was going: on (the browser's reasons) or off
 * (STILL_ON). Null when there is nothing to say: cancelling the screen picker is a choice, not an error. The note stays
 * until the device works or the call ends.
 */
export function mediaMessage(err: unknown, device: Device, on: boolean): string | null {
  if (!on) return STILL_ON[device]
  const name = err instanceof Error ? err.name : ''
  if (device === 'screen') {
    return name === 'NotAllowedError' || name === 'AbortError' ? null : 'Screen sharing couldn’t start. Try again.'
  }
  const Title = device.charAt(0).toUpperCase() + device.slice(1)
  if (name === 'NotAllowedError') return `${Title} blocked. Allow it in the address bar.`
  if (name === 'NotFoundError') return `No ${device} found.`
  if (name === 'NotReadableError') return `Another app is using your ${device}. Close it and try again.`
  return `The ${device} couldn’t start. Try again.`
}

/** A member's role or a guest, from the token's metadata; unknown when the token had none. */
export type Standing = 'admin' | 'editor' | 'viewer' | 'guest' | 'unknown'

export interface RoomParticipant {
  /** LiveKit identity = the verified actor id the API put in the token. */
  identity: string
  name: string
  speaking: boolean
  micOn: boolean
  cameraOn: boolean
  screenOn: boolean
  local: boolean
  standing: Standing
}

const ROLES: ReadonlyArray<Standing> = ['admin', 'editor', 'viewer']

/** Read the metadata the API signed into the token (`{"role": …}` or `{"guest": true}`); nothing else. */
export function standingOf(metadata: string | undefined): Standing {
  try {
    const value: unknown = JSON.parse(metadata ?? 'null')
    if (typeof value !== 'object' || value === null) return 'unknown'
    if ('guest' in value && value.guest === true) return 'guest'
    const role = 'role' in value ? ROLES.find((r) => r === value.role) : undefined
    return role ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Members hold the input floor; guests never do. Changed by amendment A06 (S1-05A, for Luis's review): viewers
 * may hold it and publish too, since talking with Sophia is not a work grant (work still needs an editor).
 */
const canHold = (p: RoomParticipant) => p.standing !== 'guest'

export interface FloorView {
  /** Who may address Sophia; `present` says whether they are in the room right now. */
  holder: { identity: string; name: string; present: boolean } | null
  mine: boolean
  /**
   * Offered only when the server will accept it (migration 0009, A06): a free floor to any member in the room;
   * a floor whose holder left, only to an admin, who alone may reclaim it.
   */
  canTake: boolean
  /** When the floor is mine: who I can pass it to. */
  passTargets: RoomParticipant[]
}

export function floorView(inputActorId: string | null, participants: readonly RoomParticipant[]): FloorView {
  const me = participants.find((p) => p.local)
  const holderInRoom = participants.find((p) => p.identity === inputActorId)
  const holder = inputActorId
    ? { identity: inputActorId, name: holderInRoom?.name ?? 'someone who isn’t in the room', present: !!holderInRoom }
    : null
  const mine = !!me && me.identity === inputActorId
  const reclaimable = !holderInRoom && me?.standing === 'admin'
  return {
    holder,
    mine,
    canTake: !!me && canHold(me) && !mine && (inputActorId === null || reclaimable),
    passTargets: mine ? participants.filter((p) => !p.local && canHold(p)) : [],
  }
}

/** Display order: yourself first, then the others by name. */
export function orderParticipants(participants: readonly RoomParticipant[]): RoomParticipant[] {
  return participants.toSorted((a, b) => Number(b.local) - Number(a.local) || a.name.localeCompare(b.name))
}

/** A short name for a person: the part of an email before the @, capitalized. */
export function shortName(name: string): string {
  const base = name.includes('@') ? (name.split('@')[0] ?? name) : name
  const word = base.split(/[.\-_+\s]/)[0] || base
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * The one thing that sets someone apart in the room, or null: the floor, a guest, speaking, a listener. A guest
 * stays marked as one while they speak: a visitor chooses their own name, and that word is what tells them from a
 * member of the same name.
 */
export function presenceRole(person: RoomParticipant, holds: boolean): string | null {
  if (holds) return 'has the floor'
  if (person.standing === 'guest') return person.speaking ? 'guest · speaking' : 'guest'
  if (person.speaking) return 'speaking'
  if (person.standing === 'viewer') return 'listening'
  return null
}

/** Whose shared screen is on the stage; a guest's says so, as their tile does. */
export function screenCaption(presenter: RoomParticipant | undefined): string {
  if (!presenter) return 'Shared screen'
  return `${shortName(presenter.name)}’s screen${presenter.standing === 'guest' ? ' · guest' : ''}`
}

export type StageMode = 'light' | 'gallery' | 'present'

/** Someone sharing a screen takes the stage; cameras make a gallery; otherwise the light holds the room. */
export function stageMode(feeds: ReadonlyArray<{ source: 'camera' | 'screen' }>): StageMode {
  if (feeds.some((f) => f.source === 'screen')) return 'present'
  return feeds.length > 0 ? 'gallery' : 'light'
}

export interface Slot {
  side: 'left' | 'right'
  /** Rows from the light's height: 0 is level with her, ±1 a row above or below. */
  row: number
}

/** Around the light: alternate sides, you on the left, each side centered on her height. */
export function presenceSlots(count: number): Slot[] {
  const perSide = { left: Math.ceil(count / 2), right: Math.floor(count / 2) }
  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 'left' : 'right'
    return { side, row: Math.floor(i / 2) - (perSide[side] - 1) / 2 }
  })
}

export interface RoomLine {
  /** Sophia's line under the light. */
  text: string
  /** A quiet second line, or null. */
  note: string | null
}

/** Before anyone asks Sophia into the conversation (S1-05A), the room says how she joins. */
export const VOICE_NOTE = 'Sophia joins when asked.'

/** What the light and Sophia's line say while she is in the conversation (sophia-view.ts). */
export interface SophiaLineView {
  inConversation: boolean
  label: string
  note: string | null
}

function floorLine(floor: FloorView): string {
  if (!floor.holder) return 'The floor is open'
  if (floor.mine) return 'You have the floor'
  const name = shortName(floor.holder.name)
  return floor.holder.present ? `${name} has the floor` : `${name} has the floor but isn’t here`
}

/** The phases of a native task that is still work in progress (Work's card polls in these too). */
export const WORKING_PHASES: ReadonlySet<NativeTask['phase']> = new Set([
  'queued',
  'dispatched',
  'running',
  'holding',
  'stopping',
])

/**
 * Work in progress, counted once per goal: what the light's work line and Sophia's note count. A native task
 * (a brief) has its own goal, so its goal and its task are one piece of work, not two. A goal with a task is
 * working only while its task is: a finished brief leaves its goal `checking`, its result waiting for review,
 * and that is not work in progress (CX-0061).
 */
export function runningWork(snapshot: Pick<Snapshot, 'goals' | 'work'> | undefined): number {
  if (!snapshot) return 0
  const withTask = new Set(snapshot.work.map((task) => task.goalId))
  const active = new Set(
    snapshot.goals
      .filter((g) => !withTask.has(g.id) && (g.status === 'running' || g.status === 'checking'))
      .map((g) => g.id),
  )
  for (const task of snapshot.work) if (WORKING_PHASES.has(task.phase)) active.add(task.goalId)
  return active.size
}

/** Work in progress by count, when her line can't say what it is. */
const workCountText = (n: number): string | null =>
  n > 0 ? `Working on ${n} ${n === 1 ? 'task' : 'tasks'} in the background` : null

/**
 * What Sophia's line says about the room right now. Only what is true: while she is in the conversation her
 * line is what the bridge observes (sophia-view.ts), never inferred from the room being live.
 */
export function roomLine(
  status: DockStatus,
  floor: FloorView,
  workCount: number,
  sophia: SophiaLineView | null = null,
  /** What she is doing, when one task of hers is the only work (work-line.ts); else the count says it. */
  doing: string | null = null,
): RoomLine {
  const work = doing ?? workCountText(workCount)
  if (status === 'joining') return { text: 'Joining the room…', note: null }
  if (status === 'reconnecting') return { text: 'Reconnecting…', note: work }
  if (sophia?.inConversation) return { text: sophia.label, note: sophia.note ?? work ?? floorLine(floor) }
  if (status === 'live') return { text: floorLine(floor), note: work }
  return { text: 'The room is ready', note: work ?? VOICE_NOTE }
}
