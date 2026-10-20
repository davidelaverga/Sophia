// What a read that is slow or failed says, where its content would be (places-view.ts: readState). A wait that goes on
// adds the Studio's one line under the bar (useSlow, `.wait-note`, as over a project slow to open); a read that failed
// says so with Try again. Nothing that failed to load looks empty: an empty personal space reads as a deleted one.
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import type { ReadState } from './places-view.ts'

export interface Read {
  state: ReadState
  /** What failed, in words (READ_FAILED). */
  failed: string
  retry: () => void
}

/** The reads that failed, each said with Try again; nothing while none has. */
export function FailedReads({ reads }: { reads: readonly Read[] }) {
  const failed = reads.filter((r) => r.state === 'failed')
  if (failed.length === 0) return null
  return (
    <div className="place-notices">
      {failed.map((r) => (
        <p key={r.failed} className="place-notice" role="alert">
          {r.failed}
          <button className="text-button" type="button" onClick={r.retry}>
            Try again
          </button>
        </p>
      ))}
    </div>
  )
}

export function ReadNotes({ reads }: { reads: readonly Read[] }) {
  const slow = useSlow(reads.some((r) => r.state === 'loading'))
  return (
    <>
      {slow && (
        <p className="wait-note arrive" role="status">
          {SLOW_NOTE}
        </p>
      )}
      <FailedReads reads={reads} />
    </>
  )
}
