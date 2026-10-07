// The project's context beside its conversations (docs/plans/project-conversations.md), the right pane
// (docs/plans/conversations-panes.md): first the open conversation, Sophia's summary of it and how many questions are
// open; then the accepted mission, the newest accepted decisions, and what is proposed and not decided, kept apart;
// then how the context works. Under 1180 px it is a panel that «Context» opens, with its own Close, which takes the
// focus as it opens. It is the brief Sophia reads
// (MissionContext, the same read as the room's mission panel), the same for every conversation. One query, read again
// as the feed moves: a later read that fails keeps what was read, and says it may be out of date.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { getMission } from '../../api/mission.ts'
import type { ConversationSummary } from '../../api/vision.ts'
import type { MissionContext } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { missionKey } from '../mission/mission-view.ts'
import { acceptedOf, openWords, pendingOf } from './conversation-list.ts'
import { useReadAgain } from './useReadAgain.ts'

interface Props {
  projectId: string
  identity: Identity
  cursor: string | undefined
  /** The conversation open beside it, whose summary comes first. */
  conversation: ConversationSummary | undefined
  /** Opened as a panel (under 1180 px): its Close takes the focus. */
  opened: boolean
  onClose: () => void
}

export function ProjectContext({ projectId, identity, cursor, conversation, opened, onClose }: Props) {
  const read = useQuery({
    queryKey: [...missionKey(projectId), identity.name, 'conversations'],
    queryFn: () => getMission(identity.token, projectId),
    retry: 1,
  })
  useReadAgain(cursor, read.refetch)
  const ctx = read.data
  const frame = (body: ReactNode) => (
    <Frame opened={opened} onClose={onClose} conversation={conversation}>
      {body}
    </Frame>
  )
  if (!ctx) {
    return frame(
      <>
        <Waiting words="Reading the project’s context…" waiting={read.isPending} />
        {read.isError && (
          <p className="conv-note" role="alert">
            The project’s context can’t be read now.{' '}
            <button type="button" className="text-button" onClick={() => void read.refetch()}>
              Try again
            </button>
          </p>
        )}
      </>,
    )
  }
  return frame(
    <>
      {read.isError && (
        <p className="conv-note" role="alert">
          This may be out of date.{' '}
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        </p>
      )}
      {ctx.mission ? (
        <div className="conv-mission">
          <p className="conv-mission-statement">{ctx.mission.statement}</p>
          {ctx.mission.purpose && <p>{ctx.mission.purpose}</p>}
        </div>
      ) : (
        <p className="conv-note">No mission accepted yet.</p>
      )}
      <Decisions ctx={ctx} />
    </>,
  )
}

/**
 * The pane around the context: its name and Close (a panel's), this conversation first, the project's context, then how
 * it works. Close takes the focus as the panel opens.
 */
function Frame(props: {
  opened: boolean
  onClose: () => void
  conversation: ConversationSummary | undefined
  children: ReactNode
}) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (props.opened) close.current?.focus()
  }, [props.opened])
  return (
    <aside id="conv-context" className="conv-context" aria-label="Project context">
      <div className="conv-context-head">
        <h3 className="eyebrow">Project context</h3>
        <button
          ref={close}
          type="button"
          className="icon-button conv-context-close"
          aria-label="Close the context"
          onClick={props.onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {props.conversation && <ThisConversation conversation={props.conversation} />}
      {props.children}
      <details className="conv-help">
        <summary>How conversation context works</summary>
        <p>
          A conversation keeps its own messages and summary. Sophia’s next answer here can also read the project’s
          current mission, decisions and eligible sources. Other conversations are read only when asked, never merged.
          This context is the same for every conversation here.
        </p>
      </details>
    </aside>
  )
}

/** The open conversation, first: Sophia's summary of it, and how many questions are open there. */
function ThisConversation({ conversation: c }: { conversation: ConversationSummary }) {
  const id = useId()
  return (
    <section className="conv-this" aria-labelledby={id}>
      <h4 id={id} className="eyebrow">
        This conversation
      </h4>
      <p className="conv-this-summary">{c.summary ?? 'No summary yet.'}</p>
      <p className="conv-note">{openWords(c.openQuestions)}</p>
    </section>
  )
}

/** The accepted decisions, newest first, and what is proposed and not decided, kept apart. */
function Decisions({ ctx }: { ctx: MissionContext }) {
  const acceptedId = useId()
  const openId = useId()
  const { shown, more } = acceptedOf(ctx.constraints)
  const open = pendingOf(ctx.pending)
  return (
    <>
      <section aria-labelledby={acceptedId}>
        <h4 id={acceptedId} className="eyebrow">
          Accepted decisions
        </h4>
        {shown.length === 0 ? (
          <p className="conv-note">None accepted yet.</p>
        ) : (
          <ul className="conv-decisions">
            {shown.map((d) => (
              <li key={d.id}>{d.statement}</li>
            ))}
          </ul>
        )}
        {more > 0 && <p className="conv-note">{`and ${String(more)} more`}</p>}
      </section>
      <section aria-labelledby={openId}>
        <h4 id={openId} className="eyebrow">
          Still open
        </h4>
        {open.shown.length === 0 ? (
          <p className="conv-note">Nothing waits for a decision.</p>
        ) : (
          <>
            <ul className="conv-decisions open">
              {open.shown.map((d) => (
                <li key={d.id}>{d.statement}</li>
              ))}
            </ul>
            {open.more > 0 && <p className="conv-note">{`and ${String(open.more)} more`}</p>}
            <p className="conv-note">Proposed, not decided.</p>
          </>
        )}
      </section>
    </>
  )
}
