// What the toast says (app/Toast.tsx) about the places: one line for a result whose place is not on screen, the
// padlock that shut, a note carried away, a room left from elsewhere. A result whose place stays on screen is said
// there instead. Pure, so the words are tested.

export const NOTICE = {
  locked: 'Your personal space is locked. Opening it asks for your passkey.',
  kept: 'Kept',
  carried: (project: string) => `Carried to ${project}`,
  takenBack: 'Back in your notes',
  copied: 'Copied to your clipboard',
  clipboardBlocked: 'Couldn’t copy here. Your browser blocked the clipboard.',
  erased: 'Deleted. Sophia starts fresh.',
} as const

export interface CallEnd {
  title: string
  /** Why it ended when this person didn't leave (call-end.ts), or null when they left. */
  note: string | null
  /** The call's project is on screen: its dock or mini dock already says what happened. */
  here: boolean
  /** Leaving lifted the padlock the room had shut. */
  reopens: boolean
}

const REOPENED = 'Your personal space is open again.'

/**
 * What a call that ended says in the toast, or null when the room on screen says it all. Where the room can't be seen
 * the toast says why it ended (or that this person left it); wherever they are, it says when the personal space opened
 * again, which no room shows.
 */
export function callEnded({ title, note, here, reopens }: CallEnd): string | null {
  const why = here ? null : (note ?? `You left ${title}.`)
  const words = [why, reopens ? REOPENED : null].filter((w) => w !== null)
  return words.length > 0 ? words.join(' ') : null
}
