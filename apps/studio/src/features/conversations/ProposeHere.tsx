// «Propose as decision» on a message (docs/plans/conversations-decide.md, C7): a short form under it, its words already
// in, sent as one of the project's constraints (A08). Shown to those who can write here; under the pointer or the focus
// on a wide screen, on the message pressed on a phone. Esc closes the form and gives the focus back to its press.
import { useRef, useState } from 'react'
import type { Identity } from '../../app/dev-identity.ts'
import { refusalWords, statementFrom, usePropose } from './decide.ts'

interface Props {
  projectId: string
  identity: Identity
  text: string
  sophia: boolean
}

export function ProposeHere({ projectId, identity, text, sophia }: Props) {
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState('')
  const [done, setDone] = useState(false)
  const press = useRef<HTMLButtonElement>(null)
  const propose = usePropose(projectId, identity)
  const close = () => {
    setOpen(false)
    propose.reset()
    requestAnimationFrame(() => press.current?.focus())
  }
  if (!open) {
    return (
      <span className="conv-propose">
        <button
          ref={press}
          type="button"
          className="text-button"
          onClick={() => {
            setWords(statementFrom(text, sophia))
            setDone(false)
            setOpen(true)
          }}
        >
          Propose as decision
        </button>
        {done && <span role="status"> Proposed · it’s in Still open</span>}
      </span>
    )
  }
  const sending = propose.state.status === 'sending'
  const empty = words.trim().length === 0
  return (
    <form
      className="conv-propose-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (sending || empty) return
        void propose.send(words.trim()).then((receipt) => {
          if (!receipt) return
          setDone(true)
          close()
        })
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        close()
      }}
    >
      <textarea
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the form opens for this one field, from its own press
        autoFocus
        aria-label="Decision to propose"
        value={words}
        maxLength={280}
        onChange={(e) => setWords(e.target.value)}
      />
      <div className="conv-propose-acts">
        <button type="submit" className="pill" aria-disabled={sending || empty || undefined}>
          {sending ? 'Proposing…' : 'Propose'}
        </button>
        <button type="button" className="text-button" onClick={close}>
          Cancel
        </button>
        {propose.state.status === 'unknown' && (
          <span role="alert">No reply yet. Press Propose again: it sends the same proposal, never a second.</span>
        )}
        {propose.state.status === 'rejected' && <span role="alert">{refusalWords(propose.state.error)}</span>}
      </div>
    </form>
  )
}
