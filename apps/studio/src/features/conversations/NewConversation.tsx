// Starting a conversation (docs/plans/project-conversation-writes.md): its question, its first message, «Ask Sophia»,
// and Start, unavailable until both are written. Its words and its intent are held by the view (held-write.ts): put
// away and opened again, the form finds them, and with no reply Start sends the same intent again under its key, never
// a second conversation. Cancel puts the form away.
import { useEffect, useRef, type RefObject } from 'react'
import { startConversation, type ConversationAsk, type ConversationStarted } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { writeFailure } from './ConversationComposer.tsx'
import { firstWords } from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'

/** How long a conversation's question may be. */
export const QUESTION_MAX = 120

interface Props {
  projectId: string
  identity: Identity
  /** The form's words, kept by the view while the form is away. */
  fields: ConversationAsk
  onFields: (next: ConversationAsk) => void
  held: Held<ConversationAsk> | null
  onHeld: (next: Held<ConversationAsk> | null) => void
  /** The refusal that answered the last Start, kept by the view. */
  refused: string | null
  onRefused: (words: string | null) => void
  onStarted: (started: ConversationStarted, ask: ConversationAsk) => void
  onCancel: () => void
}

/** The start's write: the held intent again, or the form's words as a new one. */
function useStartWrite(props: Props) {
  const { projectId, identity, fields } = props
  const write = useHeldWrite<ConversationAsk, ConversationStarted>(
    props.held,
    props.onHeld,
    (key, ask) => startConversation(identity.token, projectId, key, ask),
    { words: props.refused, onWords: props.onRefused, say: writeFailure },
  )
  const asked = { title: fields.title.trim(), text: fields.text.trim(), askSophia: fields.askSophia }
  const ready = write.unknown !== null || (asked.title !== '' && asked.text !== '')
  const go = async () => {
    if (write.busy || !ready) return
    const ask = write.unknown ?? asked
    const started = await write.run(asked)
    if (started) props.onStarted(started, ask)
  }
  const words = write.unknown
    ? `Not confirmed: “${firstWords(write.unknown.title)}”. Start sends it again; it won’t be started twice.`
    : write.refused
  // With no reply, the words are the held intent's: shown as sent, and not to be changed.
  const shown = write.unknown ?? fields
  return { busy: write.busy, fixed: write.busy || write.unknown !== null, shown, ready, go, words }
}

export function NewConversation(props: Props) {
  const { fields, onFields } = props
  const question = useRef<HTMLInputElement>(null)
  useEffect(() => question.current?.focus(), [])
  const { busy, fixed, shown, ready, go, words } = useStartWrite(props)
  // On its way past a few seconds, the Studio's slow note.
  const slow = useSlow(busy)
  const said = words ?? (slow ? SLOW_NOTE : null)
  return (
    <form
      className="conv-new"
      aria-label="New conversation"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <h3>New conversation</h3>
      <Fields
        question={question}
        shown={shown}
        fixed={fixed}
        onChange={(change) => onFields({ ...fields, ...change })}
      />
      <div className="conv-compose-acts">
        <button type="submit" className="pill" aria-disabled={!ready || busy || undefined}>
          {busy ? 'Starting…' : 'Start'}
        </button>
        <button
          type="button"
          className="text-button"
          aria-disabled={busy || undefined}
          onClick={() => !busy && props.onCancel()}
        >
          Cancel
        </button>
      </div>
      {said && (
        <p className="conv-note" role="alert">
          {said}
        </p>
      )}
    </form>
  )
}

/** The question, the first message and «Ask Sophia»: as sent, and not to be changed, while they are held. */
function Fields(props: {
  question: RefObject<HTMLInputElement | null>
  shown: ConversationAsk
  fixed: boolean
  onChange: (change: Partial<ConversationAsk>) => void
}) {
  const { question, shown, fixed, onChange } = props
  return (
    <>
      <label className="conv-field">
        <span className="field-label">Question</span>
        <input
          ref={question}
          maxLength={QUESTION_MAX}
          value={shown.title}
          readOnly={fixed}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <label className="conv-field">
        <span className="field-label">First message</span>
        <textarea rows={3} value={shown.text} readOnly={fixed} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label className="conv-ask">
        <input
          type="checkbox"
          checked={shown.askSophia}
          disabled={fixed}
          onChange={(e) => onChange({ askSophia: e.target.checked })}
        />
        <span className="conv-ask-box" aria-hidden />
        <Mark />
        Ask Sophia
      </label>
    </>
  )
}
