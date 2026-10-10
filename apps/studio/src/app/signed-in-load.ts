// The signed-in Studio's chunk (docs/plans/signed-in-later.md), fetched once: when a session is there, or as someone
// starts to sign in, so it is there by the time they are in.
import type { Studio } from './SignedIn.tsx'

let loading: Promise<{ Studio: typeof Studio }> | null = null

/** The signed-in Studio's module: one fetch, whoever asks first. */
export function loadSignedIn(): Promise<{ Studio: typeof Studio }> {
  loading ??= import('./SignedIn.tsx')
  return loading
}

/** Fetched ahead, never waited on: not on a connection that asks to save data. */
export function warmSignedIn(): void {
  const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  if (!saving) void loadSignedIn().catch(() => undefined)
}
