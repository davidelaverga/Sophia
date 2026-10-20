// Why a call ended without this person leaving, and what the room says about it. Pure, so the words are
// unit-tested; livekit-room.ts reads the reason from LiveKit and useProjectRoom shows the note.

/**
 * - dropped: the connection was lost (a network failure, the server going away).
 * - elsewhere: the same person joined from another tab or device, and a person is in the call once.
 * - removed: someone took this person out of the call.
 * - closed: the room itself was closed.
 */
export type CallEnd = 'dropped' | 'elsewhere' | 'removed' | 'closed'

interface EndNote {
  /** What the dock says. */
  note: string
  /**
   * Something went wrong, so the way back reads "Try again". The others are not failures: the call is still in
   * the other tab, or it was ended on purpose, and the way back is the plain "Join the room".
   */
  failed: boolean
}

export const CALL_END: Record<CallEnd, EndNote> = {
  dropped: { note: 'You were disconnected from the room.', failed: true },
  elsewhere: { note: 'You joined from another tab or device, so this one left the call.', failed: false },
  removed: { note: 'You were taken out of the call.', failed: false },
  closed: { note: 'The room was closed.', failed: false },
}

/**
 * Whether the text mode a call was in outlives its end: only after a lost connection, so trying again doesn't turn
 * on a microphone that was off. Any other end (leaving, another tab, taken out, closed) is over, and the next join
 * is as the person's microphone choice says.
 */
export const keepsTextMode = (why: CallEnd | null): boolean => why !== null && CALL_END[why].failed

/** A call lost while the browser is offline (navigator.onLine false), in Personal's voice (costuras seam #8). */
export const OFFLINE_END = 'You’re offline, so the call ended here. Join again once you’re back.'
/** That note once the browser is back online. */
export const BACK_ONLINE = 'You’re back online. Try again rejoins the call.'
/** A join pressed while the browser is offline with no call lost before it, which asks for nothing (Luis 2026-10-19). */
export const OFFLINE_JOIN = 'You’re offline. Join once you’re back.'

/** A dropped call trying once to get back in on its own (call-rejoin.md). */
export const REJOINING = 'Connection lost. Rejoining the call…'
/** A call dropped offline whose one try waits for the network. */
export const OFFLINE_REJOIN = 'You’re offline, so the call ended here. Back online, you rejoin it automatically.'
/** That try got back in: said once. */
export const REJOINED = 'Reconnected.'

/** Offline, what the room says of a join: the lost call's line after one, the Join from rest's with none. */
const offlineNote = (lost: boolean) => (lost ? OFFLINE_END : OFFLINE_JOIN)

/**
 * What a join pressed now says instead of asking for a token, with the browser offline or not (navigator.onLine), a
 * call lost with no join back in since, and whether this person is in the call or on the way into it. Out of the call
 * and offline, it could reach nothing, so it asks for nothing and says why (offline-join-from-rest.md). Online,
 * nothing: it goes (a true proves nothing). In the call, nothing either: that call answers it (Chat with Sophia, say),
 * and nobody in it is told to join.
 */
export const joinHeld = (at: { online: boolean; lost: boolean; inCall: boolean }): string | null =>
  at.online || at.inCall ? null : offlineNote(at.lost)

/**
 * The room's note as the browser's connection stands: offline, a lost call says so. Back online, that Try again
 * rejoins, and a Join pressed offline from rest says nothing more (nothing joins on its own). Online, a lost call keeps
 * its own words (a true proves nothing), and every other note stays as it is.
 */
export function noteFor(note: string | null, online: boolean): string | null {
  if (online) {
    if (note === OFFLINE_JOIN) return null
    return note === OFFLINE_END ? BACK_ONLINE : note
  }
  return note === CALL_END.dropped.note ? OFFLINE_END : note
}

/** The ends the server said (another tab, taken out, the room closed): still true once the browser reads offline. */
const SAID_ENDS = new Set(
  Object.values(CALL_END)
    .filter((end) => !end.failed)
    .map((end) => end.note),
)

/**
 * What the room keeps of a note said with the browser offline or not (navigator.onLine), and whether a call was lost
 * with no join back in since. Offline, a join could reach nothing, so the note never says the room isn't there: after
 * a lost call, the call and a join after it that failed keep the lost call's line; with none, a join that began online
 * and failed offline says the Join from rest's line. The ends the server said keep their words, and online every note
 * is kept as said.
 */
export function keptNote(next: string | null, at: { online: boolean; lost: boolean }): string | null {
  if (next === null || at.online) return next
  if (at.lost || next === CALL_END.dropped.note) return OFFLINE_END
  return SAID_ENDS.has(next) ? next : OFFLINE_JOIN
}

/** How the dock says its note: the connection's three politely, as Personal's line; a failure, at once. */
export const noteRole = (note: string): 'status' | 'alert' =>
  note === OFFLINE_END || note === BACK_ONLINE || note === OFFLINE_JOIN ? 'status' : 'alert'
