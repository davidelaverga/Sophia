// The padlock's state for the signed-in person (lock.ts), kept on this device. It lives with the app, not a place:
// joining a room shuts it wherever the person is, and leaving the room lifts a lock the room set.
import { useCallback, useEffect, useRef, useState } from 'react'
import { unlockAfterRedirect } from '../../app/reauth.ts'
import { afterRoom, readLock, shut, writeLock, type Lock } from './lock.ts'

export function useLock(identity: string, inRoom: boolean): readonly [Lock, (next: Lock) => void] {
  const [lock, setLock] = useState<Lock>(() => readLock(identity))
  const set = useCallback(
    (next: Lock) => {
      setLock(next)
      writeLock(identity, next)
    },
    [identity],
  )
  const wasInRoom = useRef(false)
  useEffect(() => {
    if (inRoom === wasInRoom.current) return
    wasInRoom.current = inRoom
    setLock((prev) => {
      const next = inRoom ? shut(prev, 'room') : afterRoom(prev)
      writeLock(identity, next)
      return next
    })
  }, [inRoom, identity])
  return [lock, set] as const
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
