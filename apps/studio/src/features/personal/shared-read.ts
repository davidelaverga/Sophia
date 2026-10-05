// One read of earlier days at a time, shared: whoever asks while one is on its way (the days' menu, Find's "Look
// further back") gets that one, and everyone sees it is on its way.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export function useSharedRead(read: () => Promise<void>): { reading: boolean; run: () => Promise<void> } {
  const [reading, setReading] = useState(false)
  const inFlight = useRef<Promise<void> | null>(null)
  const latest = useRef(read)
  // Kept current before any press can come after a render (the page that just arrived moves where reading starts).
  useLayoutEffect(() => {
    latest.current = read
  })
  const run = useCallback(() => {
    if (inFlight.current) return inFlight.current
    setReading(true)
    const once = latest.current().finally(() => {
      inFlight.current = null
      setReading(false)
    })
    inFlight.current = once
    return once
  }, [])
  return { reading, run }
}
