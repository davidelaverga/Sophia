// The padlock for the signed-in person (lock.ts): one stored value per device, and every tab shows what it says. Every
// call shuts it, also one that moves to another project without a pause; a call's end opens nothing; only the person
// opens it again, after confirming it's them.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { orLate } from '../../app/deadline.ts'
import { unlockAfterRedirect } from '../../app/reauth.ts'
import { lockKey, lockStore, onCallStart, storedLock, type Lock } from './lock.ts'

/** The browser's storage, or null where even asking for it throws (the padlock then starts shut: lockStore). */
function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * `account`: whose padlock (accountOf). `room`: the project whose room holds this tab's call, or null. Also returns the
 * padlock as stored this moment, for work that ends later (a copy): a lock written anywhere counts at once, before this
 * page draws it.
 */
export function useLock(account: string, room: string | null): readonly [Lock, (next: Lock) => void, () => boolean] {
  const key = lockKey(account)
  const store = useMemo(() => lockStore(key, deviceStorage()), [key])
  // Read again on this tab's own writes, on another tab's (the storage event; a null key is storage cleared), and when
  // the tab comes back from the background or the back-forward cache, where an event may have been missed.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onChange()
      }
      const off = store.subscribe(onChange)
      window.addEventListener('storage', onStorage)
      window.addEventListener('pageshow', onChange)
      document.addEventListener('visibilitychange', onChange)
      return () => {
        off()
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('pageshow', onChange)
        document.removeEventListener('visibilitychange', onChange)
      }
    },
    [key, store],
  )
  const stored = useSyncExternalStore(subscribe, store.read)
  const set = useCallback((next: Lock) => store.write(next.locked ? next.by : null), [store])
  const lockedNow = useCallback(() => storedLock(store.read()).locked, [store])
  const lastRoom = useRef<string | null>(null)
  useEffect(() => {
    const was = lastRoom.current
    lastRoom.current = room
    if (room !== null && room !== was) store.write(onCallStart(store.read()))
  }, [room, store])
  return [storedLock(stored), set, lockedNow] as const
}

/** How long the check of a provider's return may take before the person is told it couldn't be read. */
const RETURN_CHECK_MS = 20_000

/**
 * Back from the provider the padlock sent the person to (app/reauth.ts): a check that passed runs `passed` once (open the
 * side, go to it); one that couldn't be read in time, or at all, runs `unchecked` (the toast says so). A check that
 * didn't pass (Back, another account), or none, changes nothing.
 */
export function useUnlockOnReturn(on: { passed: () => void; unchecked: () => void }): void {
  const latest = useRef(on)
  useEffect(() => {
    latest.current = on
  })
  useEffect(() => {
    void orLate(unlockAfterRedirect(), RETURN_CHECK_MS).then(
      (outcome) => {
        if (outcome === 'passed') latest.current.passed()
        else if (outcome === 'late') latest.current.unchecked()
      },
      () => latest.current.unchecked(),
    )
  }, [])
}
