// The project's context beside its conversations (docs/plans/project-conversations.md), the right pane
// (docs/plans/conversations-panes.md): first the open conversation, Sophia's summary of it and how many questions are
// open; then the accepted mission, the newest accepted decisions, and what is proposed and not decided, kept apart;
// then how the context works. Under 1180 px it is a panel that «Context» opens, with its own Close, which takes the
// focus as it opens. It is the brief Sophia reads
// (MissionContext, the same read as the room's mission panel), the same for every conversation. One query, read again
// as the feed moves: a later read that fails keeps what was read, and says it may be out of date.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { getMission } from '../../api/mission.ts'
import type { ConversationSummary } from '../../api/vision.ts'
import type { MissionContext, MissionDecision } from '@sophia/contracts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { missionKey } from '../mission/mission-view.ts'
import { acceptedOf, openWords, pendingOf } from './conversation-list.ts'
import { useReadAgain } from './useReadAgain.ts'
import { decidableHere, pressesWait, type DecideArgs, type DecideState } from './decide.ts'
import { useHeldDecision, type DecisionAsk } from './held-decision.ts'

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
    queryKey: [...missionKey(projectId), accountOf(identity), 'conversations'],
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
      <Decisions ctx={ctx} projectId={projectId} identity={identity} />
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
    <aside id="conv-context" className="conv-context" aria-label="Project context" tabIndex={-1}>
      <div className="conv-context-head">
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
      <h3 className="eyebrow">Project context</h3>
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
function Decisions({ ctx, projectId, identity }: StillOpenProps) {
  // «and 2 more» opens its own list (C9), until folded again by the same press.
  const [every, setEvery] = useState(false)
  const { shown } = acceptedOf(ctx.constraints, every)
  const { more } = acceptedOf(ctx.constraints)
  return (
    <>
      <Accepted shown={shown} more={more} every={every} onEvery={setEvery} />
      <StillOpen ctx={ctx} projectId={projectId} identity={identity} />
    </>
  )
}

/** The accepted decisions, newest first: three, or all once «and 2 more» is pressed. */
function Accepted(props: {
  shown: readonly MissionDecision[]
  /** How many the folded list leaves out. */
  more: number
  every: boolean
  onEvery: (every: boolean) => void
}) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h4 id={id} className="eyebrow">
        Accepted decisions
      </h4>
      {props.shown.length === 0 ? (
        <p className="conv-note">None accepted yet.</p>
      ) : (
        <ul className="conv-decisions">
          {props.shown.map((d) => (
            <li key={d.id}>{d.statement}</li>
          ))}
        </ul>
      )}
      {props.more > 0 && <More every={props.every} more={props.more} onEvery={props.onEvery} />}
    </section>
  )
}

/**
 * «and 2 more», a press that shows its list whole; open, the same press says «Show fewer» and folds it again, so the
 * focus stays where it was pressed and `aria-expanded` changes on it.
 */
function More({ every, more, onEvery }: { every: boolean; more: number; onEvery: (every: boolean) => void }) {
  return (
    <button type="button" className="text-button conv-more" aria-expanded={every} onClick={() => onEvery(!every)}>
      {every ? 'Show fewer' : `and ${String(more)} more`}
    </button>
  )
}

/** What a decision answered says. */
const answeredWords = ({ args, statement }: DecisionAsk) =>
  `${args.decision === 'accept' ? 'Accepted' : 'Declined'}: ${statement}`

/**
 * One decision at a time from Still open (docs/plans/decide-on-its-way.md): what was asked, what its line says, and
 * the focus on that line once it settles, whatever the answer (the press may be gone with the brief read again). The
 * presses wait while it goes, while unknown, and once answered until the brief no longer lists it.
 */
function useDecideHere(projectId: string, identity: Identity, pending: readonly MissionDecision[]) {
  // Held by the view (held-decision.ts): a trip to another view and back finds the same decision, under its key.
  const decision = useHeldDecision(projectId, identity)
  const status = useRef<HTMLParagraphElement>(null)
  const section = useRef<HTMLElement>(null)
  const settled = () => {
    // The line is already there: the focus goes to it now (a frame may never come in a tab out of sight), if it is
    // still here or was lost with its press; never taken from where the person went meanwhile.
    const at = document.activeElement
    if (!at || at === document.body || section.current?.contains(at)) status.current?.focus()
  }
  const answer = (args: DecideArgs, statement: string) => void decision.run({ args, statement }).then(settled)
  const retry = () => {
    if (decision.state.status === 'unknown' && decision.asked) void decision.run(decision.asked).then(settled)
  }
  const { state, asked } = decision
  return { state, asked, status, section, answer, retry, busy: pressesWait(state, pending) }
}

interface StillOpenProps {
  ctx: MissionContext
  projectId: string
  identity: Identity
}

/**
 * What waits for a decision, decided here where it can be (C7): one decision at a time; with no reply, the presses wait
 * and «Try again» sends that same decision under its key, never another. Answered, the focus goes to what it says.
 */
function StillOpen({ ctx, projectId, identity }: StillOpenProps) {
  const [every, setEvery] = useState(false)
  const openId = useId()
  const here = useDecideHere(projectId, identity, ctx.pending)
  const { state, asked, status, section, answer, retry, busy } = here
  const open = pendingOf(ctx.pending, every)
  const { more } = pendingOf(ctx.pending)
  return (
    <section ref={section} aria-labelledby={openId}>
      <h4 id={openId} className="eyebrow">
        Still open
      </h4>
      {open.shown.length === 0 ? (
        <p className="conv-note">Nothing waits for a decision.</p>
      ) : (
        <>
          <ul className="conv-decisions open">
            {open.shown.map((d) => (
              <li key={d.id}>
                {d.statement}
                <DecideHere decision={d} can={ctx.capabilities.decide.available} busy={busy} onAnswer={answer} />
              </li>
            ))}
          </ul>
          {more > 0 && <More every={every} more={more} onEvery={setEvery} />}
          <p className="conv-note">Proposed, not decided.</p>
        </>
      )}
      <DecideSaid status={status} state={state} asked={asked} onRetry={retry} />
    </section>
  )
}

/**
 * What the last decision says: on its way (and a long wait's line), refused (by whether it still waits), not confirmed
 * (with «Try again»), or answered; where the focus goes after.
 */
function DecideSaid(props: {
  status: RefObject<HTMLParagraphElement | null>
  state: DecideState
  asked: DecisionAsk | null
  onRetry: () => void
}) {
  const { state, asked } = props
  const slow = useSlow(state.status === 'sending')
  return (
    <p ref={props.status} className="conv-note" role="status" tabIndex={-1}>
      {state.status === 'sending' && (state.args.decision === 'accept' ? 'Accepting…' : 'Declining…')}
      {slow && ` ${SLOW_NOTE}`}
      {state.status === 'rejected' && state.words}
      {state.status === 'unknown' && asked && (
        <>
          {`Not confirmed: ${answeredWords(asked)}. `}
          <button type="button" className="text-button" onClick={props.onRetry}>
            Try again
          </button>
        </>
      )}
      {state.status === 'done' && asked && answeredWords(asked)}
    </p>
  )
}

/**
 * Accept or Decline for one proposal, at the revision read (A08), for those the brief lets decide. A new direction is
 * decided in the brief, where it shows what it replaces; a stale proposal can't be accepted as it is: each says so.
 */
function DecideHere(props: {
  decision: MissionDecision
  can: boolean
  busy: boolean
  onAnswer: (args: DecideArgs, statement: string) => void
}) {
  const { decision: d, busy, onAnswer } = props
  if (!props.can) return null
  if (d.kind === 'mission') return <span className="conv-decide-note">A new direction: decided in the brief.</span>
  if (!decidableHere(d)) {
    return <span className="conv-decide-note">The direction changed since: it can’t be accepted as it is.</span>
  }
  const answer = (decision: DecideArgs['decision']) => {
    if (!busy) onAnswer({ decisionId: d.id, revision: d.revision, decision }, d.statement)
  }
  return (
    <span className="conv-decide">
      <button type="button" className="pill" aria-disabled={busy || undefined} onClick={() => answer('accept')}>
        Accept
      </button>
      <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => answer('reject')}>
        Decline
      </button>
    </span>
  )
}
