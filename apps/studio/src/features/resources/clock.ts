// The view's clock: the time it was given, moved on by how long the page has been open, once a minute. Ages ("2 min
// ago") and countdowns ("resets in 40 min") stay true while someone looks, without asking anything again. A new time
// given (a fresh read) starts it over.
import { useEffect, useState } from 'react'

const MINUTE = 60_000

export function useClock(given: Date, every = MINUTE): Date {
  const start = given.getTime()
  const [moved, setMoved] = useState({ start, ms: 0 })
  useEffect(() => {
    const opened = Date.now()
    const timer = setInterval(() => setMoved({ start, ms: Date.now() - opened }), every)
    return () => clearInterval(timer)
  }, [start, every])
  return new Date(start + (moved.start === start ? moved.ms : 0))
}
