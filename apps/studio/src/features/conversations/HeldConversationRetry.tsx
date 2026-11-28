// A read-only project can still confirm an addressed write already sent under its original key.
import { useOnline } from '../personal/online.ts'
import { useHeldWrite, type Held, type Refusal } from './held-write.ts'

const REFUSED = 'The previous request was refused.'

/** Show only the fixed retry refusal, even after its held request has been cleared. */
export function HeldRetryRefusal({ words }: { words: string | null }) {
  return words === REFUSED ? (
    <p role="alert" className="conv-note">
      {REFUSED}
    </p>
  ) : null
}

interface Props<A, R> {
  label: 'Start' | 'Send'
  held: Held<A>
  onHeld: (next: Held<A> | null) => void
  refusal: Omit<Refusal, 'say'>
  send: (key: string, ask: A) => Promise<R>
  onRecorded: (receipt: R, ask: A) => void
}

/** The held request's words, target, attachment and recipients stay out of this control. */
export function HeldConversationRetry<A, R>({ label, held, onHeld, refusal, send, onRecorded }: Props<A, R>) {
  const online = useOnline()
  const write = useHeldWrite(held, onHeld, send, { ...refusal, say: () => REFUSED }, true)
  const retry = async () => {
    if (write.busy || !online) return
    const receipt = await write.run(held.ask)
    if (receipt !== undefined) onRecorded(receipt, held.ask)
  }
  return (
    <p role="status" className="conv-note">
      {write.busy ? 'Checking the previous request…' : 'The previous request wasn’t confirmed.'}{' '}
      <button type="button" className="text-button" disabled={write.busy || !online} onClick={() => void retry()}>
        Retry {label}
      </button>
    </p>
  )
}
