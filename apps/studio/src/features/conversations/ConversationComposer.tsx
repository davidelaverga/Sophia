// Continuing a conversation (docs/plans/project-conversation-writes.md): a field, «Ask Sophia», and Send. Each message
// is one intent with one key, held by the view (talk-store.ts), as is a refusal that answers it: with no reply it says
// so, and Send sends that message again under its key, never a second one, even after the person went elsewhere and
// came back. A message the API accepted goes into the page at once. The field clears only if it still holds what was
// sent. Enter sends; Shift+Enter starts a line. On its way, Send says so. «Ask Sophia» is a checkbox shown as a chip
// with her mark (docs/plans/conversation-thread.md). While the field is empty, quick asks ask her in one press, their
// words the message (docs/plans/conversations-find.md).
import { useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef } from 'react'
import type { ApiError } from '../../api/client.ts'
import {
  sendConversationMessage,
  type ConversationSummary,
  type MessageAsk,
  type MessageSent,
} from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { firstWords, LISTS, messagesKey, withLastMessage, withMessage, type ReadPages } from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'

interface Props {
  conversationId: string
  identity: Identity
  draft: string
  onDraft: (text: string) => void
  /** Whether this message asks Sophia, kept with the draft (talk-store.ts). */
  askSophia: boolean
  onAskSophia: (on: boolean) => void
  /** The conversation has been read: until then, nothing is sent into it (its receipt would have no page to join). */
  canSend: boolean
  /**
   * Sophia answers here now (the list's `capability.ask`). Where she doesn't, asking her still records the request,
   * which says why it went unanswered; the field says so before, and offers no quick ask that could only end so.
   */
  answers: boolean
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
    (key, ask) => sendConversationMessage(identity.token, conversationId, key, ask),
    refusal,
  )
  const ready = props.canSend && (write.unknown?.text ?? draft).trim() !== ''
  /** The draft, or a quick ask's words (Sophia asked, the draft left as it is). */
  const send = async (text: string, asking: boolean, fromDraft: boolean) => {
    // Undefined too for an account forgotten meanwhile: its receipt never comes back into the cache.
    const sent = await write.run({ text, askSophia: asking })
    if (!sent) return false
    // The receipt's message shows at once, and stays should reading the conversation again fail; then the list moves
    // too (its order, who wrote there).
    const pages = messagesKey(conversationId, accountOf(identity))
    queryClient.setQueryData<ReadPages<MessageSent['message']>>(pages, (read) => withMessage(read, sent.message))
    void queryClient.invalidateQueries({ queryKey: pages })
    // Its row says it at once, before the list is read again (or should that read fail).
    queryClient.setQueriesData<{ conversations: readonly ConversationSummary[] }>(
      { queryKey: LISTS },
      (read) => read && { ...read, conversations: withLastMessage(read.conversations, conversationId, sent.message) },
    )
    void queryClient.invalidateQueries({ queryKey: LISTS })
    onSent(sent)
    // Asked of the view: this field may be gone by now, and the words written since are the view's.
    if (fromDraft) onClearIf(sent.message.text ?? text)
    return true
  }
  const go = async () => {
    if (!write.busy && ready) await send(draft.trim(), askSophia, true)
  }
  /** A quick ask: whether it is in, or went unanswered or refused (null when it wasn't sent at all). */
  const quick = async (words: string) =>
    !write.busy && props.canSend && !write.unknown ? await send(words, true, false) : null
  const words = write.unknown
    ? `Not confirmed: “${firstWords(write.unknown.text)}”. Send sends it again; it won’t be written twice.`
    : write.refused
  return { busy: write.busy, ready, go, quick, words, held: write.unknown }
}

export function ConversationComposer(props: Props) {
  const { draft, onDraft } = props
  const { busy, ready, go, quick, words, held } = useMessageWrite(props, props.askSophia)
  // With no reply, the box says what the held message asked, and stays so until it is answered.
  const asks = held?.askSophia ?? props.askSophia
  const slow = useSlow(busy)
  const form = useRef<HTMLFormElement>(null)
  const grows = useGrowing(draft)
  const ask = async (said: string) => {
    if ((await quick(said)) !== false) return
    // Unanswered, the row steps aside with the press in it: Send, which sends it again, takes the focus. Only then, and
    // only from the row: a refusal leaves the row where it was, and a focus moved meanwhile (the field) stays.
    requestAnimationFrame(() => {
      const row = form.current?.querySelector('.conv-quick[data-away]')
      const at = document.activeElement
      if (row && (at === document.body || (at && row.contains(at))))
        form.current?.querySelector<HTMLElement>('.conv-send')?.focus()
    })
  }
  return (
    <form
      ref={form}
      className="conv-compose"
      aria-label="Continue this conversation"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <div className="conv-field-box">
        <textarea
          aria-label="Continue this question with the team"
          placeholder="Continue this question with the team"
          ref={grows}
          rows={1}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            void go()
          }}
        />
        <AskSophia on={asks} held={held !== null} onChange={props.onAskSophia} />
        <SendButton ready={ready} busy={busy} />
      </div>
      {props.canSend && props.answers && (
        <QuickAsks away={draft.trim() !== '' || held !== null} busy={busy} onAsk={(w) => void ask(w)} />
      )}
      <p className="conv-compose-hint">
        <span data-asked={asks || undefined}>
          {asks ? (props.answers ? 'Sophia will answer' : 'Sophia doesn’t answer here yet') : 'To the team only'}
        </span>
        <span>Enter sends · Shift+Enter, a new line</span>
      </p>
      {(words ?? slow) && (
        <p className="conv-note" role="alert">
          {words ?? SLOW_NOTE}
        </p>
      )}
    </form>
  )
}

/** Grows a field with its words where the browser has no `field-sizing: content` (up to its CSS max-height). */
function useGrowing(words: string) {
  const field = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = field.current
    if (!el || CSS.supports('field-sizing', 'content')) return
    el.style.height = 'auto'
    el.style.height = `${String(el.scrollHeight)}px`
  }, [words])
  return field
}

/** What everyone asks: Sophia, in one press. */
const QUICK_ASKS = ['Sum it up', 'What’s still open?', 'What did we decide?']

/**
 * The quick asks, under the empty field: each sends its words with Sophia asked. Away (words written, a message
 * waiting), the row keeps its height unseen, so the thread above never jumps.
 */
function QuickAsks(props: { away: boolean; busy: boolean; onAsk: (words: string) => void }) {
  return (
    <div className="conv-quick" role="group" aria-label="Ask Sophia in one press" data-away={props.away || undefined}>
      {QUICK_ASKS.map((words) => (
        <button key={words} type="button" aria-disabled={props.busy || undefined} onClick={() => props.onAsk(words)}>
          {words}
        </button>
      ))}
    </div>
  )
}

/** «Ask Sophia» in the field: her mark, lit when on; a checkbox under it, named so; still while a message waits. */
function AskSophia(props: { on: boolean; held: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="conv-ask" title="Ask Sophia">
      <input
        type="checkbox"
        checked={props.on}
        disabled={props.held}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="conv-ask-box" aria-hidden />
      <Mark />
      <span className="sr-only">Ask Sophia</span>
    </label>
  )
}

/** Send: an arrow, lit once there is something to send; its name says when it is on its way. */
function SendButton({ ready, busy }: { ready: boolean; busy: boolean }) {
  return (
    <button
      type="submit"
      className="conv-send"
      data-ready={(ready && !busy) || undefined}
      data-busy={busy || undefined}
      aria-disabled={!ready || busy || undefined}
    >
      {busy ? (
        <svg className="conv-send-arc" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path
            d="M7 1.5a5.5 5.5 0 1 1-5.5 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path
            d="M7 12V2M2.5 6.5L7 2l4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className="sr-only">{busy ? 'Sending…' : 'Send'}</span>
    </button>
  )
}
