// Starting a conversation (docs/plans/project-conversation-writes.md): its question, its first message, «Ask Sophia»,
// and Start, unavailable until both are written. One intent, one key: with no reply it says so, and Start sends it
// again under its key, never a second conversation. Cancel puts the form away.
import { useEffect, useRef, useState } from 'react'
import { useAdmission } from '../../api/useAdmission.ts'
import { startConversation, type ConversationAsk, type ConversationStarted } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { writeFailure } from './ConversationComposer.tsx'
import { firstWords } from './conversation-list.ts'

/** How long a conversation's question may be. */
export const QUESTION_MAX = 120

interface Props {
  projectId: string
  identity: Identity
  onStarted: (started: ConversationStarted) => void
  onCancel: () => void
}

/** The start's write: one key for the conversation, sent again under it after no reply. */
function useStartWrite(props: Pick<Props, 'projectId' | 'identity' | 'onStarted'>, asked: ConversationAsk) {
  const { projectId, identity, onStarted } = props
  const write = useAdmission<ConversationAsk, ConversationStarted>((key, ask) =>
    startConversation(identity.token, projectId, key, ask),
  )
  const unknown = write.state.status === 'unknown' ? write.state.args : null
  const busy = write.state.status === 'sending'
  const ready = unknown !== null || (asked.title !== '' && asked.text !== '')
  const go = async () => {
    if (busy || !ready) return
    const started = await write.send(asked)
    if (started) onStarted(started)
  }
  const words = unknown
    ? `Not confirmed: “${firstWords(unknown.title)}”. Start sends it again; it won’t be started twice.`
    : write.state.status === 'rejected'
      ? writeFailure(write.state.error)
      : null
  return { busy, held: unknown !== null, ready, go, words }
}

export function NewConversation(props: Props) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [askSophia, setAskSophia] = useState(true)
  const question = useRef<HTMLInputElement>(null)
  useEffect(() => question.current?.focus(), [])
  const { busy, held, ready, go, words } = useStartWrite(props, { title: title.trim(), text: text.trim(), askSophia })
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
      <label className="conv-field">
        <span className="field-label">Question</span>
        <input
          ref={question}
          maxLength={QUESTION_MAX}
          value={title}
          disabled={busy || held}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="conv-field">
        <span className="field-label">First message</span>
        <textarea rows={3} value={text} disabled={busy || held} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="conv-ask">
        <input type="checkbox" checked={askSophia} disabled={busy} onChange={(e) => setAskSophia(e.target.checked)} />
        Ask Sophia
      </label>
      <div className="conv-compose-acts">
        <button type="submit" className="pill" aria-disabled={!ready || busy || undefined}>
          Start
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
      {words && (
        <p className="conv-note" role="alert">
          {words}
        </p>
      )}
    </form>
  )
}
