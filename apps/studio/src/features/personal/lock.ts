// The padlock on the personal space (direction C): a privacy screen on this device, the same in every tab of it. While
// it is shut nothing personal is fetched or shown, and opening it asks the person to confirm it's them
// (app/reauth.ts). The person shuts it, and so does every call (a screen may be shared there); only the person opens
// it again. One stored value is the truth (useLock): every write only shuts it, but the person's own unlock, so writes
// from any number of tabs, in any order, leave it shut once a call has shut it.
import type { LockedBy } from './places-view.ts'

export type Lock = { locked: false } | { locked: true; by: LockedBy }

export const OPEN: Lock = { locked: false }

/** Close the side. A lock already set keeps who set it. */
export const shut = (lock: Lock, by: LockedBy): Lock => (lock.locked ? lock : { locked: true, by })

export const lockedBy = (lock: Lock): LockedBy | null => (lock.locked ? lock.by : null)

export const lockKey = (identity: string) => `sophia.personal.lock.v1.${identity}`

/**
 * The stored value as the padlock: absent is open; "room", shut by a call; anything else ("you", and "locked" as it was
 * written before the reason was kept), shut by the person.
 */
export function storedLock(value: string | null): Lock {
  if (value === null) return OPEN
  return { locked: true, by: value === 'room' ? 'room' : 'you' }
}

/** What a call that begins, or moves to another project, stores: a lock the person set stays theirs. */
export const onCallStart = (stored: string | null): string => (stored === null || stored === 'room' ? 'room' : stored)

type Kept = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface LockStore {
  /** The stored value now, as the raw string (the same between changes), or null for open. */
  read: () => string | null
  write: (value: string | null) => void
  /** Told after every write of this tab; the storage event tells the others. */
  subscribe: (onChange: () => void) => () => void
}

/**
 * One person's stored padlock on this device. Where the browser keeps nothing (storage that can't be read), it starts
 * shut: a personal space never shows unasked. Once a write fails, this page keeps what it last wrote.
 */
export function lockStore(key: string, storage: Kept | null): LockStore {
  let memory: string | null = 'you'
  let ownWrite = storage === null
  const listeners = new Set<() => void>()
  return {
    read: () => {
      if (ownWrite || !storage) return memory
      try {
        return storage.getItem(key)
      } catch {
        ownWrite = true
        return memory
      }
    },
    write: (value) => {
      memory = value
      try {
        if (!storage) throw new Error('No storage on this page')
        if (value === null) storage.removeItem(key)
        else storage.setItem(key, value)
        ownWrite = false
      } catch {
        ownWrite = true
      }
      for (const told of listeners) told()
    },
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
  }
}
