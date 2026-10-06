// A write whose intent outlives the part that sends it (docs/plans/project-conversation-writes.md): its key and its
// words are held by the view, not by the composer or the form, so opening another conversation (or putting the form
// away) and coming back finds the same intent. On its way, nothing goes again; with no reply, the press sends it again
// under its key, never a second record; answered either way, it is let go.
import { useState } from 'react'
import { ApiError } from '../../api/client.ts'

/** An intent on its way, or sent with no reply: its key and the words it was sent with. */
export interface Held<A> {
  key: string
  ask: A
  sending: boolean
}

const noReply = () => new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')

export function useHeldWrite<A, R>(
  held: Held<A> | null,
  onHeld: (next: Held<A> | null) => void,
  send: (key: string, ask: A) => Promise<R>,
) {
  const [error, setError] = useState<ApiError | null>(null)
  /** Sends the held intent again, or this new one under a new key; undefined unless it was recorded. */
  const run = async (fresh: A): Promise<R | undefined> => {
    if (held?.sending) return undefined
    const ask = held?.ask ?? fresh
    const key = held?.key ?? crypto.randomUUID()
    onHeld({ key, ask, sending: true })
    setError(null)
    try {
      const result = await send(key, ask)
      onHeld(null)
      return result
    } catch (err: unknown) {
      const failure = err instanceof ApiError ? err : noReply()
      if (failure.retry === 'same_admission_key') {
        onHeld({ key, ask, sending: false })
      } else {
        onHeld(null)
        setError(failure)
      }
      return undefined
    }
  }
  return {
    busy: held?.sending === true,
    /** The words sent with no reply: the press sends them again. */
    unknown: held && !held.sending ? held.ask : null,
    error,
    run,
  }
}
