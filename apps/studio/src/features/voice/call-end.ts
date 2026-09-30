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
