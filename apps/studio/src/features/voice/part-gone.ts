// A part of the call gone after a deploy (docs/plans/stale-part-call.md, costuras.md seam #4). The room's LiveKit loads
// at the first Join or check; after a deploy that renamed it, the host has it no more. The build's preload helper says
// so first (`vite:preloadError`, which the new-version notice hears), then rethrows the browser's own TypeError, and
// every press after fails the same way until a reload. The version probe tells of a deploy too, with no error: so
// only the error Vite said was gone counts, or a module the browser couldn't fetch in its own words (Chromium,
// Firefox, Safari) once a new version was heard (review P3, 2026-10-22). Pure over what was heard, so tested.
import { ApiError } from '../../api/client.ts'

/** What the room says when its call's code is gone from the host: the tab is on an older version. */
export const STALE_PART = 'This tab is on an older version of Sophia, so the call couldn’t load.'

/** What the page heard of a new version (new-version-signal.ts): whether, and the error Vite said was gone. */
export interface Heard {
  heard: () => boolean
  payload: () => unknown
}

/** The browsers' words for a module they couldn't fetch: Chromium's and Firefox's, then Safari's. */
const GONE_WORDS = /dynamically imported module|Importing a module script failed/

/**
 * The error Vite said was gone, or a module the browser couldn't fetch after a new version was heard. A LiveKit
 * failure, a refused permission (a DOMException), the API's answer or a TypeError of another kind is none of these.
 */
export function partGone(err: unknown, seen: Heard): boolean {
  if (err === null || err === undefined) return false
  if (err === seen.payload()) return true
  return seen.heard() && err instanceof TypeError && GONE_WORDS.test(err.message)
}

/**
 * A failed join in words: an older version's part gone, the API's own refusal, or what to check when the room could
 * not be reached.
 */
export function joinMessage(err: unknown, seen: Heard): string {
  if (partGone(err, seen)) return STALE_PART
  if (err instanceof ApiError && err.status > 0 && err.status < 500) return err.message
  if (err instanceof ApiError) return 'The room isn’t available right now. Try again in a moment.'
  return 'Couldn’t connect to the room. Check your connection and try again.'
}

/** Why a device list was refused: its part gone (`stale`), or the browser keeping access back. */
export const refusalOf = (err: unknown, seen: Heard): 'stale' | 'refused' => (partGone(err, seen) ? 'stale' : 'refused')
