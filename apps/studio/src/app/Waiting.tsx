// A read under way says so, and after a few seconds adds the Studio's one line that it is still working (useSlow).
import { SLOW_NOTE, useSlow } from './useSlow.ts'

export function Waiting({ words, waiting }: { words: string; waiting: boolean }) {
  const slow = useSlow(waiting)
  if (!waiting) return null
  return (
    <p className="sheet-lead" role="status">
      {words}
      {slow && ` ${SLOW_NOTE}`}
    </p>
  )
}
