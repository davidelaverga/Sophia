// What the toast says (app/Toast.tsx) about the places: one line for a result whose place is not on screen, the
// padlock that shut, a note carried away, a room left from elsewhere or by opening another project. A result whose
// place stays on screen is said there instead. Pure, so the words are tested.

export const NOTICE = {
  locked: 'Your personal space is locked. Opening it asks you to confirm it’s you.',
  kept: 'Kept',
  carried: (project: string) => `Carried to ${project}`,
  takenBack: 'Back in your notes',
  /** A note forgotten from the notes (personal-forget-note.md): its words are gone, so there is no Undo. */
  forgotten: 'Forgotten',
  copied: 'Copied to your clipboard',
  clipboardBlocked: 'Couldn’t copy here. Your browser blocked the clipboard.',
  erased: 'Deleted. Sophia starts fresh.',
  /** Another tab's message is on its way (oneAtATime): this one waits, in the field or to be pressed again. */
  waits: 'Another message is on its way: send this one after it',
  /** Back from a provider, the check couldn't be read in time (reauth.ts): nothing opened. */
  unchecked: 'Couldn’t confirm it’s you. Your personal space stays locked.',
} as const

export interface CallEnd {
  title: string
  /** Why it ended when this person didn't leave (call-end.ts), or null when they left. */
  note: string | null
  /** The call's project is on screen: its dock or mini dock already says what happened. */
  here: boolean
  /**
   * The project whose opening ended it (SignedIn's useOneCallInSight), by its title, or null while this page hasn't read
   * that title; absent when no opening did (this person pressed Leave).
   */
  opened?: string | null
}

/** The toast's line for a call's end, and its one press when the call can be had back (call-ends-on-open.md). */
export interface CallEndSaid {
  message: string
  act: 'Rejoin' | null
}

/** A call that opening another project ended: said as when it ended, never as the person's doing. */
const endedOnOpening = (title: string, opened: string | null) =>
  `Your call in “${title}” ended when you opened ${opened === null ? 'another project' : `“${opened}”`}.`

/**
 * What a call that ended says in the toast, or null when the room on screen says it all. Where the room can't be seen
 * the toast says why it ended: the room's own reason first, then the project whose opening ended it (with Rejoin), else
 * that this person left it. It never says the personal space opened: a call's end opens nothing (lock.ts), only the
 * person does.
 */
export const callEnded = ({ title, note, here, opened }: CallEnd): CallEndSaid | null => {
  if (here) return null
  if (note !== null) return { message: note, act: null }
  if (opened === undefined) return { message: `You left ${title}.`, act: null }
  return { message: endedOnOpening(title, opened), act: 'Rejoin' }
}
