// The open conversation (docs/plans/project-conversations.md), the middle pane (docs/plans/conversations-panes.md): its
// head (who wrote there, its title, the way back on a phone, «Context» where the context is a panel), the report it
// made as a strip, which opens in the document viewer, its messages oldest first in their own scroll (a page at a time:
// Earlier messages reads the one before), and the field at the pane's foot. Sophia's summary is in the context pane.
// Members continue it (docs/plans/project-conversation-writes.md); Sophia's answer is read as the feed moves. Each
// message has a face, a person's initial or Sophia's mark; messages by one author within minutes read as one run, its
// byline said once in sight and every time to a screen reader (docs/plans/conversation-thread.md). The thread follows
// what is written: a message sent comes into sight, and one read at its end stays at its end.
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  getConversationMessages,
  type ConversationMessage,
  type ConversationSummary,
  type MessageAsk,
} from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { Mark } from '../../app/Mark.tsx'
import {
  answeredAfter,
  continuesRun,
  contributorsLine,
  initialOf,
  messageBy,
  messagesKey,
} from './conversation-list.ts'
import { ConversationComposer } from './ConversationComposer.tsx'
import type { Held } from './held-write.ts'
import type { Asked } from './talk-store.ts'
import { useReadAgain } from './useReadAgain.ts'
import { blocksOf } from './sophia-text.ts'
import { clock, dayOf, sameDay, when } from '../../app/time-words.ts'

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
  askSophia: boolean
  onAskSophia: (on: boolean) => void
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
  /** Her answer to the ask made at `at` was seen: that wait is over (kept by the view). */
  onAnswered: (at: string) => void
  /** Just started here: the focus goes to its title, once. */
  arrived: boolean
  onArrived: () => void
  /** Back to the list (a phone shows one at a time). */
  onBack: () => void
  /** The context as a panel (under 1180 px): whether it is open, its press, and that press's element for the focus. */
  context: { open: boolean; toggle: () => void; ref: RefObject<HTMLButtonElement | null> }
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
  const awaiting = useAwaiting(props.asked)
  const read = useTranscript(c.id, identity, props.cursor)
  const head = useRef<HTMLHeadingElement>(null)
  const follow = useFollow()
  useEffect(() => {
    if (!arrived) return
    head.current?.focus()
    onArrived()
  }, [arrived, onArrived])
  return (
    <section className="conv-open" aria-label="Open conversation">
      <Head conversation={c} me={me} head={head} onBack={props.onBack} context={props.context} />
      {/* A scrolled region the keyboard reaches (arrows scroll it); from the keyboard, every time shows there. */}
      <div
        ref={follow.scroll}
        className="conv-scroll"
        role="region"
        aria-label="Messages"
        tabIndex={0}
        onScroll={follow.onScroll}
      >
        <Messages read={read} me={me} awaiting={awaiting} onAnswered={props.onAnswered} onGrown={follow.grown} />
      </div>
      {props.writer === true && (
        <ConversationComposer
          conversationId={c.id}
          identity={identity}
          draft={props.draft}
          onDraft={props.onDraft}
          askSophia={props.askSophia}
          onAskSophia={props.onAskSophia}
          canSend={read.data !== undefined}
          onClearIf={props.onClearIf}
          held={props.held}
          onHeld={props.onHeld}
          refused={props.refused}
          onRefused={props.onRefused}
          onSent={(sent) => {
            follow.sent()
            if (sent.sophia === 'asked') props.onAsked(sent.message.at)
          }}
        />
      )}
      {props.writer === false && <p className="conv-note">Viewers read conversations; members write in them.</p>}
    </section>
  )
}

/**
 * The head: the way back (a phone), the title, who wrote there with their faces, what the conversation made, and
 * «Context» where the context is a panel.
 */
function Head(props: {
  conversation: ConversationSummary
  me: string
  head: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  context: Props['context']
}) {
  const { conversation: c, context } = props
  return (
    <header className="conv-head">
      <button type="button" className="icon-button conv-back" aria-label="All conversations" onClick={props.onBack}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="conv-head-words">
        <h3 ref={props.head} tabIndex={-1}>
          {c.title}
        </h3>
        <p className="conv-who">
          <Faces conversation={c} />
          <span className="sr-only">Contributors: </span>
          {contributorsLine(c, props.me)}
        </p>
      </div>
      <div className="conv-head-acts">
        <Output output={c.output} />
        <ContextToggle context={context} />
      </div>
    </header>
  )
}

/** «Context»: opens the project's context where it is a panel (under 1180 px); over that it is a pane, and this hides. */
export function ContextToggle({ context }: { context: Props['context'] }) {
  return (
    <button
      ref={context.ref}
      type="button"
      className="icon-button conv-context-toggle"
      aria-label="Context"
      title="Context"
      aria-expanded={context.open}
      aria-controls="conv-context"
      onClick={context.toggle}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  )
}

/** Who wrote there, as faces: up to three people, then Sophia's mark when she answered. */
function Faces({ conversation: c }: { conversation: ConversationSummary }) {
  return (
    <span className="conv-faces" aria-hidden>
      {c.contributors.slice(0, 3).map((p) => (
        <span key={p.actorId} className="conv-face">
          {initialOf(p.name)}
        </span>
      ))}
      {c.sophia && (
        <span className="conv-face sophia">
          <Mark />
        </span>
      )}
    </span>
  )
}

/**
 * The thread's own scroll follows what is written: a message sent comes into sight (with «Sophia is answering…»), and a
 * thread read at its end stays at its end as messages come; one scrolled up stays where the reader is.
 */
function useFollow() {
  const scroll = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const onScroll = () => {
    const el = scroll.current
    if (el) atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }
  const grown = useCallback(() => {
    const el = scroll.current
    if (el && atEnd.current) el.scrollTop = el.scrollHeight
  }, [])
  const sent = () => {
    atEnd.current = true
  }
  return { scroll, onScroll, grown, sent }
}

/** What the conversation made: its page in small and its name, in the head; it opens in the document viewer. */
function Output({ output }: { output: ConversationSummary['output'] }) {
  const viewer = useDocumentViewer()
  if (!output || !viewer) return null
  return (
    <button
      type="button"
      className="conv-output"
      title={output.title}
      onClick={() => viewer.open({ artifactId: output.artifactId, versionId: output.versionId })}
    >
      <span className="conv-output-page" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="conv-output-words">
        <span className="conv-output-title">{output.title}</span>
        <span className="conv-output-v">{`What it made · v${String(output.versionNumber)}`}</span>
      </span>
    </button>
  )
}

/** The conversation as read, a page at a time (the newest first), and read again as the feed moves. */
function useTranscript(conversationId: string, identity: Identity, cursor: string | undefined) {
  const read = useInfiniteQuery({
    queryKey: messagesKey(conversationId, identity.name),
    queryFn: ({ pageParam, signal }) => getConversationMessages(identity.token, conversationId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.before,
    retry: 1,
  })
  useReadAgain(cursor, read.refetch)
  return read
}

/** The conversation's messages, oldest first, a page at a time: Earlier messages reads the one before. */
function Messages(props: {
  read: ReturnType<typeof useTranscript>
  me: string
  awaiting: { since: string | null; late: boolean }
  onAnswered: (at: string) => void
  /** The thread grew (a message, or «Sophia is answering…»): its scroll may follow. */
  onGrown: () => void
}) {
  const { read, me, onAnswered, onGrown } = props
  // Each page is oldest first, and each one read is earlier than the last: the earliest page goes on top.
  const messages = read.data?.pages.toReversed().flatMap((p) => p.messages) ?? []
  const since = props.awaiting.since
  const answered = since !== null && answeredAfter(messages, since)
  // Seen once, the wait is over for good: newer messages may later push her answer out of the page read.
  useEffect(() => {
    if (answered) onAnswered(since)
  }, [answered, since, onAnswered])
  const waiting = since !== null && !answered
  // Grown at its end (a message, or the wait): an earlier page read above leaves where the reader is.
  const newest = messages.at(-1)?.id
  useEffect(() => onGrown(), [newest, waiting, onGrown])
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
      {waiting && (
        <p className="conv-note conv-answering" role="status">
          <span className="conv-glyph" aria-hidden>
            <Mark />
          </span>
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

/** A message's place: Sophia's on her plane, yours on the right, the team's on the left. */
const classOf = (m: ConversationMessage, me: string) =>
  m.author === 'sophia' ? 'conv-msg sophia' : m.actorId === me ? 'conv-msg mine' : 'conv-msg'

/** The messages, oldest first, each with who wrote it and when; the first takes the focus when it is given. */
function MessageList(props: {
  messages: readonly ConversationMessage[]
  me: string
  first: RefObject<HTMLLIElement | null>
}) {
  const { messages, me, first } = props
  const now = Date.now()
  return (
    <ol className="conv-messages">
      {messages.map((m, i) => {
        const before = messages[i - 1]
        const sophia = m.author === 'sophia'
        // The clock under the pointer (or the focus): seen, not read; the byline says it to a screen reader.
        const at = (
          <span className="conv-msg-at" aria-hidden>
            {clock(m.at)}
          </span>
        )
        return (
          <li
            key={m.id}
            ref={i === 0 ? first : undefined}
            tabIndex={i === 0 ? -1 : undefined}
            className={classOf(m, me)}
            data-run={continuesRun(before, m) ? 'on' : undefined}
          >
            {(!before || !sameDay(before.at, m.at)) && (
              <span className="conv-day" aria-hidden>
                {dayOf(m.at, now)}
              </span>
            )}
            {sophia && (
              <span className="conv-glyph" aria-hidden>
                <Mark />
              </span>
            )}
            <span className="conv-msg-by">
              {messageBy(m, me)}
              <span className="sr-only">
                {' · '}
                <time dateTime={m.at}>{when(m.at, now)}</time>
              </span>
            </span>
            <div className="conv-msg-body">
              {sophia ? <SophiaText text={m.text} /> : <p>{m.text}</p>}
              {sophia && at}
            </div>
            {!sophia && at}
          </li>
        )
      })}
    </ol>
  )
}

/** Sophia's words with their shape (sophia-text.ts): paragraphs, a lead, a list whose items may name who said it. */
function SophiaText({ text }: { text: string }) {
  return blocksOf(text).map((block, i) => {
    if (block.kind === 'lead') {
      return (
        <p key={i} className="sophia-lead">
          {block.text}
        </p>
      )
    }
    if (block.kind === 'p') return <p key={i}>{block.text}</p>
    return (
      // A list styled without marks keeps its role (Safari drops it otherwise).
      <ul key={i} className="sophia-list" role="list">
        {block.items.map((item, j) => (
          <li key={j}>
            {item.who && <span className="sophia-who">{`${item.who}: `}</span>}
            {item.text}
          </li>
        ))}
      </ul>
    )
  })
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
