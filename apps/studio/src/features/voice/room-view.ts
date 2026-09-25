// What the dock shows about the room, derived from the project's room record (the input floor) and the
// people LiveKit says are in the room. Pure, so the rules are unit-tested; React only renders the result.

export interface RoomParticipant {
  /** LiveKit identity = the verified actor id the API put in the token. */
  identity: string
  name: string
  speaking: boolean
  micOn: boolean
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
