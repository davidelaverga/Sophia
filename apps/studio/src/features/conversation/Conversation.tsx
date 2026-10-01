// The chat: the project's recent discussion and the typed conversation with Sophia, newest at the bottom, then the
// composer. It lives in the room's side panel (StudioShell), as meeting apps have it, so the stage keeps Sophia's
// light and the people at its centre. Discussion never starts work.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { DiscussionEntry, Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { Composer } from './Composer.tsx'
import { authorLabel } from './conversation-view.ts'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  /** This viewer's actor id, so their own lines say "You". */
  me: string
  /** Names the room knows, by identity: the snapshot carries actor ids only. */
  names: ReadonlyMap<string, string>
  room: ProjectRoom
  draft: string
  onDraft: (text: string) => void
}

/** Opening the panel (or resizing it) keeps the newest line in view while the reader follows along. */
function useFollowOnResize(history: RefObject<HTMLDivElement | null>, following: RefObject<boolean>) {
  useEffect(() => {
    const el = history.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [history, following])
}

export function Conversation({ projectId, identity, snapshot, me, names, room, draft, onDraft }: Props) {
  const discussion = snapshot?.discussion ?? []
  const history = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useLayoutEffect(() => {
    if (history.current && following.current) history.current.scrollTop = history.current.scrollHeight
  }, [room.chat, snapshot?.discussion])
  useFollowOnResize(history, following)
  const onScroll = () => {
    const el = history.current
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
  }
  const empty = discussion.length === 0 && room.chat.length === 0
  return (
    <div className="conversation">
      <div className="conversation-history" ref={history} onScroll={onScroll}>
        {empty && <p className="chat-empty">Messages stay in this conversation. Notes live in the brief.</p>}
        <Discussion entries={discussion} me={me} names={names} />
        {room.chat.length > 0 && (
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
        )}
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
  )
}

interface DiscussionProps {
  entries: readonly DiscussionEntry[]
  me: string
  names: ReadonlyMap<string, string>
}

function Discussion({ entries, me, names }: DiscussionProps) {
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
