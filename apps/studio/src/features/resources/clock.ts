// The view's clock: the time it was given, moved on by how long the page has been open, once a minute (or as often as
// asked). Ages ("2 min ago") and countdowns ("resets in 40 min") stay true while someone looks, without asking
// anything again. A new time given (a fresh read) starts it over; a new pace doesn't: it counts from the same moment,
// so the clock never steps back when it starts or stops ticking each second.
import { useEffect, useRef, useState } from 'react'

const MINUTE = 60_000

export function useClock(given: Date, every = MINUTE): Date {
  const start = given.getTime()
  const [moved, setMoved] = useState({ start, ms: 0 })
  // When this time was given: kept across a change of pace, renewed with a new time.
  const origin = useRef<{ start: number; at: number } | null>(null)
  useEffect(() => {
    if (origin.current?.start !== start) origin.current = { start, at: Date.now() }
    const opened = origin.current.at
    const timer = setInterval(() => setMoved({ start, ms: Date.now() - opened }), every)
    return () => clearInterval(timer)
  }, [start, every])
  return new Date(start + (moved.start === start ? moved.ms : 0))
}
