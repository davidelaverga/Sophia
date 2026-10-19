// Continuing a conversation (docs/plans/project-conversation-writes.md): a field, «Ask Sophia», and Send. Each message
// is one intent with one key, held by the view (talk-store.ts), as is a refusal that answers it: with no reply it says
// so, and Send sends that message again under its key, never a second one, even after the person went elsewhere and
// came back. Offline, nothing goes, and the line says so before any press (docs/plans/offline-work-side.md). A message
// the API accepted goes into the page at once. The field clears only if it still holds what was sent. Enter sends;
// Shift+Enter starts a line. On its way, Send says so. «Ask Sophia» is a checkbox shown as a chip with her mark
// (docs/plans/conversation-thread.md). While the field is empty, quick asks ask her in one press, their words the
// message (docs/plans/conversations-find.md). Once she has answered, the empty field proposes the next ask as its
// placeholder, with a key cap «Tab»: Tab puts it in the field with «Ask Sophia» on, Esc puts it away, and the quick
// asks drop what was just asked (docs/plans/next-ask.md).
import { useQueryClient } from '@tanstack/react-query'
import { type KeyboardEvent, type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react'
import { isQuestion, NextAskHint, nextAskKey, questionKey } from '@sophia/ui'
import type { ApiError } from '../../api/client.ts'
import { sendConversationMessage, type MessageAsk, type MessageSent } from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Mark } from '../../app/Mark.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { offlineWords, useOnline } from '../personal/online.ts'
import {
  firstWords,
  lastSaid,
  LISTS,
  messagesKey,
  withLastMessage,
  withMessage,
  type ReadPages,
} from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'
import { setListsData } from './list-data.ts'
import type { Suggestion } from './next-ask.ts'
import { useNextAsk, type NextAskSource } from './useNextAsk.ts'

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
  /** The saved-text notice, said above the field before the reader's first message in the project. */
  notice: string | null
  /** Clears the draft if it still holds these words, as the view holds it now (not as this field last saw it). */
  onClearIf: (text: string) => void
  held: Held<MessageAsk> | null
  onHeld: (next: Held<MessageAsk> | null) => void
  /** The conversation erased since, as the view knows it now: a receipt that comes late keeps nothing of it. */
  gone: () => boolean
  /** The refusal that answered the last press here, kept by the view. */
  refused: string | null
  onRefused: (words: string | null) => void
  /** A message recorded: Sophia was asked to answer it, or not. */
  onSent: (sent: MessageSent) => void
  /** What the next ask is read from: the thread, the conversation's open questions, the project's brief. */
  next: NextAskSource
}

/** The field's name, and its placeholder when nothing is suggested. */
const FIELD = 'Continue this question with the team'

/** What a hint's key cap says: why (its tip) and what Tab does (its description). */
interface KeyHint {
  why: string
  description: string
}

/** The field's keys: the suggestion's (accept, put away) at the empty field, Tab at a question asks Sophia too, then
 * Enter sends, Shift+Enter a line. */
function useFieldKeys(
  draft: string,
  state: { shown: Suggestion | null; asked: boolean },
  on: { accept: () => void; putAway: () => void; ask: () => void; send: () => void },
) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const { key, shiftKey, altKey, ctrlKey, metaKey } = e
    const press = { key, shiftKey, altKey, ctrlKey, metaKey, isComposing: e.nativeEvent.isComposing }
    const move = nextAskKey(press, draft, state.shown !== null) ?? questionKey(press, draft, state.asked)
    if (move) {
      e.preventDefault()
      if (move === 'accept') on.accept()
      else if (move === 'ask') on.ask()
      else on.putAway()
      return
    }
    if (key !== 'Enter' || shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    on.send()
  }
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
  // Offline (navigator.onLine false; a true proves nothing), nothing goes, not even a message held with no reply: the
  // line says so before any press. Back online, Send goes as before (costuras seam #8).
  const online = useOnline()
  const ready = online && props.canSend && (write.unknown?.text ?? draft).trim() !== ''
  /** The draft, or a quick ask's words (Sophia asked, the draft left as it is). */
  const send = async (text: string, asking: boolean, fromDraft: boolean) => {
    // Undefined too for an account forgotten meanwhile: its receipt never comes back into the cache.
    const sent = await write.run({ text, askSophia: asking })
    if (!sent) return false
    // The conversation erased while this was on its way: its receipt (its words) goes into no page and no list.
    if (props.gone()) return false
    // The receipt's message shows at once, and stays should reading the conversation again fail; then the list moves
    // too (its order, who wrote there).
    const pages = messagesKey(conversationId, accountOf(identity))
    const now = queryClient.setQueryData<ReadPages<MessageSent['message']>>(pages, (read) =>
      withMessage(read, sent.message),
    )
    void queryClient.invalidateQueries({ queryKey: pages })
    // Its row says it at once, before the list is read again (or should that read fail), but only while the thread
    // holds it as its newest message with words: withdrawn meanwhile, a later one said since, or the thread not held
    // here, the row says nothing from this receipt (Codex, CX-0022), and the list's own read says what is so.
    const last = lastSaid(now)
    if (last?.id === sent.message.id) {
      // Its data only: a list whose reads are failing still says so (PR #199 r4237298620).
      setListsData(queryClient, LISTS, (read) => ({
        ...read,
        conversations: withLastMessage(read.conversations, conversationId, last, now),
      }))
    }
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
    online && !write.busy && props.canSend && !write.unknown ? await send(words, true, false) : null
  const offline = !online && props.canSend
  const line = lineOf(write, offline, draft)
  return { busy: write.busy, ready, go, quick, ...line, held: write.unknown, offline }
}

/**
 * What the field's line says, and whether politely: offline, what waits (offlineWords), in place of what the last press
 * met; else that press's end.
 */
function lineOf(
  write: { busy: boolean; unknown: MessageAsk | null; refused: string | null },
  offline: boolean,
  draft: string,
): { words: string | null; polite: boolean } {
  const held = write.unknown ? firstWords(write.unknown.text) : null
  const waits = offline ? offlineWords({ going: write.busy, held, written: draft.trim() !== '' }) : null
  if (waits) return { words: waits, polite: true }
  if (held !== null) {
    return { words: `Not confirmed: “${held}”. Send sends it again; it won’t be written twice.`, polite: false }
  }
  return { words: write.refused, polite: false }
}

/** Under the field: who the message goes to (Sophia only where she answers here), and how Enter sends. */
function Hint({ asks, answers }: { asks: boolean; answers: boolean }) {
  const to = asks ? (answers ? 'Sophia will answer' : 'Sophia doesn’t answer here yet') : 'To the team only'
  return (
    <p className="conv-compose-hint">
      <span data-asked={asks || undefined}>{to}</span>
      <span>Enter sends · Shift+Enter, a new line</span>
    </p>
  )
}

/**
 * The field's suggestion (docs/plans/next-ask.md): none while a message is held, a refusal stands or the conversation is
 * not read; shown only at an empty field; Tab puts it in with «Ask Sophia» on.
 */
function useComposerNext(props: Props, held: boolean, go: () => Promise<void>) {
  const next = useNextAsk(
    props.next,
    props.conversationId,
    props.identity,
    held || props.refused !== null || !props.canSend,
  )
  const shown = props.draft === '' ? next.suggestion : null
  // A question written while Sophia is not asked (and nothing held): Tab asks her too (docs/plans/question-asks.md).
  const asked = held || props.askSophia
  const onKey = useFieldKeys(
    props.draft,
    { shown, asked },
    {
      accept: () => {
        if (!shown) return
        props.onDraft(shown.words)
        props.onAskSophia(true)
      },
      putAway: next.putAway,
      ask: () => props.onAskSophia(true),
      send: () => void go(),
    },
  )
  return { id: next.id, shown, hint: hintOf(shown, !asked && isQuestion(props.draft)), quick: next.quick, onKey }
}

/** The key cap's words: the suggestion's at the empty field, or a question's while Sophia is not asked; else none. */
function hintOf(shown: Suggestion | null, question: boolean): KeyHint | null {
  if (shown)
    return {
      why: shown.why,
      // Why, too, for the keyboard and a screen reader (Codex on #262); a suggestion ending in «?» takes no full stop.
      description: `Suggested: ${/[?.!]$/u.test(shown.words) ? shown.words : `${shown.words}.`} ${shown.why}. Tab puts it in the field; Escape puts it away.`,
    }
  if (question)
    return { why: 'A question: Tab asks Sophia too', description: 'A question: Tab asks Sophia to answer it too.' }
  return null
}

/** The field and its presses: the suggestion's key cap beside the words, «Ask Sophia», Send. */
function FieldBox(props: {
  draft: string
  onDraft: (text: string) => void
  grows: RefObject<HTMLTextAreaElement | null>
  next: ReturnType<typeof useComposerNext>
  children: ReactNode
}) {
  const { shown, hint, id } = props.next
  return (
    <div className="conv-field-box">
      <textarea
        aria-label={FIELD}
        placeholder={shown?.words ?? FIELD}
        aria-describedby={hint ? id : undefined}
        ref={props.grows}
        rows={1}
        value={props.draft}
        onChange={(e) => props.onDraft(e.target.value)}
        onKeyDown={props.next.onKey}
      />
      {hint && <NextAskHint id={id} description={hint.description} why={hint.why} />}
      {props.children}
    </div>
  )
}

export function ConversationComposer(props: Props) {
  const { draft, onDraft } = props
  const { busy, ready, go, quick, words, polite, held, offline } = useMessageWrite(props, props.askSophia)
  // With no reply, the box says what the held message asked, and stays so until it is answered.
  const asks = held?.askSophia ?? props.askSophia
  // A message on its way (sending, or held with no reply) quiets the field's suggestions (Codex on #265).
  // Nor where she doesn't answer here: the suggestions are asks of her.
  const next = useComposerNext(props, props.held !== null || busy || !props.answers, go)
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
      {props.notice && <p className="conv-note conv-notice">{props.notice}</p>}
      <FieldBox draft={draft} onDraft={onDraft} grows={grows} next={next}>
        <AskSophia on={asks} held={held !== null} onChange={props.onAskSophia} />
        <SendButton ready={ready} busy={busy} />
      </FieldBox>
      {props.canSend && props.answers && (
        <QuickAsks
          asks={next.quick}
          // Offline, too: a quick ask could only wait, as words in the field do.
          away={draft.trim() !== '' || held !== null || offline}
          busy={busy}
          onAsk={(w) => void ask(w)}
        />
      )}
      <Hint asks={asks} answers={props.answers} />
      <Note words={words} slow={slow} polite={polite} />
    </form>
  )
}

/**
 * Under the field: what the last press met, or that the wait goes on, said at once; offline, what waits, said politely
 * from a line there before it speaks (a live region added with its words is often not read), out of sight while empty.
 */
function Note({ words, slow, polite }: { words: string | null; slow: boolean; polite: boolean }) {
  const said = words ?? (slow ? SLOW_NOTE : null)
  return (
    <>
      {said && !polite && (
        <p className="conv-note" role="alert">
          {said}
        </p>
      )}
      <p className={polite ? 'conv-note' : 'sr-only'} role="status">
        {polite ? said : null}
      </p>
    </>
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

/**
 * The quick asks, under the empty field: each sends its words with Sophia asked; those asked lately and the one the
 * field suggests are left out (next-ask.ts). Away (words written, a message waiting), the row keeps its height unseen,
 * and emptied it keeps it too, so the thread above never jumps.
 */
function QuickAsks(props: { asks: readonly string[]; away: boolean; busy: boolean; onAsk: (words: string) => void }) {
  return (
    <div className="conv-quick" role="group" aria-label="Ask Sophia in one press" data-away={props.away || undefined}>
      {props.asks.map((words) => (
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
