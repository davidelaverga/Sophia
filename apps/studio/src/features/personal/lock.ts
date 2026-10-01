// The padlock on the personal space (direction C): a privacy screen on this device, in every tab of it. While it is shut
// nothing personal is fetched or shown, and opening it asks the person to confirm it's them (app/reauth.ts). A lock set
// by joining a room (where a screen may be shared) lifts when the room is left; a lock the person set stays until they
// unlock. A room doesn't survive a reload, so a lock kept across one counts as the person's.
import type { LockedBy } from './places-view.ts'

export type Lock = { locked: false } | { locked: true; by: LockedBy }

export const OPEN: Lock = { locked: false }

/** Close the side. A lock already set keeps who set it: a room never turns the person's own lock into its own. */
export const shut = (lock: Lock, by: LockedBy): Lock => (lock.locked ? lock : { locked: true, by })

/** Leaving a room opens a lock the room set, and nothing else. */
export const afterRoom = (lock: Lock): Lock => (lock.locked && lock.by === 'room' ? OPEN : lock)

/**
 * The padlock as the call changes (its project, or none): every new call shuts it, also one that replaces another
 * without a pause (a screen may be shared in it); the end of the calls lifts the room's lock.
 */
export function onCallChange(lock: Lock, was: string | null, now: string | null): Lock {
  if (now === was) return lock
  return now === null ? afterRoom(lock) : shut(lock, 'room')
}

export const lockedBy = (lock: Lock): LockedBy | null => (lock.locked ? lock.by : null)

export const lockKey = (identity: string) => `sophia.personal.lock.v1.${identity}`

/** What another tab of this person stored ('locked' was written before the reason was kept). */
export function storedLock(value: string | null): Lock {
  if (value === null) return OPEN
  return { locked: true, by: value === 'room' ? 'room' : 'you' }
}

/** Another tab shut the padlock or opened it: this one follows, but never opens while it holds a call itself. */
export const followed = (stored: Lock, inRoom: boolean): Lock => (inRoom ? shut(stored, 'room') : stored)

export function readLock(identity: string): Lock {
  try {
    return localStorage.getItem(lockKey(identity)) === null ? OPEN : { locked: true, by: 'you' }
  } catch {
    return OPEN // storage unavailable: nothing was kept, so nothing is locked
  }
}

export function writeLock(identity: string, lock: Lock): void {
  try {
    if (lock.locked) localStorage.setItem(lockKey(identity), lock.by)
    else localStorage.removeItem(lockKey(identity))
  } catch {
    // storage unavailable: the lock lasts for this page only
  }
}
