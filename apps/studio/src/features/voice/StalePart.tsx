// A part of the call gone after a deploy (docs/plans/stale-part-call.md): the line, and Reload, one press. Nothing
// reloads by itself: that would cut a call (new-version.md).
import { STALE_PART } from './part-gone.ts'

export function StalePart() {
  return (
    <>
      <span>{STALE_PART}</span>
      <button type="button" className="text-button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </>
  )
}
