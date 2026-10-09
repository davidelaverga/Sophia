// «Use a passkey» ends (docs/plans/passkey-picker-limit.md). The prompt is the person's, and the browser ends it at its
// own timeout; what has no end of its own is around it: the autofill offer letting the browser go, Supabase Auth's
// challenge, and the answer sent back. Pure, so it is unit-tested.
import type { PasskeyOutcome } from './auth.ts'
import { orLate } from './deadline.ts'

/**
 * A challenge lives five minutes (Supabase Auth), and its answer is a write, given 90 s; counted from the press, which
 * also pays for reaching the challenge. Past it, an answer is all but sure to come back expired.
 */
export const PICK_LIMIT_MS = 5 * 60_000 + 90_000

/** How long the offer may take to let the browser go: a read's 30 s. Its abort is at once; past that, it is stuck. */
export const RELEASE_MS = 30_000

/** What the picker says when it took too long: a challenge that expired, or a wait that passed its limit. */
export const TOO_LONG = 'That took too long. Try the passkey again.'

/**
 * The picker, once the offer has let the browser go (`released`): its outcome, or «late» once `ms` have passed, its
 * prompt then closed. An offer that hasn't let go within RELEASE_MS ends it as «late» at once, and starts no picker
 * when it lets go after: nobody waits for it any more.
 */
export async function pickInTime(
  released: Promise<void>,
  ask: (signal: AbortSignal) => Promise<PasskeyOutcome>,
  ms = PICK_LIMIT_MS,
): Promise<PasskeyOutcome | 'late'> {
  const prompt = new AbortController()
  const picked = orLate(released, RELEASE_MS).then((letGo) => (letGo === 'late' ? letGo : ask(prompt.signal)))
  const outcome = await orLate(picked, ms)
  if (outcome === 'late') prompt.abort()
  return outcome
}
