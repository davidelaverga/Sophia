// Continuing a conversation (docs/plans/project-conversation-writes.md): a field, «Ask Sophia», and Send. Each message
// is one intent with one key: with no reply it says so, and Send sends that message again under its key (pressFor),
// never a second one. The field clears only if it still holds what was sent. Enter sends; Shift+Enter starts a line.
import { useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ApiError } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { sendConversationMessage, type MessageAsk, type MessageSent } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { firstWords, messagesKey } from './conversation-list.ts'

interface Props {
  conversationId: string
  identity: Identity
  draft: string
  onDraft: (text: string) => void
  /** A message recorded: Sophia was asked to answer it, or not. */
  onSent: (sent: MessageSent) => void
}

/** What a refused write says, in words a person can act on. */
export function writeFailure(err: ApiError): string {
  if (err.code === 'forbidden') return 'That isn’t yours to write here.'
  return 'That didn’t go through. Try again.'
}

/** The message's write: one key per message, the draft cleared only if it still holds what was sent. */
function useMessageWrite({ conversationId, identity, draft, onDraft, onSent }: Props, askSophia: boolean) {
  const queryClient = useQueryClient()
  const write = useAdmission<MessageAsk, MessageSent>(async (key, ask) => {
    const sent = await sendConversationMessage(identity.token, conversationId, key, ask)
    // The list moves too: its order, and who wrote there.
    void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId, identity.name) })
    void queryClient.invalidateQueries({ queryKey: ['vision', 'conversations'] })
    return sent
  })
  // The draft as it is now: read after the answer, never from the press's render.
  const latest = useRef(draft)
  useLayoutEffect(() => {
    latest.current = draft
  })
  const unknown = write.state.status === 'unknown' ? write.state.args : null
  const busy = write.state.status === 'sending'
  const ready = (unknown?.text ?? draft).trim() !== ''
  const go = async () => {
    if (busy || !ready) return
    const text = (unknown?.text ?? draft).trim()
    const sent = await write.send({ text, askSophia })
    if (!sent) return
    onSent(sent)
    if (latest.current.trim() === text) onDraft('')
  }
  const words = unknown
    ? `Not confirmed: “${firstWords(unknown.text)}”. Send sends it again; it won’t be written twice.`
    : write.state.status === 'rejected'
      ? writeFailure(write.state.error)
      : null
  return { busy, ready, go, words }
}

export function ConversationComposer(props: Props) {
  const { draft, onDraft } = props
  const [askSophia, setAskSophia] = useState(true)
  const { busy, ready, go, words } = useMessageWrite(props, askSophia)
  return (
    <form
      className="conv-compose"
      aria-label="Continue this conversation"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <textarea
        aria-label="Continue this question with the team"
        placeholder="Continue this question with the team"
        rows={2}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
          e.preventDefault()
          void go()
        }}
      />
      <div className="conv-compose-acts">
        <label className="conv-ask">
          <input type="checkbox" checked={askSophia} onChange={(e) => setAskSophia(e.target.checked)} />
          Ask Sophia
        </label>
        <button type="submit" className="pill" aria-disabled={!ready || busy || undefined}>
          Send
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
