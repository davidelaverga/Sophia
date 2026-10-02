// A personal write sent once, and once more under the SAME key when no answer came back (it may have committed), but
// only while its first attempt is recent: a write the person saw fail minutes ago must not land later. (A retry from
// before an erasure writes nothing however late: erasure keeps every key, 0021.)
import { ApiError } from '../../api/client.ts'
import type { PersonalReceipt } from '@sophia/contracts'

/** How long after a write's first attempt its retry may still go. */
export const RETRY_WINDOW_MS = 120_000

/** `key`: the write's own (a draft's, kept with its words on the device, so every tab sends them under it). */
export async function once<R = PersonalReceipt>(
  run: (key: string) => Promise<R>,
  clock = Date.now,
  key: string = crypto.randomUUID(),
): Promise<R> {
  const began = clock()
  try {
    return await run(key)
  } catch (err: unknown) {
    const recent = clock() - began < RETRY_WINDOW_MS
    if (err instanceof ApiError && err.code === 'outcome_unknown' && recent) return run(key)
    throw err
  }
}
