// How long «Let in instead» stands after a Decline (docs/plans/call-way-back.md): for as long as the decline holds, so
// a slip can be taken back until the guest could ask again on their own. The guest may ask again a minute after a
// decline (knock_room enforces it); until then, or until they ask again, leave, or someone lets them in or blocks them,
// the host keeps the one click that undoes it.
import type { LobbyEntry } from '@sophia/contracts'

/** The minute a declined guest waits before they may ask again (A03, knock_room). */
export const ASK_AGAIN_MS = 60_000

/** A guest declined here: as they were when declined, and when. */
export interface Declined {
  entry: LobbyEntry
  at: number
}

/**
 * The declines «Let in instead» still undoes, given the lobby as read now: inside the guest's minute, and while their
 * entry is still the one declined (not asking again with another knock, not let in, gone, or blocked). An entry the
 * lobby hasn't read since the decline (still «waiting» with the same knocks) is the decline on its way: it stands.
 */
export function undoable(declined: readonly Declined[], lobby: readonly LobbyEntry[] | undefined, now: number) {
  return declined.filter(({ entry, at }) => {
    if (now - at >= ASK_AGAIN_MS) return false
    const read = lobby?.find((e) => e.id === entry.id)
    if (!read) return lobby === undefined
    if (read.status === 'denied') return true
    return read.status === 'waiting' && read.knocks <= entry.knocks
  })
}

/** When the next of them leaves the undo by time alone, after `now`; null when none is still to: nothing to wake for. */
export function nextExpiry(declined: readonly Declined[], now: number): number | null {
  const ahead = declined.map((d) => d.at + ASK_AGAIN_MS).filter((at) => at > now)
  return ahead.length === 0 ? null : Math.min(...ahead)
}
