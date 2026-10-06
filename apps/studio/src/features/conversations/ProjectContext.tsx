// The project's context beside its conversations (docs/plans/project-conversations.md): the accepted mission, the
// newest accepted decisions, and what is proposed and not decided, kept apart. It is the brief Sophia reads
// (MissionContext, the same read and cache as the room's mission panel), the same for every conversation.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { getMission } from '../../api/mission.ts'
import type { MissionContext } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { missionKey } from '../mission/mission-view.ts'
import { acceptedOf, pendingOf } from './conversation-list.ts'

interface Props {
  projectId: string
  identity: Identity
  cursor: string | undefined
}

export function ProjectContext({ projectId, identity, cursor }: Props) {
  const read = useQuery({
    queryKey: [...missionKey(projectId), identity.name, cursor],
    queryFn: () => getMission(identity.token, projectId),
    placeholderData: keepPreviousData,
    retry: 1,
  })
  const ctx = read.data
  if (!ctx) {
    return (
      <aside className="conv-context" aria-label="Project context">
        <h3 className="eyebrow">Project context</h3>
        {read.isError && (
          <p className="conv-note" role="alert">
            The project’s context can’t be read now.{' '}
            <button type="button" className="text-button" onClick={() => void read.refetch()}>
              Try again
            </button>
          </p>
        )}
      </aside>
    )
  }
  return (
    <aside className="conv-context" aria-label="Project context">
      <h3 className="eyebrow">Project context</h3>
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
      <p className="conv-note">The same for every conversation here.</p>
    </aside>
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
