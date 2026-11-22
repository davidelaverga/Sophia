import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client.ts'
import {
  getExploreSession,
  parseExploreAction,
  sendExploreAction,
  type ExploreAction,
  type ExploreScope,
  type ExploreSession,
  type ExploreTurn,
} from '../../api/managed-explore.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { keepTabDrafts, readTabDrafts, type HeldAt } from '../../app/held-in-tab.ts'
import { DirectionOptions } from './DirectionOptions.tsx'
import { PrototypeReview } from './PrototypeReview.tsx'
import { useExploreAdmission } from './useExploreAdmission.ts'
import './managed-explore.css'

const active = (turn: ExploreTurn) => ['queued', 'running', 'retaining', 'outcome_unknown'].includes(turn.status)
const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status)
const TURN_STATUS: Record<ExploreTurn['status'], string | null> = {
  queued: 'Queued',
  running: 'Working',
  retaining: 'Saving prototype',
  completed: null,
  failed: 'Failed',
  cancelled: 'Cancelled',
  outcome_unknown: 'Checking build status',
}
function Turn({ turn }: { turn: ExploreTurn }) {
  const status =
    turn.status === 'running' && (turn.kind === 'prototype' || turn.kind === 'revision')
      ? 'Building prototype'
      : TURN_STATUS[turn.status]
  return (
    <li className="explore-turn">
      <p>
        <strong>You</strong>
        <span>{turn.instruction}</span>
      </p>
      {status && (
        <p className="explore-turn-status">
          <strong>{status}</strong>
          {turn.error && <span>{turn.error}</span>}
        </p>
      )}
      {turn.reply && (
        <p>
          <strong>Codex</strong>
          <span>{turn.reply}</span>
        </p>
      )}
    </li>
  )
}

interface Props {
  scope: ExploreScope
  account: string
  sessionId: string
  visible: boolean
  contentOrigin: string
  call: ReactNode
  onBack: () => void
  onRoom: () => void
}

function useSession({ scope, account, sessionId, visible }: Props) {
  const read = useQuery({
    queryKey: ['explore-session', account, scope.projectId, sessionId],
    queryFn: ({ signal }) => getExploreSession(scope, sessionId, signal),
    enabled: visible,
    retry: false,
    gcTime: 0,
    refetchInterval: ({ state }) => (denied(state.error) ? false : state.data?.turns.some(active) ? 1800 : 15_000),
  })
  const at: HeldAt = {
    account,
    part: 'managed-explore',
    project: JSON.stringify([scope.projectId, 'session', sessionId]),
  }
  const admission = useExploreAdmission(at, parseExploreAction, async (key, action) => {
    try {
      return await sendExploreAction(scope, sessionId, action, key)
    } finally {
      await read.refetch()
    }
  })
  return { read, admission, at, authorizationLost: denied(read.error) }
}

function ExploreHeader({
  visible,
  funding,
  onRoom,
  onBack,
  call,
}: Pick<Props, 'visible' | 'onRoom' | 'onBack' | 'call'> & { funding: string | undefined }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!visible) return undefined
    const frame = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [visible])
  return (
    <header className="managed-explore-head">
      <div>
        <h2 ref={heading} tabIndex={-1}>
          Explore with Codex
        </h2>
        {funding && <p>{funding}</p>}
      </div>
      <div className="managed-explore-call">{call}</div>
      <div className="managed-explore-nav">
        <button type="button" className="pill explore-back-room" onClick={onRoom}>
          Room
        </button>
        <button type="button" className="pill" onClick={onBack}>
          Back to Brief
        </button>
      </div>
    </header>
  )
}

function SessionNotice({ read, admission, authorizationLost }: ReturnType<typeof useSession>) {
  const slow = useSlow(read.isPending || admission.state.status === 'sending')
  if (read.isPending)
    return (
      <p className="explore-read-note" role="status">
        {slow ? SLOW_NOTE : 'Opening Explore…'}
      </p>
    )
  if (read.isError)
    return (
      <p className="explore-read-note" role="status">
        {authorizationLost ? 'This Explore session is unavailable.' : 'Checking Explore status.'}{' '}
        <button type="button" className="text-button" onClick={() => void read.refetch()}>
          Check again
        </button>
      </p>
    )
  switch (admission.state.status) {
    case 'sending':
      return (
        <p className="explore-read-note" role="status">
          {slow ? SLOW_NOTE : 'Sending to Sophia…'}
        </p>
      )
    case 'unknown':
      return (
        <div className="explore-read-note" role="status">
          Checking the last request.{' '}
          <button type="button" className="text-button" onClick={() => void admission.retry()}>
            Retry same request
          </button>
        </div>
      )
    case 'rejected':
      return (
        <p className="explore-read-note" role="status">
          {admission.state.error.message}
        </p>
      )
    case 'done':
    case 'idle':
      break
  }
  return null
}

export function ManagedExploreSession(props: Props) {
  const state = useSession(props)
  const { read, admission, at, authorizationLost } = state
  const session = authorizationLost ? undefined : read.data
  const canSend = read.isSuccess && admission.state.status !== 'unknown' && admission.state.status !== 'sending'
  return (
    <aside className="managed-explore" aria-label="Explore workspace" hidden={!props.visible} data-typing-scope>
      <ExploreHeader {...props} funding={session?.funding.label} />
      <SessionNotice {...state} />
      {session && (
        <ExploreWorkspace
          {...props}
          session={session}
          at={at}
          canSend={canSend}
          completed={admission.state.status === 'done' ? admission.state.args : null}
          onAction={(action) => void admission.submit(action)}
        />
      )}
    </aside>
  )
}

interface WorkspaceProps {
  session: ExploreSession
  scope: ExploreScope
  account: string
  at: HeldAt
  visible: boolean
  contentOrigin: string
  canSend: boolean
  completed: ExploreAction | null
  onAction: (action: ExploreAction) => void
}

type DiscussionProps = Pick<WorkspaceProps, 'session' | 'canSend' | 'onAction'>
const hasQueue = (session: ExploreSession) => session.turns.some(({ status }) => status === 'queued')

function ExploreComposer({
  at,
  session,
  canSend,
  onAction,
  completed,
}: DiscussionProps & Pick<WorkspaceProps, 'at' | 'completed'>) {
  const composerId = useId()
  const [draft, setDraft] = useState(() => {
    const kept = readTabDrafts(at)
    return typeof kept === 'string' ? kept : ''
  })
  const busy = !canSend || hasQueue(session)
  const { account, project } = at
  useEffect(() => {
    if (completed?.type !== 'turn' || completed.body.kind !== 'text') return
    setDraft((current) => {
      if (current.trim() !== completed.body.instruction) return current
      keepTabDrafts({ account, project, part: 'managed-explore' }, null)
      return ''
    })
  }, [account, completed, project])
  const sendText = () => {
    const instruction = draft.trim()
    if (busy || !instruction) return
    onAction({ type: 'turn', body: { kind: 'text', instruction, expectedSessionRevision: session.revision } })
  }
  return (
    <form
      className="explore-composer"
      onSubmit={(event) => {
        event.preventDefault()
        sendText()
      }}
    >
      <label htmlFor={composerId}>Message Codex</label>
      <div>
        <textarea
          id={composerId}
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(event) => {
            const text = event.target.value
            setDraft(text)
            keepTabDrafts(at, text || null)
          }}
        />
        <button className="pill primary" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </div>
    </form>
  )
}

function DirectionActions({ session, canSend, onAction }: DiscussionProps) {
  const busy = !canSend || hasQueue(session)
  const activeKinds = session.turns.filter(active).map(({ kind }) => kind)
  const chosen = session.directions.find(({ id }) => id === session.selectedDirectionId)
  const build = chosen && !session.versions.some(({ directionId }) => directionId === chosen.id)
  const expectedSessionRevision = session.revision
  const request = (kind: 'directions' | 'prototype', instruction: string, directionId?: string) =>
    onAction({
      type: 'turn',
      body: { kind, instruction, expectedSessionRevision, ...(directionId ? { directionId } : {}) },
    })
  return (
    <>
      {session.directions.length === 2 ? (
        <DirectionOptions
          directions={session.directions}
          selected={session.selectedDirectionId}
          disabled={!canSend}
          onSelect={(direction) =>
            onAction({
              type: 'select',
              body: {
                directionId: direction.id,
                expectedDirectionRevision: direction.revision,
                expectedSessionRevision,
              },
            })
          }
        />
      ) : (
        <button
          type="button"
          className="pill"
          disabled={busy || activeKinds.includes('directions')}
          onClick={() => request('directions', 'Show two distinct design directions for the saved brief.')}
        >
          Compare two directions
        </button>
      )}
      {build && (
        <button
          type="button"
          className="pill primary"
          disabled={busy || activeKinds.includes('prototype')}
          onClick={() => request('prototype', `Build the ${chosen.label} prototype.`, chosen.id)}
        >
          Build this prototype
        </button>
      )}
    </>
  )
}

function VersionHistory({
  session,
  viewed,
  onOpen,
}: {
  session: ExploreSession
  viewed: string | undefined
  onOpen: (id: string) => void
}) {
  if (!session.versions.length) return null
  const latest = Math.max(...session.versions.map(({ number }) => number))
  return (
    <nav className="explore-versions" aria-label="Prototype version history">
      <h3>Versions</h3>
      {session.versions.map((item) => {
        const approved = session.approvals.some(
          ({ versionId, manifestSha256 }) => versionId === item.id && manifestSha256 === item.manifestSha256,
        )
        return (
          <button
            type="button"
            key={item.id}
            className="pill"
            aria-current={item.id === viewed || undefined}
            onClick={() => onOpen(item.id)}
          >
            {item.id === viewed ? 'Viewing' : 'Open'} v{item.number}
            {item.number === latest ? ' · Latest' : ''}
            {approved ? ' · Approved' : ''}
          </button>
        )
      })}
    </nav>
  )
}

function ExploreWorkspace(props: WorkspaceProps) {
  const { session, visible, canSend } = props
  const [viewed, setViewed] = useState<string | null>(null)
  const [previewOnPhone, setPreviewOnPhone] = useState(false)
  const review = useRef<HTMLDivElement>(null)
  const discussion = useRef<HTMLDivElement>(null)
  const version = session.versions.find(({ id }) => id === viewed)
  const openVersion = (id: string) => {
    setViewed(id)
    setPreviewOnPhone(true)
    requestAnimationFrame(() => review.current?.focus({ preventScroll: true }))
  }
  const backToDiscussion = () => {
    setPreviewOnPhone(false)
    requestAnimationFrame(() => discussion.current?.focus({ preventScroll: true }))
  }
  return (
    <div
      className="explore-workspace"
      data-has-preview={!!version || undefined}
      data-phone-preview={(!!version && previewOnPhone) || undefined}
    >
      <section className="explore-discussion" aria-label="Codex discussion">
        <div className="explore-discussion-scroll" ref={discussion} tabIndex={-1}>
          <details className="explore-seed">
            <summary>Saved brief · revision {session.seed.revision}</summary>
            <blockquote>{session.seed.text}</blockquote>
          </details>
          <ol className="explore-turns" aria-label="Discussion with Codex">
            {session.turns.map((turn) => (
              <Turn key={turn.id} turn={turn} />
            ))}
          </ol>
          <DirectionActions {...props} />
          <VersionHistory session={session} viewed={version?.id} onOpen={openVersion} />
        </div>
        <ExploreComposer {...props} />
      </section>
      {version && (
        <div className="explore-review-scroll" ref={review} tabIndex={-1}>
          {visible && (
            <PrototypeReview
              {...props}
              key={version.id}
              version={version}
              disabled={!canSend}
              revisionBusy={hasQueue(session)}
              onDiscussion={backToDiscussion}
            />
          )}
        </div>
      )}
    </div>
  )
}
