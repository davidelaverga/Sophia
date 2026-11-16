// Why dictation stopped (dictation.ts), from the Web Speech API's `error` code: a line only for a reason the person
// can act on; any other code (our own abort's `aborted` included) says nothing, as before. Pure, so the words are
// tested (docs/plans/dictation-and-notify-said.md).

const BLOCKED = 'Sophia can’t hear you: the microphone is blocked for this site.'

const TROUBLE: Record<string, string> = {
  'not-allowed': BLOCKED,
  'service-not-allowed': BLOCKED,
  'no-speech': 'Didn’t catch anything. Try again.',
  network: 'Dictation needs a connection.',
}

/** The line for a recognition error's code, or null when there is nothing to say. */
export function dictationTrouble(code: unknown): string | null {
  return typeof code === 'string' && Object.hasOwn(TROUBLE, code) ? (TROUBLE[code] ?? null) : null
}
