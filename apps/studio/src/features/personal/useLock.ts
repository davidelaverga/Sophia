// The padlock's state for the signed-in person (lock.ts), kept on this device and the same in each of its tabs. It
// lives with the app, not a place: joining a room shuts it wherever the person is, and leaving the room lifts a lock
// the room set.
import { useCallback, useEffect, useRef, useState } from 'react'
import { unlockAfterRedirect } from '../../app/reauth.ts'
import { followed, lockKey, onCallChange, readLock, storedLock, writeLock, type Lock } from './lock.ts'

/** `room`: the project whose room holds this tab's call, or null. */
export function useLock(identity: string, room: string | null): readonly [Lock, (next: Lock) => void] {
  const [lock, setLock] = useState<Lock>(() => readLock(identity))
  const set = useCallback(
    (next: Lock) => {
      setLock(next)
      writeLock(identity, next)
    },
    [identity],
  )
  const lastRoom = useRef<string | null>(null)
  useEffect(() => {
    const was = lastRoom.current
    lastRoom.current = room
    if (was === room) return
    setLock((prev) => {
      const next = onCallChange(prev, was, room)
      writeLock(identity, next)
      return next
    })
  }, [room, identity])
  useOtherTabs(identity, room !== null, setLock)
  return [lock, set] as const
}

/**
 * Another tab of this person shut the padlock or opened it (the browser tells every other tab): this one follows, so a
 * screen shared from that tab never shows this one open. A tab in a call itself stays shut (followed).
 */
function useOtherTabs(identity: string, inRoom: boolean, setLock: (lock: Lock) => void) {
  const room = useRef(inRoom)
  useEffect(() => {
    room.current = inRoom
  })
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === lockKey(identity)) setLock(followed(storedLock(e.newValue), room.current))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [identity, setLock])
}

/**
 * Back from the provider the padlock sent the person to (app/reauth.ts): a check that passed runs `onPassed` once
 * (open the side, go to it). A check that didn't, or none, changes nothing.
 */
export function useUnlockOnReturn(onPassed: () => void): void {
  const latest = useRef(onPassed)
  useEffect(() => {
    latest.current = onPassed
  })
  useEffect(() => {
    void unlockAfterRedirect()
      .then((passed) => {
        if (passed) latest.current()
      })
      .catch(() => undefined) // a check that couldn't be read opens nothing
  }, [])
}
