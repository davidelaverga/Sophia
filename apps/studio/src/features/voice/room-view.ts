// What the room shows, derived from the project's room record (the input floor) and the people and
// video LiveKit reports. Pure, so the rules are unit-tested; React only renders the result.

export type DockStatus = 'idle' | 'joining' | 'live' | 'reconnecting' | 'failed'

export interface RoomParticipant {
  /** LiveKit identity = the verified actor id the API put in the token. */
  identity: string
  name: string
  speaking: boolean
  micOn: boolean
  cameraOn: boolean
  screenOn: boolean
  local: boolean
}

export interface FloorView {
  /** Who may address Sophia; `present` says whether they are in the room right now. */
  holder: { identity: string; name: string; present: boolean } | null
  mine: boolean
  /**
   * This person is in the room and the floor is free, or its holder left the room. Taking it from an
   * absent holder is the server's call (only a project admin may reclaim); a refusal shows its reason.
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
  return {
    holder,
    mine,
    canTake: !!me && !mine && (inputActorId === null || !holderInRoom),
    passTargets: mine ? participants.filter((p) => !p.local) : [],
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
  /** Sophia's line under the light, in her own type. */
  text: string
  /** A quiet second line, or null. */
  note: string | null
}

const VOICE_NOTE = 'Sophia’s voice arrives with S1-05. Today the room carries yours.'

function floorLine(floor: FloorView): string {
  if (!floor.holder) return 'The floor is open'
  if (floor.mine) return 'You have the floor'
  const name = shortName(floor.holder.name)
  return floor.holder.present ? `${name} has the floor` : `${name} has the floor but isn’t here`
}

/** What Sophia's line says about the room right now. Only what is true: her own voice is not here yet. */
export function roomLine(status: DockStatus, floor: FloorView, runningGoals: number): RoomLine {
  const work =
    runningGoals > 0 ? `Working on ${runningGoals} ${runningGoals === 1 ? 'goal' : 'goals'} in the background` : null
  if (status === 'joining') return { text: 'Joining the room…', note: null }
  if (status === 'reconnecting') return { text: 'Reconnecting…', note: work }
  if (status === 'live') return { text: floorLine(floor), note: work }
  return { text: 'The room is ready', note: work ?? VOICE_NOTE }
}
