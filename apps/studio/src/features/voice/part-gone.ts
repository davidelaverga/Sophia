// A part of the call gone after a deploy (docs/plans/stale-part-call.md, costuras.md seam #4). The room's LiveKit loads
// at the first Join or check; after a deploy that renamed it, the host has it no more. The build's preload helper says
// so first (`vite:preloadError`, which the new-version notice hears), then rethrows the browser's own TypeError, and
// every press after fails the same way until a reload. Pure over what was heard, so the words are unit-tested.
import { ApiError } from '../../api/client.ts'

/** What the room says when its call's code is gone from the host: the tab is on an older version. */
export const STALE_PART = 'This tab is on an older version of Sophia, so the call couldn’t load.'

/**
 * The browser couldn't fetch a module, after Vite said a part is gone (`heard`). A LiveKit failure, a refused
 * permission (a DOMException) or the API's answer is none of these.
 */
export const partGone = (err: unknown, heard: boolean): boolean => heard && err instanceof TypeError

/**
 * A failed join in words: an older version's part gone, the API's own refusal, or what to check when the room could
 * not be reached.
 */
export function joinMessage(err: unknown, heard: boolean): string {
  if (partGone(err, heard)) return STALE_PART
  if (err instanceof ApiError && err.status > 0 && err.status < 500) return err.message
  if (err instanceof ApiError) return 'The room isn’t available right now. Try again in a moment.'
  return 'Couldn’t connect to the room. Check your connection and try again.'
}

/** Why a device list was refused: its part gone (`stale`), or the browser keeping access back. */
export const refusalOf = (err: unknown, heard: boolean): 'stale' | 'refused' =>
  partGone(err, heard) ? 'stale' : 'refused'
