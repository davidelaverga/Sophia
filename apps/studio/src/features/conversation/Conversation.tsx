// The Converse lens: the mission as it stands (SMC-M01), the project's recent discussion, the brief still in motion
// from before briefs were retired, and the composer. Nothing here asks anyone to fill in a brief: the mission view reads
// what the team and Sophia recorded, and talking is the primary way in. Discussion never starts work.
import { useLayoutEffect, useRef } from 'react'
import type { DiscussionEntry, Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { useMembership } from '../access/useAccess.ts'
import { LivingBrief } from '../mission/LivingBrief.tsx'
import { Composer } from './Composer.tsx'
import { authorLabel } from './conversation-view.ts'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  /** Names the room knows, by identity: the snapshot carries actor ids only. */
  names: ReadonlyMap<string, string>
  room: ProjectRoom
  draft: string
  onDraft: (text: string) => void
}

export function Conversation({ projectId, identity, snapshot, names, room, draft, onDraft }: Props) {
  const me = useMembership(projectId, identity.name, identity.token).data?.actorId ?? ''
  const discussion = snapshot?.discussion ?? []
  const history = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useLayoutEffect(() => {
    if (history.current && following.current) history.current.scrollTop = history.current.scrollHeight
  }, [room.chat, snapshot?.discussion])
  return (
    <div className="conversation-workspace">
      <LivingBrief projectId={projectId} identity={identity} cursor={snapshot?.cursor} me={me} names={names} />
      <div className="conversation">
        <div
          className="conversation-history"
          ref={history}
          onScroll={() => {
            const el = history.current
            if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
          }}
        >
          <Discussion entries={discussion} me={me} names={names} />
          <ol className="chat-messages" aria-label="Conversation with Sophia">
            {room.chat.map((turn) => (
              <li key={turn.id}>
                <div className="chat-message user">
                  <strong>You</strong>
                  <p>{turn.text}</p>
                </div>
                <div className="chat-message sophia">
                  <strong>Sophia</strong>
                  <p>
                    {turn.reply ||
                      (turn.state === 'sending' ? 'Sending…' : turn.state === 'responding' ? 'Thinking…' : '')}
                  </p>
                  {turn.reason && (
                    <p className="chat-status" role="status">
                      {turn.reason}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <Composer
          projectId={projectId}
          identity={identity}
          snapshot={snapshot}
          room={room}
          draft={draft}
          onDraft={onDraft}
        />
      </div>
    </div>
  )
}

interface DiscussionProps {
  entries: readonly DiscussionEntry[]
  me: string
  names: ReadonlyMap<string, string>
}

function Discussion({ entries, me, names }: DiscussionProps) {
  // Nothing said yet: the composer's own invitation is enough, and the room keeps its space for Sophia's line.
  if (entries.length === 0) return null
  return (
    <ol className="discussion" aria-label="Recent discussion">
      {entries.map((entry) => (
        <li key={entry.id} className="contribution">
          <span className="contribution-author">{authorLabel(entry.actorId, me, names)}</span>
          <span className="contribution-text">{entry.text}</span>
        </li>
      ))}
    </ol>
  )
}
