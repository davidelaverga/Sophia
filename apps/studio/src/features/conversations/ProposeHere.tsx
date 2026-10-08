// «Propose as decision» on a message (docs/plans/conversations-decide.md, C7): a short form under it, its words already
// in, sent as one of the project's constraints (A08). Shown to those who can write here: a small press at the corner of
// the message itself, under the pointer or the focus on a wide screen, on the message pressed on a phone, so the thread
// never spreads or jumps. Esc closes the form and gives the focus back to its press. A proposal on its way, or sent
// with no reply, is held by the view (talk-store.ts), its key and words with it: closing the form, opening another
// conversation or leaving for another view and coming back finds the same one, sent again under its key, never twice.
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { refusalWords, statementFrom, useProposeSend } from './decide.ts'
import { useHeldWrite, type Held } from './held-write.ts'
import { useKept, withEntry } from './talk-store.ts'

export interface ProposeArgs {
  projectId: string
  identity: Identity
  /** The message proposed from: its proposal is held under it. */
  messageId: string
  text: string
  sophia: boolean
}

/** Where nobody can propose: the hooks still run, as hooks must, over nothing. */
const NOBODY = { projectId: '', identity: null, messageId: '' }

/** One message's proposal as the view holds it: its write (held under the message), and its refusal's words. */
function useHeldProposal(args: ProposeArgs | null) {
  const { projectId, identity, messageId: id } = args ?? NOBODY
  const { kept, change } = useKept(projectId, identity?.name ?? '')
  return useHeldWrite<string, unknown>(
    kept.proposals[id] ?? null,
    (next: Held<string> | null) => change((was) => ({ ...was, proposals: withEntry(was.proposals, id, next) })),
    useProposeSend(projectId, identity),
    {
      words: kept.proposalRefusals[id] ?? null,
      onWords: (words) => change((was) => ({ ...was, proposalRefusals: withEntry(was.proposalRefusals, id, words) })),
      say: (err) => refusalWords(err, 'propose'),
    },
  )
}

type Proposal = ReturnType<typeof useHeldProposal>

/**
 * One message's proposing: its press (drawn at the message's corner) and, once pressed, its form (drawn under the
 * message). Both null where the person can't write here.
 */
export function useProposeHere(args: ProposeArgs | null): { press: ReactNode; form: ReactNode } {
  const [words, setWords] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const press = useRef<HTMLButtonElement>(null)
  /** Whether the form is open now: a reply that lands after it closed takes no focus from where the person went. */
  const isOpen = useRef(false)
  const proposal = useHeldProposal(args)
  if (!args) return { press: null, form: null }
  const away = () => {
    const wasOpen = isOpen.current
    isOpen.current = false
    setWords(null)
    if (wasOpen) requestAnimationFrame(() => press.current?.focus())
  }
  const open = () => {
    setDone(false)
    isOpen.current = true
    // What was sent with no definitive answer comes back as it went: it may already have landed.
    setWords(proposal.unknown ?? statementFrom(args.text, args.sophia))
  }
  const proposed = () => {
    setDone(true)
    away()
  }
  return {
    press: words === null ? <ProposePress press={press} done={done} onOpen={open} /> : null,
    form:
      words === null ? null : (
        <ProposeForm words={words} onWords={setWords} proposal={proposal} onClose={away} onDone={proposed} />
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
  proposal: Proposal
  onClose: () => void
  onDone: () => void
}) {
  const { words, proposal } = props
  const sending = proposal.busy
  const held = sending || proposal.unknown !== null
  const slow = useSlow(sending)
  const empty = words.trim().length === 0
  return (
    <form
      className="conv-propose-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (sending || empty) return
        void proposal.run(words.trim()).then((receipt) => {
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
        readOnly={held}
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
        {slow && <span role="status">{SLOW_NOTE}</span>}
        {!sending && proposal.unknown !== null && (
          <span role="alert">No reply yet. Press Propose again: it sends the same proposal, never a second.</span>
        )}
        {proposal.refused && <span role="alert">{proposal.refused}</span>}
      </div>
    </form>
  )
}
