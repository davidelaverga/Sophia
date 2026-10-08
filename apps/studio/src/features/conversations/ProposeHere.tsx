// «Propose as decision» on a message (docs/plans/conversations-decide.md, C7): a short form under it, its words already
// in, sent as one of the project's constraints (A08). Shown to those who can write here: a small press at the corner of
// the message itself, under the pointer or the focus on a wide screen, on the message pressed on a phone, so the thread
// never spreads or jumps. Esc closes the form and gives the focus back to its press.
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { refusalWords, statementFrom, usePropose } from './decide.ts'

export interface ProposeArgs {
  projectId: string
  identity: Identity
  text: string
  sophia: boolean
}

/**
 * One message's proposing: its press (drawn at the message's corner) and, once pressed, its form (drawn under the
 * message). Both null where the person can't write here.
 */
export function useProposeHere(args: ProposeArgs | null): { press: ReactNode; form: ReactNode } {
  const [words, setWords] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const press = useRef<HTMLButtonElement>(null)
  const propose = usePropose(args?.projectId ?? '', args?.identity ?? null)
  if (!args) return { press: null, form: null }
  const state = propose.state
  /** What was sent with no definitive answer yet (on its way, or no reply): it may already have landed. */
  const unsettled = state.status === 'sending' || state.status === 'unknown' ? state.args : null
  const away = () => {
    setWords(null)
    requestAnimationFrame(() => press.current?.focus())
  }
  // Closed with a proposal unsettled, its key stays: reopened, Propose sends that same one, never a second.
  const close = () => {
    if (unsettled === null) propose.reset()
    away()
  }
  const open = () => {
    setDone(false)
    setWords(unsettled ?? statementFrom(args.text, args.sophia))
  }
  // Proposed: settled for good, whichever press sent it.
  const proposed = () => {
    propose.reset()
    setDone(true)
    away()
  }
  return {
    press: words === null ? <ProposePress press={press} done={done} onOpen={open} /> : null,
    form:
      words === null ? null : (
        <ProposeForm words={words} onWords={setWords} propose={propose} onClose={close} onDone={proposed} />
      ),
  }
}

/** The small press at the message's corner, and once proposed, what it says. */
function ProposePress(props: { press: RefObject<HTMLButtonElement | null>; done: boolean; onOpen: () => void }) {
  return (
    <span className="conv-propose">
      {props.done && (
        <span className="conv-proposed" role="status">
          Proposed · it’s in Still open
        </span>
      )}
      <button
        ref={props.press}
        type="button"
        className="conv-propose-press has-tip"
        aria-label="Propose as decision"
        onClick={(e) => {
          // The message's own press (a phone's) is not this one.
          e.stopPropagation()
          props.onOpen()
        }}
      >
        <Icon name="decide" />
        <Tip label="Propose as decision" side="top" align="end" />
      </button>
    </span>
  )
}

/** The statement to propose, its words already in; one press sends it once, whatever the network does. */
function ProposeForm(props: {
  words: string
  onWords: (words: string) => void
  propose: ReturnType<typeof usePropose>
  onClose: () => void
  onDone: () => void
}) {
  const { words, propose } = props
  const sending = propose.state.status === 'sending'
  const empty = words.trim().length === 0
  return (
    <form
      className="conv-propose-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (sending || empty) return
        void propose.send(words.trim()).then((receipt) => {
          if (receipt) props.onDone()
        })
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        props.onClose()
      }}
    >
      <textarea
        autoFocus
        aria-label="Decision to propose"
        value={words}
        // On their way, or with no reply (Propose sends these same words again under the same key): they can't change.
        readOnly={sending || propose.state.status === 'unknown'}
        maxLength={280}
        onChange={(e) => props.onWords(e.target.value)}
      />
      <div className="conv-propose-acts">
        <button type="submit" className="pill" aria-disabled={sending || empty || undefined}>
          {sending ? 'Proposing…' : 'Propose'}
        </button>
        <button type="button" className="text-button" onClick={props.onClose}>
          Cancel
        </button>
        {propose.state.status === 'unknown' && (
          <span role="alert">No reply yet. Press Propose again: it sends the same proposal, never a second.</span>
        )}
        {propose.state.status === 'rejected' && (
          <span role="alert">{refusalWords(propose.state.error, 'propose')}</span>
        )}
      </div>
    </form>
  )
}
