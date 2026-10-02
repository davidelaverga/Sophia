// A press whose write is on its way waits (aria-disabled, and says so) and starts no second write for the same thing: a
// second would be refused as stale ("That changed a moment ago"), and its notice would replace the first's, Undo and
// all. Keep and No thanks on a suggestion, Ask again and Take back go through it; the field's sends, a carry and the
// sheets' presses have waits of their own.
import { useRef, useState } from 'react'

export function usePresses() {
  const [waiting, setWaiting] = useState<ReadonlySet<string>>(() => new Set())
  const now = useRef(new Set<string>())
  const settle = (key: string) => {
    now.current.delete(key)
    setWaiting(new Set(now.current))
  }
  return {
    /** Whether the press for `key` (a suggestion, a turn, a note carried to a project) is being answered. */
    waits: (key: string) => waiting.has(key),
    /** Writes for `key` unless its write is on its way already. `write` says its own failure. */
    press: (key: string, write: () => Promise<unknown>) => {
      if (now.current.has(key)) return
      now.current.add(key)
      setWaiting(new Set(now.current))
      void write().then(
        () => settle(key),
        () => settle(key),
      )
    },
  }
}

export type Presses = ReturnType<typeof usePresses>
