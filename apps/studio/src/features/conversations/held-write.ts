// A write whose intent outlives the part that sends it (docs/plans/project-conversation-writes.md): its key and its
// words are held by the view, not by the composer or the form, so opening another conversation (or putting the form
// away) and coming back finds the same intent. On its way, nothing goes again; with no reply, the press sends it again
// under its key, never a second record; answered either way, it is let go.
import { ApiError } from '../../api/client.ts'
import { currentGeneration } from './talk-store.ts'

/** An intent on its way, or sent with no reply: its key and the words it was sent with. */
export interface Held<A> {
  key: string
  ask: A
  sending: boolean
}

/** Only these held conversation starts/sends use the addressed contract on their next press. */
export const isAddressedWrite = (held: Held<{ addressingVersion?: 1 }> | null): boolean =>
  held?.ask.addressingVersion === 1

const unavailableReplay = (held: boolean, enabled: boolean, failure: ApiError): boolean =>
  held &&
  enabled &&
  ((failure.unstructuredHttp && failure.status === 404 && failure.code === 'http_404') ||
    (!failure.unstructuredHttp &&
      failure.status === 503 &&
      failure.code === 'projection_unavailable' &&
      failure.retry === 'never'))

const noReply = () => new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')

/** Where a write's refusal is kept (with its intent, by the view): its words, until the next press. */
export interface Refusal {
  words: string | null
  onWords: (words: string | null) => void
  /** A refusal in words a person can act on. */
  say: (err: ApiError) => string
}

export function useHeldWrite<A, R>(
  held: Held<A> | null,
  onHeld: (next: Held<A> | null) => void,
  send: (key: string, ask: A) => Promise<R>,
  refusal: Refusal,
  /** Addressed start/send only: an unavailable receipt lookup cannot settle an earlier unanswered request. */
  retainRouteUnavailable = false,
) {
  /**
   * Sends the held intent again, or this new one under a new key; undefined unless it was recorded, and undefined too
   * when the account was forgotten meanwhile (signed out, another identity): nothing on the page follows from it.
   */
  const run = async (fresh: A): Promise<R | undefined> => {
    if (held?.sending) return undefined
    const ask = held?.ask ?? fresh
    const key = held?.key ?? crypto.randomUUID()
    const born = currentGeneration()
    onHeld({ key, ask, sending: true })
    refusal.onWords(null)
    try {
      const result = await send(key, ask)
      onHeld(null)
      return born === currentGeneration() ? result : undefined
    } catch (err: unknown) {
      const failure = err instanceof ApiError ? err : noReply()
      if (failure.retry === 'same_admission_key' || unavailableReplay(held !== null, retainRouteUnavailable, failure)) {
        onHeld({ key, ask, sending: false })
      } else {
        // Kept with the intent, by the view: whatever part pressed may be gone by now.
        onHeld(null)
        refusal.onWords(refusal.say(failure))
      }
      return undefined
    }
  }
  return {
    busy: held?.sending === true,
    /** The words sent with no reply: the press sends them again. */
    unknown: held && !held.sending ? held.ask : null,
    refused: refusal.words,
    run,
  }
}
