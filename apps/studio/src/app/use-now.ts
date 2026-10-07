// One clock for the views that say relative time (docs/plans/time-words.md, part 3): «12 min ago» and «starts in
// 12 min» stay true while someone looks. One interval a pace, shared by every view that reads it, and running only
// while one does; read again after a pause, it starts from the time it is read.
import { useSyncExternalStore } from 'react'

/** The usual pace: words in minutes move once a minute. */
export const MINUTE = 60_000

interface Clock {
  subscribe: (listener: () => void) => () => void
  read: () => number
}

const clocks = new Map<number, Clock>()

/** The clock that moves every `every` ms. */
export function clockFor(every: number): Clock {
  const known = clocks.get(every)
  if (known) return known
  const listeners = new Set<() => void>()
  let now = Date.now()
  let timer: ReturnType<typeof setInterval> | null = null
  const clock: Clock = {
    subscribe: (listener) => {
      if (listeners.size === 0) {
        now = Date.now()
        timer = setInterval(() => {
          now = Date.now()
          for (const heard of listeners) heard()
        }, every)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0 || timer === null) return
        clearInterval(timer)
        timer = null
      }
    },
    // Idle for a pace or more (no view read it), it is read afresh: a view shown again never paints old words.
    read: () => {
      if (timer === null && Date.now() - now >= every) now = Date.now()
      return now
    },
  }
  clocks.set(every, clock)
  return clock
}

/** The time now, moved on every `every` ms while the view is shown; a view joining a running clock reads its tick. */
export function useNow(every = MINUTE): number {
  const clock = clockFor(every)
  return useSyncExternalStore(clock.subscribe, clock.read)
}
