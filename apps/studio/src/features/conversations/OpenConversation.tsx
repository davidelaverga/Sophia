// The open conversation (docs/plans/project-conversations.md): its title, who wrote there, Sophia's summary of it, its
// messages oldest first (a page at a time: Earlier messages reads the one before), and the report it made, which opens
// in the document viewer. How its context works is one disclosure away. Members continue it below its messages
// (docs/plans/project-conversation-writes.md); Sophia's answer is read as the feed moves.
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import {
  getConversationMessages,
  type ConversationMessage,
  type ConversationSummary,
  type MessageAsk,
} from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { answeredAfter, contributorsLine, messageBy, messagesKey, messageWhen } from './conversation-list.ts'
import { ConversationComposer } from './ConversationComposer.tsx'
import type { Held } from './held-write.ts'
import type { Asked } from './talk-store.ts'
import { useReadAgain } from './useReadAgain.ts'

interface Props {
  conversation: ConversationSummary
  identity: Identity
  me: string
  /** The project's feed position: the messages are read again as it moves (Sophia's answer, others' messages). */
  cursor: string | undefined
  /** Members write here; viewers read; undefined until the membership is read (neither, meanwhile). */
  writer: boolean | undefined
  draft: string
  onDraft: (text: string) => void
  onClearIf: (text: string) => void
  /** The message on its way here, or sent with no reply (held by the view). */
  held: Held<MessageAsk> | null
  onHeld: (next: Held<MessageAsk> | null) => void
  /** The refusal that answered the last press here (kept by the view). */
  refused: string | null
  onRefused: (words: string | null) => void
  /** When Sophia was asked here (kept by the view): a message that doesn't ask her leaves it. */
  asked: Asked | null
  onAsked: (at: string) => void
  /** Just started here: the focus goes to its title, once. */
  arrived: boolean
  onArrived: () => void
}

/** How long «Sophia is answering…» waits before it says her answer will come later. */
export const ANSWER_WAIT_MS = 120_000

/**
 * When Sophia was asked here; late once she hasn't answered in time, counted on this page's clock from when it asked
 * (not from coming back, and never against the server's clock).
 */
function useAwaiting(asked: Asked | null) {
  const [late, setLate] = useState(false)
  const here = asked?.here ?? null
  useEffect(() => {
    setLate(false)
    if (here === null) return undefined
    const timer = setTimeout(() => setLate(true), Math.max(0, ANSWER_WAIT_MS - (Date.now() - here)))
    return () => clearTimeout(timer)
  }, [here])
  return { since: asked?.at ?? null, late }
}

export function OpenConversation(props: Props) {
  const { conversation: c, identity, me, arrived, onArrived } = props
  const summaryId = useId()
  const awaiting = useAwaiting(props.asked)
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!arrived) return
    head.current?.focus()
    onArrived()
  }, [arrived, onArrived])
  return (
    <section className="conv-open" aria-label="Open conversation">
      <h3 ref={head} tabIndex={-1}>
        {c.title}
      </h3>
      <p className="conv-who">{`Contributors: ${contributorsLine(c, me)}`}</p>
      <section className="conv-summary" aria-labelledby={summaryId}>
        <h4 id={summaryId} className="eyebrow">
          Summary
        </h4>
        <p>{c.summary ?? 'No summary yet.'}</p>
      </section>
      <Messages conversationId={c.id} identity={identity} me={me} cursor={props.cursor} awaiting={awaiting} />
      {props.writer === true && (
        <ConversationComposer
          conversationId={c.id}
          identity={identity}
          draft={props.draft}
          onDraft={props.onDraft}
          onClearIf={props.onClearIf}
          held={props.held}
          onHeld={props.onHeld}
          refused={props.refused}
          onRefused={props.onRefused}
          onSent={(sent) => sent.sophia === 'asked' && props.onAsked(sent.message.at)}
        />
      )}
      {props.writer === false && <p className="conv-note">Viewers read conversations; members write in them.</p>}
      <Output output={c.output} />
      <details className="conv-help">
        <summary>How conversation context works</summary>
        <p>
          A conversation keeps its own messages and summary. Sophia’s next answer here can also read the project’s
          current mission, decisions and eligible sources. Other conversations are read only when asked, never merged.
        </p>
      </details>
    </section>
  )
}

/** What the conversation made: the report, which opens in the document viewer (none without one to open it in). */
function Output({ output }: { output: ConversationSummary['output'] }) {
  const viewer = useDocumentViewer()
  if (!output || !viewer) return null
  return (
    <button
      type="button"
      className="conv-output"
      onClick={() => viewer.open({ artifactId: output.artifactId, versionId: output.versionId })}
    >
      <span className="eyebrow">What it made</span>
      <span>{`${output.title} · v${String(output.versionNumber)}`}</span>
    </button>
  )
}

/** The conversation's messages, oldest first, a page at a time: Earlier messages reads the one before. */
function Messages(props: {
  conversationId: string
  identity: Identity
  me: string
  cursor: string | undefined
  awaiting: { since: string | null; late: boolean }
}) {
  const { conversationId, identity, me } = props
  const read = useInfiniteQuery({
    queryKey: messagesKey(conversationId, identity.name),
    queryFn: ({ pageParam, signal }) => getConversationMessages(identity.token, conversationId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.before,
    retry: 1,
  })
  useReadAgain(props.cursor, read.refetch)
  // Each page is oldest first, and each one read is earlier than the last: the earliest page goes on top.
  const messages = read.data?.pages.toReversed().flatMap((p) => p.messages) ?? []
  const first = useRef<HTMLLIElement>(null)
  const asked = useRef(false)
  // Earlier messages goes with the last page: the focus goes to the first message, never to the page.
  useEffect(() => {
    if (!asked.current || read.isFetchingNextPage) return
    asked.current = false
    if (!read.hasNextPage) first.current?.focus()
  }, [read.isFetchingNextPage, read.hasNextPage])
  return (
    <>
      <ReadState read={read} count={messages.length} />
      {read.hasNextPage && (
        <Earlier
          reading={read.isFetchingNextPage}
          failed={read.isFetchNextPageError}
          onRead={() => {
            asked.current = true
            void read.fetchNextPage()
          }}
        />
      )}
      {messages.length > 0 && <MessageList messages={messages} me={me} first={first} />}
      {props.awaiting.since !== null && !answeredAfter(messages, props.awaiting.since) && (
        <p className="conv-note" role="status">
          {props.awaiting.late
            ? 'Sophia hasn’t answered yet. Her answer will show here when it comes.'
            : 'Sophia is answering…'}
        </p>
      )}
    </>
  )
}

/** Earlier messages: reads the page before, once at a time; says so when it can't. */
function Earlier({ reading, failed, onRead }: { reading: boolean; failed: boolean; onRead: () => void }) {
  return (
    <p className="conv-earlier">
      <button
        type="button"
        className="text-button"
        aria-disabled={reading || undefined}
        onClick={() => !reading && onRead()}
      >
        {reading ? 'Reading earlier messages…' : 'Earlier messages'}
      </button>
      {failed && <span role="alert"> They can’t be read now.</span>}
    </p>
  )
}

/** The messages, oldest first, each with who wrote it and when; the first takes the focus when it is given. */
function MessageList(props: {
  messages: readonly ConversationMessage[]
  me: string
  first: RefObject<HTMLLIElement | null>
}) {
  const { messages, me, first } = props
  return (
    <ol className="conv-messages">
      {messages.map((m, i) => (
        <li
          key={m.id}
          ref={i === 0 ? first : undefined}
          tabIndex={i === 0 ? -1 : undefined}
          className={m.author === 'sophia' ? 'conv-msg sophia' : 'conv-msg'}
        >
          <span className="conv-msg-by">
            {messageBy(m, me)} · <time dateTime={m.at}>{messageWhen(m.at)}</time>
          </span>
          <p>{m.text}</p>
        </li>
      ))}
    </ol>
  )
}

/** What the transcript's read says: reading, nobody written yet, or failed (out of date when some were read). */
function ReadState(props: {
  read: { isPending: boolean; isSuccess: boolean; isError: boolean; refetch: () => Promise<unknown> }
  count: number
}) {
  const { read, count } = props
  return (
    <>
      <Waiting words="Reading the conversation…" waiting={read.isPending} />
      {read.isSuccess && count === 0 && <p className="conv-note">Nobody has written here yet.</p>}
      {read.isError && (
        <p className="conv-note" role="alert">
          {count > 0 ? 'This may be out of date.' : 'This conversation can’t be read now.'}{' '}
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        </p>
      )}
    </>
  )
}
