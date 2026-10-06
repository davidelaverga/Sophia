// Continuing a conversation (docs/plans/project-conversation-writes.md): a field, «Ask Sophia», and Send. Each message
// is one intent with one key, held by the view (talk-store.ts), as is a refusal that answers it: with no reply it says
// so, and Send sends that message again under its key, never a second one, even after the person went elsewhere and
// came back. A message the API accepted goes into the page at once. The field clears only if it still holds what was
// sent. Enter sends; Shift+Enter starts a line. On its way, Send says so.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ApiError } from '../../api/client.ts'
import { sendConversationMessage, type MessageAsk, type MessageSent } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { firstWords, messagesKey, withMessage, type ReadPages } from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'

interface Props {
  conversationId: string
  identity: Identity
  draft: string
  onDraft: (text: string) => void
  /** Clears the draft if it still holds these words, as the view holds it now (not as this field last saw it). */
  onClearIf: (text: string) => void
  held: Held<MessageAsk> | null
  onHeld: (next: Held<MessageAsk> | null) => void
  /** The refusal that answered the last press here, kept by the view. */
  refused: string | null
  onRefused: (words: string | null) => void
  /** A message recorded: Sophia was asked to answer it, or not. */
  onSent: (sent: MessageSent) => void
}

/** What a refused write says, in words a person can act on. */
export function writeFailure(err: ApiError): string {
  if (err.code === 'forbidden') return 'That isn’t yours to write here.'
  return 'That didn’t go through. Try again.'
}

/** The message's write: the held intent again, or the draft as a new one; the draft cleared only if unchanged. */
function useMessageWrite(props: Props, askSophia: boolean) {
  const { conversationId, identity, draft, onClearIf, onSent } = props
  const queryClient = useQueryClient()
  const refusal = { words: props.refused, onWords: props.onRefused, say: writeFailure }
  const write = useHeldWrite<MessageAsk, MessageSent>(
    props.held,
    props.onHeld,
    async (key, ask) => {
      const sent = await sendConversationMessage(identity.token, conversationId, key, ask)
      // The receipt's message shows at once, and stays should reading the conversation again fail; then the list
      // moves too (its order, who wrote there).
      const pages = messagesKey(conversationId, identity.name)
      queryClient.setQueryData<ReadPages<MessageSent['message']>>(pages, (read) => withMessage(read, sent.message))
      void queryClient.invalidateQueries({ queryKey: pages })
      void queryClient.invalidateQueries({ queryKey: ['vision', 'conversations'] })
      return sent
    },
    refusal,
  )
  const ready = (write.unknown?.text ?? draft).trim() !== ''
  const go = async () => {
    if (write.busy || !ready) return
    const sent = await write.run({ text: draft.trim(), askSophia })
    if (!sent) return
    onSent(sent)
    // Asked of the view: this field may be gone by now, and the words written since are the view's.
    onClearIf(sent.message.text)
  }
  const words = write.unknown
    ? `Not confirmed: “${firstWords(write.unknown.text)}”. Send sends it again; it won’t be written twice.`
    : write.refused
  return { busy: write.busy, ready, go, words }
}

export function ConversationComposer(props: Props) {
  const { draft, onDraft } = props
  const [askSophia, setAskSophia] = useState(true)
  const { busy, ready, go, words } = useMessageWrite(props, askSophia)
  const slow = useSlow(busy)
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
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {(words ?? slow) && (
        <p className="conv-note" role="alert">
          {words ?? SLOW_NOTE}
        </p>
      )}
    </form>
  )
}
