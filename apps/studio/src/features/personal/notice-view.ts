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
  /** Back from a provider, the check couldn't be read in time (reauth.ts): nothing opened. */
  unchecked: 'Couldn’t confirm it’s you. Your personal space stays locked.',
} as const

export interface CallEnd {
  title: string
  /** Why it ended when this person didn't leave (call-end.ts), or null when they left. */
  note: string | null
  /** The call's project is on screen: its dock or mini dock already says what happened. */
  here: boolean
}

/**
 * What a call that ended says in the toast, or null when the room on screen says it all. Where the room can't be seen
 * the toast says why it ended (or that this person left it). It never says the personal space opened: a call's end
 * opens nothing (lock.ts), only the person does.
 */
export const callEnded = ({ title, note, here }: CallEnd): string | null =>
  here ? null : (note ?? `You left ${title}.`)
