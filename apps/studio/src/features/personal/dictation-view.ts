// Why dictation stopped (dictation.ts), from the Web Speech API's `error` code: a line only for a reason the person
// can act on; any other code says nothing, as before. Our own abort's `aborted`; `service-not-allowed`, the browser
// refusing its speech service rather than this site's microphone; and `network`, which recognition on the device
// can't need (Luis, 2026-11-16). Pure, so the words are tested (docs/plans/dictation-and-notify-said.md).

const TROUBLE: Record<string, string> = {
  'not-allowed': 'Sophia can’t hear you: the microphone is blocked for this site.',
  'audio-capture': 'Sophia can’t hear you: the microphone isn’t available.',
  'no-speech': 'Didn’t catch anything. Try again.',
}

/** The line for a recognition error's code, or null when there is nothing to say. */
export function dictationTrouble(code: unknown): string | null {
  return typeof code === 'string' && Object.hasOwn(TROUBLE, code) ? (TROUBLE[code] ?? null) : null
}
