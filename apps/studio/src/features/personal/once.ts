// A personal write sent once, and once more under the SAME key when no answer came back (it may have committed), but
// only while its first attempt is recent. Erasure keeps a write's key ten minutes (0021): a retry from a device that
// slept for longer could find it gone and write again into a space the person erased.
import { ApiError } from '../../api/client.ts'
import type { PersonalReceipt } from '@sophia/contracts'

/** How long after a write's first attempt its retry may still go. */
export const RETRY_WINDOW_MS = 120_000

export async function once<R = PersonalReceipt>(run: (key: string) => Promise<R>, clock = Date.now): Promise<R> {
  const key = crypto.randomUUID()
  const began = clock()
  try {
    return await run(key)
  } catch (err: unknown) {
    const recent = clock() - began < RETRY_WINDOW_MS
    if (err instanceof ApiError && err.code === 'outcome_unknown' && recent) return run(key)
    throw err
  }
}
