// The open conversation (docs/plans/project-conversations.md), the middle pane (docs/plans/conversations-panes.md): its
// head (who wrote there, its title, the way back on a phone, «Context» where the context is a panel), the report it
// made as a strip, which opens in the document viewer, its messages oldest first in their own scroll (a page at a time:
// Earlier messages reads the one before), and the field at the pane's foot. Sophia's summary is in the context pane.
// Members continue it (docs/plans/project-conversation-writes.md); Sophia's answer is read as the feed moves. Each
// message has a face, a person's initial or Sophia's mark; messages by one author within minutes read as one run, its
// byline said once in sight and every time to a screen reader (docs/plans/conversation-thread.md). The thread follows
// what is written: a message sent comes into sight, and one read at its end stays at its end.
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ApiError } from '../../api/client.ts'
import {
  getConversationMessages,
  type ConversationMessage,
  type ConversationReply,
  type ConversationSummary,
  type MessageAsk,
} from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { Mark } from '../../app/Mark.tsx'
import { Button } from '@sophia/ui'
import {
  continuesRun,
  contributorsLine,
  initialOf,
  messageBy,
  messagesKey,
  replyEndWords,
} from './conversation-list.ts'
import { ConversationComposer } from './ConversationComposer.tsx'
import { dropUnfollowed, readFromOf, shows } from './followed-thread.ts'
import type { Held } from './held-write.ts'
import { replyWait } from './list-data.ts'
import { useKept, withHome, type Asked } from './talk-store.ts'
import { orderNow } from './withdrawn-purge.ts'
import { useReadAgain } from './useReadAgain.ts'
import { settled } from './next-ask.ts'
import { blocksOf } from './sophia-text.ts'
import { useProposeHere } from './ProposeHere.tsx'
import { MessageActs } from './MessageActs.tsx'
import { withQuote } from './message-acts.ts'
import { useWithdrawHere } from './WithdrawHere.tsx'
import type { NextAskSource } from './useNextAsk.ts'
import { clock, dayOf, sameDay, when } from '../../app/time-words.ts'
import { LinkedText } from '../../app/LinkedText.tsx'
import { RichText } from '../../app/RichText.tsx'
import { CopyLink } from '../resources/CopyLink.tsx'
import { addressOf, CONVERSATION } from '../resources/link.ts'

interface Props {
  projectId: string
  conversation: ConversationSummary
  /** The list as read: being read again, or its last read failed, what it says of this conversation may be stale. */
  list?: { isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle' }
  identity: Identity
  me: string
  /** The project's feed position: the messages are read again as it moves (Sophia's answer, others' messages). */
  cursor: string | undefined
  /** Members write here; viewers read; undefined until the membership is read (neither, meanwhile). */
  writer: boolean | undefined
  /** Sophia answers here now (the list's `capability.ask`). */
  answers: boolean
  /** The reader may remove any message here (an admin: the list's `capability.moderate`). */
  moderate: boolean
  /** The saved-text notice, before the reader's first message in the project; null after it. */
  notice: string | null
  draft: string
  onDraft: (text: string) => void
  askSophia: boolean
  onAskSophia: (on: boolean) => void
  onClearIf: (text: string) => void
  /** The message on its way here, or sent with no reply (held by the view). */
  held: Held<MessageAsk> | null
  onHeld: (next: Held<MessageAsk> | null) => void
  /** Erased since, as the view knows it now: a late answer here keeps nothing (PR #199, Codex on `a3422f4`). */
  gone: () => boolean
  /** The refusal that answered the last press here (kept by the view). */
  refused: string | null
  onRefused: (words: string | null) => void
  /** The request Sophia was last asked here (kept by the view): a message that doesn't ask her leaves it. */
  asked: Asked | null
  onAsked: (reply: ConversationReply) => void
  /** The request `replyId` ended (answered, or said why not): that wait is over (kept by the view). */
  onAnswered: (replyId: string) => void
  /** Just started here: the focus goes to its title, once. */
  arrived: boolean
  onArrived: () => void
  /** Back to the list (a phone shows one at a time). */
  onBack: () => void
  /**
   * Its own read within the project (CON-01-CC-0072, CX-0074), each counted only from a read made since it opened:
   * not found, to a current member: gone (the view settles it); refused, the reader not a current member: the view
   * fences (talk-store `fence`, `denied`); answered, set out at `from`: it stands, if after any refusal.
   */
  onGone: () => void
  onDenied: () => void
  onFound: (from: number) => void
  /**
   * Where in this view's order its read within the project was refused, if it was: what a read set out before then
   * holds is not shown, its messages and their presses, nor its composer, until a read set out since answers.
   */
  deniedAt: number | undefined
  /** The context as a panel (under 1180 px): whether it is open, its press, and that press's element for the focus. */
  context: { open: boolean; toggle: () => void; ref: RefObject<HTMLButtonElement | null> }
}

/** How long «Sophia is answering…» waits before it says her answer will come later. */
export const ANSWER_WAIT_MS = 120_000

/**
 * The request Sophia was asked here; late once it hasn't ended in time, counted on this page's clock from when it
 * asked (not from coming back, and never against the server's clock).
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
  return {
    replyId: asked?.replyId ?? null,
    messageId: asked?.messageId ?? null,
    after: asked?.after ?? null,
    late,
  }
}

/** A quote goes under the draft and the field takes the focus; null for those who can't write here. */
function useQuote(props: Pick<Props, 'writer' | 'draft' | 'onDraft'>, section: RefObject<HTMLElement | null>) {
  if (props.writer !== true) return null
  return (quote: string) => {
    props.onDraft(withQuote(props.draft, quote))
    // The composer's own field: a proposal's form open on a message has a textarea of its own before it.
    section.current?.querySelector<HTMLTextAreaElement>('.conv-compose textarea')?.focus()
  }
}

/** Arrived at this conversation (from a link, from Home), the focus lands on its head once. */
function useArrivalFocus(head: RefObject<HTMLHeadingElement | null>, arrived: boolean, onArrived: () => void) {
  useEffect(() => {
    if (!arrived) return
    head.current?.focus()
    onArrived()
  }, [head, arrived, onArrived])
}

export function OpenConversation(props: Props) {
  const { conversation: c, identity, me, arrived, onArrived } = props
  const awaiting = useAwaiting(props.asked)
  const { read, current } = useThread(props.projectId, c.id, identity, props.cursor, props)
  const head = useRef<HTMLHeadingElement>(null)
  const section = useRef<HTMLElement>(null)
  const follow = useFollow()
  const onQuote = useQuote(props, section)
  useArrivalFocus(head, arrived, onArrived)
  return (
    <section ref={section} className="conv-open" aria-label="Open conversation">
      <Head conversation={c} me={me} head={head} onBack={props.onBack} context={props.context} />
      <Thread follow={follow}>
        <HeldMessages
          shown={visible(read, props.deniedAt)}
          read={read}
          me={me}
          awaiting={awaiting}
          onAnswered={props.onAnswered}
          onGrown={follow.grown}
          propose={props.writer === true ? { projectId: props.projectId, identity } : null}
          onQuote={onQuote}
          withdraw={{ projectId: props.projectId, conversationId: c.id, identity, me, moderate: props.moderate }}
        />
      </Thread>
      {props.writer === true && visible(read, props.deniedAt) && (
        <ConversationComposer
          conversationId={c.id}
          identity={identity}
          draft={props.draft}
          onDraft={props.onDraft}
          askSophia={props.askSophia}
          onAskSophia={props.onAskSophia}
          canSend={read.data !== undefined}
          answers={props.answers}
          notice={props.notice}
          onClearIf={props.onClearIf}
          held={props.held}
          onHeld={props.onHeld}
          gone={props.gone}
          refused={props.refused}
          onRefused={props.onRefused}
          onSent={(sent) => {
            follow.sent()
            if (sent.reply) props.onAsked(sent.reply)
          }}
          next={nextOf(props, read, current)}
        />
      )}
      {props.writer === false && <p className="conv-note">Viewers read conversations; members write in them.</p>}
    </section>
  )
}

/** What the composer's next ask reads (useNextAsk.ts), with whether each part is known now (Codex P2s on #262). */
/**
 * The thread as read, and whether that read answers the feed's cursor now: the cursor its last feed-triggered read
 * landed for. A moved cursor makes it not current from that very render, before its refetch has even started; only
 * that refetch, not an older page, makes it current again (Codex on #275).
 */
function useThread(
  projectId: string,
  conversationId: string,
  identity: Identity,
  cursor: string | undefined,
  on: Pick<Props, 'onGone' | 'onDenied' | 'onFound'>,
) {
  const [readFor, setReadFor] = useState(cursor)
  const read = useTranscript(projectId, conversationId, identity, cursor, { ...on, onReadFor: setReadFor })
  return { read, current: readFor === cursor }
}

function nextOf(props: Props, read: ReturnType<typeof useTranscript>, current: boolean): NextAskSource {
  return {
    projectId: props.projectId,
    me: props.me,
    read: read.data,
    // Read and not being read again, the last read not failed: its newest message is the newest; and the list not being
    // read again, its open questions the count now (Codex on #275).
    // Idle only: a read paused offline keeps its old data and is not current either (Codex on #275).
    fresh: current && read.isSuccess && settled(read) && settled(props.list ?? { fetchStatus: 'idle' }),
    readAt: read.dataUpdatedAt,
    // The list's last read failed: its count of open questions may be stale.
    openQuestions: props.list?.isError === true ? null : props.conversation.openQuestions,
  }
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
      <Button
        kind="icon"
        size="md"
        className="icon-button conv-back"
        aria-label="All conversations"
        onClick={props.onBack}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </Button>
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
        <CopyLink href={() => addressOf(c.id, CONVERSATION)} />
        <ContextToggle context={context} />
      </div>
    </header>
  )
}

/**
 * The thread in its own scroll, a region the keyboard reaches (arrows scroll it; from the keyboard, every time shows
 * there), and «New messages ↓» over its foot while what came is out of sight (conversation-moves.md).
 */
function Thread({ follow, children }: { follow: ReturnType<typeof useFollow>; children: ReactNode }) {
  return (
    <>
      <div
        ref={follow.scroll}
        className="conv-scroll"
        role="region"
        aria-label="Messages"
        tabIndex={0}
        onScroll={follow.onScroll}
      >
        {children}
      </div>
      {follow.unseen && (
        <button type="button" className="pill conv-new-pill" onClick={follow.toEnd}>
          New messages <span aria-hidden>↓</span>
        </button>
      )}
    </>
  )
}

/** «Context»: opens the project's context where it is a panel (under 1180 px); over that it is a pane, and this hides. */
export function ContextToggle({ context }: { context: Props['context'] }) {
  return (
    <Button
      ref={context.ref}
      kind="icon"
      size="md"
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
    </Button>
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
  // Grown at its end while the reader is away from it: «New messages» says so (conversation-moves.md).
  const [unseen, setUnseen] = useState(false)
  const onScroll = () => {
    const el = scroll.current
    if (el) atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (atEnd.current) setUnseen(false)
  }
  const grown = useCallback(() => {
    const el = scroll.current
    if (el && atEnd.current) el.scrollTop = el.scrollHeight
    else if (el) setUnseen(true)
  }, [])
  const sent = () => {
    atEnd.current = true
  }
  const toEnd = () => {
    const el = scroll.current
    if (!el) return
    atEnd.current = true
    setUnseen(false)
    el.scrollTop = el.scrollHeight
    el.focus({ preventScroll: true })
  }
  return { scroll, onScroll, grown, sent, unseen, toEnd }
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

/**
 * The conversation as read, a page at a time (the newest first), and read again as the feed moves. A read held from
 * before that no view followed as the feed moved is let go as it opens, before it is shown (followed-thread.ts); each
 * read notes where the feed stood as it set out, on its newest page.
 */
function useTranscript(
  projectId: string,
  conversationId: string,
  identity: Identity,
  cursor: string | undefined,
  on: Pick<Props, 'onGone' | 'onDenied' | 'onFound'> & {
    /** The feed's own read answered: the cursor the thread now answers (useThread). */
    onReadFor?: (cursor: string | undefined) => void
  },
) {
  const queryClient = useQueryClient()
  const key = messagesKey(conversationId, accountOf(identity))
  // Once, as it opens (a part per conversation), before the read below is first shown.
  useState(() => dropUnfollowed(queryClient, key, cursor))
  const at = useRef(cursor)
  useEffect(() => {
    at.current = cursor
  }, [cursor])
  const read = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => {
      const readAt = at.current
      // Where in this view's order each page's read set out: a wait noted before it is judged by the page holding its
      // ask (replyWait, readFromOf; PR #199 r4238633935).
      const readFrom = orderNow()
      // Refused (403, known from the status alone): denied as the client learns it, before the query tells the view a
      // task later, so no frame between shows the thread (R-REFUSAL-MEASURE-01); the effect below stays for the rest.
      return getConversationMessages(identity.token, projectId, conversationId, pageParam, signal).then(
        (page) => (pageParam === null && readAt !== undefined ? { ...page, readFrom, readAt } : { ...page, readFrom }),
        (error: unknown) => {
          if (isRefusal(error)) on.onDenied()
          throw error
        },
      )
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.before,
    // Refused, it is not asked again: the reader isn't a current member (PR #199 r4239161783).
    retry: (failures, err) => failures < 1 && !isRefusal(err),
  })
  // The read the feed asks for, and only it, says which cursor the thread now answers: an older page landing meanwhile
  // says nothing of the newest (Codex on #275).
  const { refetch } = read
  const { onReadFor } = on
  const readAgain = useCallback(
    () =>
      refetch().then((r) => {
        if (r.isSuccess) onReadFor?.(cursor)
      }),
    [refetch, onReadFor, cursor],
  )
  useReadAgain(cursor, readAgain)
  // Its own read within the project says what it is, only from a read made since it opened: an answer the cache kept
  // from before (a reader given the project back, this conversation open again) is not one, until its own read
  // answers (CX-0069). Not found, to a current member: gone. Refused: the reader isn't a current member. Any other
  // failure (a refused cursor, an outage) proves nothing: what was read stays, said possibly out of date.
  const code = read.isFetchedAfterMount && read.error instanceof ApiError ? read.error.code : null
  const { onGone, onDenied, onFound } = on
  // Refused: fenced before the browser paints, so no frame shows the view as it was (r4239161783).
  useLayoutEffect(() => {
    if (code === 'forbidden') onDenied()
  }, [code, onDenied])
  useEffect(() => {
    if (code === 'not_found') onGone()
  }, [code, onGone])
  // Answered since it opened: where its newest page's read set out (an older answer ends no refusal: CX-0074).
  const newest = read.isFetchedAfterMount && read.isSuccess ? read.data.pages[0] : undefined
  const from = newest && 'readFrom' in newest && typeof newest.readFrom === 'number' ? newest.readFrom : null
  useEffect(() => {
    if (from !== null) onFound(from)
  }, [from, onFound])
  return read
}

/** The project's refusal (403): the reader isn't a current member of it. */
const isRefusal = (err: unknown) => err instanceof ApiError && err.code === 'forbidden'

/**
 * Its own read since it opened refused: nothing it holds shows, nor its composer, from the render that refusal comes
 * in, before the view is fenced (PR #199 r4239161783).
 */
const refusedNow = (read: ReturnType<typeof useTranscript>) => read.isFetchedAfterMount && isRefusal(read.error)

/** Whether what its read holds shows now: not refused since it opened, and read since any refusal (`shows`). */
const visible = (read: ReturnType<typeof useTranscript>, deniedAt: number | undefined) =>
  shows(read.data, deniedAt) && !refusedNow(read)

/**
 * The messages, or, where what is held may not show yet (`shows`), that it is being read again, or that it can't be
 * read now once that read failed (Try again reads it again; what it held stays hidden: PR #199 CX-0079). Thread's
 * scrolled region holds it, which the keyboard reaches (arrows scroll it).
 */
function HeldMessages(props: Parameters<typeof Messages>[0] & { shown: boolean }) {
  const { read } = props
  if (props.shown) return <Messages {...props} />
  if (!read.isError || read.isFetching) return <Waiting words="Reading this conversation again…" waiting />
  return (
    <p className="conv-note" role="alert">
      This conversation can’t be read now.{' '}
      <button type="button" className="text-button" onClick={() => void read.refetch()}>
        Try again
      </button>
    </p>
  )
}

/** The conversation's messages, oldest first, a page at a time: Earlier messages reads the one before. */
function Messages(props: {
  read: ReturnType<typeof useTranscript>
  me: string
  awaiting: { replyId: string | null; messageId: string | null; after: number | null; late: boolean }
  onAnswered: (replyId: string) => void
  /** The thread grew (a message, or «Sophia is answering…»): its scroll may follow. */
  onGrown: () => void
  /** Where a message may be proposed as a decision (C7); null for those who can't write here. */
  propose: Propose
  onQuote: ((quote: string) => void) | null
  /** Who may withdraw what here: their own messages, and any for an admin. */
  withdraw: Withdraw
}) {
  const { read, me, onAnswered, onGrown } = props
  // Each page is oldest first, and each one read is earlier than the last: the earliest page goes on top.
  const messages = read.data?.pages.toReversed().flatMap((p) => p.messages) ?? []
  const waiting = useReplyWait(messages, props.awaiting, readFromOf(read.data, props.awaiting.messageId), onAnswered)
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
          // Not pressed while the thread is read again, paused offline included: an older page then would cancel that
          // read (Codex on #275).
          busy={!settled(read)}
          failed={read.isFetchNextPageError}
          onRead={() => {
            asked.current = true
            void read.fetchNextPage()
          }}
        />
      )}
      {messages.length > 0 && (
        <MessageList
          messages={messages}
          me={me}
          first={first}
          propose={props.propose}
          onQuote={props.onQuote}
          withdraw={props.withdraw}
        />
      )}
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

/**
 * Whether the request asked here is still under way, as the messages read show it (list-data `replyWait`); once they
 * show it ended, the wait goes for good.
 */
function useReplyWait(
  messages: readonly ConversationMessage[],
  awaiting: { replyId: string | null; messageId: string | null; after: number | null },
  readFrom: number,
  onAnswered: (replyId: string) => void,
): boolean {
  const { replyId } = awaiting
  const { ended, waiting } = replyWait(messages, awaiting, readFrom)
  useEffect(() => {
    if (ended && replyId !== null) onAnswered(replyId)
  }, [ended, replyId, onAnswered])
  return waiting
}

/** Earlier messages: reads the page before, once at a time; says so when it can't. */
function Earlier({
  reading,
  busy,
  failed,
  onRead,
}: {
  reading: boolean
  busy: boolean
  failed: boolean
  onRead: () => void
}) {
  return (
    <p className="conv-earlier">
      <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => !busy && onRead()}>
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
type Propose = { projectId: string; identity: Identity } | null
/** Who reads here (`me`), whether they remove any message (`moderate`), and where. */
type Withdraw = { projectId: string; conversationId: string; identity: Identity; me: string; moderate: boolean }

function MessageList(props: {
  messages: readonly ConversationMessage[]
  me: string
  first: RefObject<HTMLLIElement | null>
  propose: Propose
  onQuote: ((quote: string) => void) | null
  withdraw: Withdraw
}) {
  const { messages, me, first, propose } = props
  const now = Date.now()
  // On a phone (no pointer to point with), the message pressed shows its own press.
  const [pressed, setPressed] = useState<string | null>(null)
  return (
    <ol className="conv-messages">
      {messages.map((m, i) => (
        <MessageItem
          key={m.id}
          message={m}
          before={messages[i - 1]}
          me={me}
          now={now}
          first={i === 0 ? first : undefined}
          propose={propose}
          onQuote={props.onQuote}
          withdraw={props.withdraw}
          pressed={pressed === m.id}
          onPress={(row) => {
            setPressed(m.id)
            // The row it opens under the bubble stays in sight, the newest message's too (Codex on #240).
            requestAnimationFrame(() => row?.querySelector('.conv-acts')?.scrollIntoView({ block: 'nearest' }))
          }}
        />
      ))}
    </ol>
  )
}

/**
 * A message's words (none once withdrawn: it keeps its place and nothing else, so nothing to propose from), its
 * «Propose as decision» press and form where one can propose (C7), and why a request it asked ended unanswered.
 */
function useMessageParts(m: ConversationMessage, propose: Propose, withdraw: Withdraw) {
  const words = m.withdrawn ? null : m.text
  useHome(m.id, withdraw.conversationId, propose)
  const here = useProposeHere(
    propose && words !== null ? { ...propose, messageId: m.id, text: words, sophia: m.author === 'sophia' } : null,
  )
  // An author withdraws their own (whatever their role now), an admin removes any; nothing once withdrawn (A33).
  const own = m.author === 'member' && m.actorId === withdraw.me
  const away = useWithdrawHere(
    words !== null && (own || withdraw.moderate) ? { ...withdraw, messageId: m.id, own } : null,
  )
  return { words, here, away, ended: m.ask ? replyEndWords(m.ask) : null }
}

/**
 * A message with a proposal kept for it (talk-store: held, refused or recorded, by ProposeHere): its conversation known,
 * so that conversation's erasure takes the proposal too (PR #199 r4235397318).
 */
function useHome(messageId: string, conversationId: string, place: Propose) {
  const { kept, change } = useKept(place?.projectId ?? '', place ? accountOf(place.identity) : '')
  const has = place !== null && [kept.proposals, kept.proposalRefusals, kept.proposed].some((r) => messageId in r)
  useEffect(() => {
    if (has) change((k) => withHome(k, messageId, conversationId))
  }, [has, messageId, conversationId, change])
}

/**
 * A message's acts and where they stand: above the bubble, or beside it for a member's message continuing a run under
 * a pointer (not over the bubble above it; Codex on #240). Words that leave the thread name who said them by name. A
 * withdrawn message has none.
 */
function useActsPlace(
  m: ConversationMessage,
  before: ConversationMessage | undefined,
  with_: { words: string | null; now: number; onQuote: ((quote: string) => void) | null; propose: ReactNode },
) {
  const run = continuesRun(before, m)
  // Read as the message renders: a pointer that hovers does not come and go within a visit.
  const side = run && m.author !== 'sophia' && window.matchMedia(HOVERS).matches
  const acts =
    with_.words === null ? null : (
      <MessageActs
        message={{ text: with_.words, at: m.at }}
        who={portableBy(m)}
        now={with_.now}
        onQuote={with_.onQuote}
        propose={with_.propose}
        side={side}
      />
    )
  return { run, side, acts }
}

/** A pointer that hovers: where a message's acts show under it. */
const HOVERS = '(hover: hover)'

/** Who said a message, by name, for words that leave the thread (the clipboard, a quote). */
const portableBy = (m: ConversationMessage) => (m.author === 'sophia' ? 'Sophia' : (m.name ?? 'A member'))

/** One message: its day when it starts one, who wrote it, its words; where one can propose, its press and form (C7). */
function MessageItem(props: {
  message: ConversationMessage
  before: ConversationMessage | undefined
  me: string
  now: number
  first: RefObject<HTMLLIElement | null> | undefined
  propose: Propose
  onQuote: ((quote: string) => void) | null
  withdraw: Withdraw
  pressed: boolean
  onPress: (row: HTMLLIElement | null) => void
}) {
  const { message: m, before, me, now } = props
  const sophia = m.author === 'sophia'
  const { words, here, away, ended } = useMessageParts(m, props.propose, props.withdraw)
  // The clock under the pointer (or the focus): seen, not read; the byline says it to a screen reader.
  const at = (
    <span className="conv-msg-at" aria-hidden>
      {clock(m.at)}
    </span>
  )
  const propose = (
    <>
      {here.press}
      {away.press}
    </>
  )
  const { run, side, acts } = useActsPlace(m, before, { words, now, onQuote: props.onQuote, propose })
  return (
    <li
      ref={props.first}
      tabIndex={props.first ? -1 : undefined}
      className={classOf(m, me)}
      data-run={run ? 'on' : undefined}
      data-pressed={props.pressed || undefined}
      onClick={(e) => props.onPress(e.currentTarget)}
    >
      <MessageLead message={m} before={before} now={now} />
      <MessageBy message={m} me={me} now={now} />
      {/* The turn (the bubble, the acts, the clock) is the acts' box: the thread's width, from the bubble's top line;
          the name stays before it, so the acts never share its coordinates. */}
      <div className="conv-turn">
        <div className="conv-msg-body">
          <MessageWords words={words} sophia={sophia} />
          {sophia && at}
          {ended && <p className="conv-ask-ended">{ended}</p>}
          {side && acts}
        </div>
        {!side && acts}
        {!sophia && at}
      </div>
      {here.form}
      {away.form}
    </li>
  )
}

/** Who wrote the message, with its time for a screen reader (the clock beside the bubble is for the eye). */
function MessageBy({ message: m, me, now }: { message: ConversationMessage; me: string; now: number }) {
  return (
    <span className="conv-msg-by">
      {messageBy(m, me)}
      <span className="sr-only">
        {' · '}
        <time dateTime={m.at}>{when(m.at, now)}</time>
      </span>
    </span>
  )
}

/** Before a message's turn: its day when it starts one, and her glyph. */
function MessageLead({
  message: m,
  before,
  now,
}: {
  message: ConversationMessage
  before: ConversationMessage | undefined
  now: number
}) {
  return (
    <>
      {(!before || !sameDay(before.at, m.at)) && (
        <span className="conv-day" aria-hidden>
          {dayOf(m.at, now)}
        </span>
      )}
      {m.author === 'sophia' && (
        <span className="conv-glyph" aria-hidden>
          <Mark />
        </span>
      )}
    </>
  )
}

/**
 * A message's words: hers with their shape, a member's as written with its marks (RichText: bold, code, quotes and
 * links, docs/plans/message-format.md), or that it was withdrawn (where the focus lands when it is withdrawn here:
 * WithdrawHere.tsx).
 */
function MessageWords({ words, sophia }: { words: string | null; sophia: boolean }) {
  if (words === null) {
    return (
      <p className="conv-withdrawn" tabIndex={-1}>
        This message was withdrawn.
      </p>
    )
  }
  return sophia ? (
    <SophiaText text={words} />
  ) : (
    <p>
      <RichText text={words} />
    </p>
  )
}

/** Sophia's words with their shape (sophia-text.ts): paragraphs, a lead, a list whose items may name who said it. */
function SophiaText({ text }: { text: string }) {
  return blocksOf(text).map((block, i) => {
    if (block.kind === 'lead') {
      return (
        <p key={i} className="sophia-lead">
          <LinkedText text={block.text} />
        </p>
      )
    }
    if (block.kind === 'p')
      return (
        <p key={i}>
          <LinkedText text={block.text} />
        </p>
      )
    return (
      // A list styled without marks keeps its role (Safari drops it otherwise).
      <ul key={i} className="sophia-list" role="list">
        {block.items.map((item, j) => (
          <li key={j}>
            {item.who && <span className="sophia-who">{`${item.who}: `}</span>}
            <LinkedText text={item.text} />
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
