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

/**
 * The room's note as the browser's connection stands: offline, a lost call says so; back online, that Try again
 * rejoins. Online, a lost call keeps its own words (a true proves nothing), and every other note stays as it is.
 */
export function noteFor(note: string | null, online: boolean): string | null {
  if (online) return note === OFFLINE_END ? BACK_ONLINE : note
  return note === CALL_END.dropped.note ? OFFLINE_END : note
}

/**
 * What the room keeps of a note said with the browser offline or not (navigator.onLine), and whether a call was lost
 * with no join back in since: offline, the lost call, and a join after it that failed, keep the offline note (a join
 * offline could reach nothing, so the note never says the room isn't there). Online, or with no call lost (a Join from
 * rest), the note is kept as said.
 */
export function keptNote(next: string | null, at: { online: boolean; lost: boolean }): string | null {
  if (next === null || at.online) return next
  return at.lost || next === CALL_END.dropped.note ? OFFLINE_END : next
}

/** How the dock says its note: the connection's two politely, as Personal's line; a failure, at once. */
export const noteRole = (note: string): 'status' | 'alert' =>
  note === OFFLINE_END || note === BACK_ONLINE ? 'status' : 'alert'
