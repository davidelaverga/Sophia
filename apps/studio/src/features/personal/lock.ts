// The padlock on the personal side (direction C): a privacy screen on this device. While it is shut nothing personal is
// fetched or shown, and opening it asks the person to confirm it's them (app/reauth.ts). A lock set by joining a room
// (where a screen may be shared) lifts when the room is left; a lock the person set stays until they unlock. A room
// doesn't survive a reload, so a lock kept across one counts as the person's.
import type { LockedBy } from './places-view.ts'

export type Lock = { locked: false } | { locked: true; by: LockedBy }

export const OPEN: Lock = { locked: false }

/** Close the side. A lock already set keeps who set it: a room never turns the person's own lock into its own. */
export const shut = (lock: Lock, by: LockedBy): Lock => (lock.locked ? lock : { locked: true, by })

/** Leaving a room opens a lock the room set, and nothing else. */
export const afterRoom = (lock: Lock): Lock => (lock.locked && lock.by === 'room' ? OPEN : lock)

export const lockedBy = (lock: Lock): LockedBy | null => (lock.locked ? lock.by : null)

const keyFor = (identity: string) => `sophia.personal.lock.v1.${identity}`

export function readLock(identity: string): Lock {
  try {
    return localStorage.getItem(keyFor(identity)) === 'locked' ? { locked: true, by: 'you' } : OPEN
  } catch {
    return OPEN // storage unavailable: nothing was kept, so nothing is locked
  }
}

export function writeLock(identity: string, lock: Lock): void {
  try {
    if (lock.locked) localStorage.setItem(keyFor(identity), 'locked')
    else localStorage.removeItem(keyFor(identity))
  } catch {
    // storage unavailable: the lock lasts for this page only
  }
}
