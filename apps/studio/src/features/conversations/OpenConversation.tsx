// The open conversation (docs/plans/project-conversations.md): its title, who wrote there, Sophia's summary of it, its
// messages oldest first (a page at a time: Earlier messages reads the one before), and the report it made, which opens
// in the document viewer. How its context works is one disclosure away.
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef } from 'react'
import { getConversationMessages, type ConversationSummary } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { contributorsLine, messageBy, messageWhen } from './conversation-list.ts'

interface Props {
  conversation: ConversationSummary
  identity: Identity
  me: string
}

export function OpenConversation({ conversation: c, identity, me }: Props) {
  const summaryId = useId()
  return (
    <section className="conv-open" aria-label="Open conversation">
      <h3>{c.title}</h3>
      <p className="conv-who">{`Contributors: ${contributorsLine(c, me)}`}</p>
      <section className="conv-summary" aria-labelledby={summaryId}>
        <h4 id={summaryId} className="eyebrow">
          Summary
        </h4>
        <p>{c.summary ?? 'No summary yet.'}</p>
      </section>
      <Messages conversationId={c.id} identity={identity} me={me} />
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
function Messages({ conversationId, identity, me }: { conversationId: string; identity: Identity; me: string }) {
  const read = useInfiniteQuery({
    queryKey: ['vision', 'conversation', conversationId, identity.name],
    queryFn: ({ pageParam, signal }) => getConversationMessages(identity.token, conversationId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.before,
    retry: 1,
  })
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
      <Waiting words="Reading the conversation…" waiting={read.isPending} />
      {read.isError && messages.length === 0 && (
        <p className="conv-note" role="alert">
          This conversation can’t be read now.{' '}
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        </p>
      )}
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
      {messages.length > 0 && (
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
