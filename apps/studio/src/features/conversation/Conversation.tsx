// The Converse lens: the mission as it stands (SMC-M01), the project's recent discussion, the brief still in motion
// from before briefs were retired, and the composer. Nothing here asks anyone to fill in a brief: the mission view reads
// what the team and Sophia recorded, and talking is the primary way in. Discussion never starts work.
import type { DiscussionEntry, Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMembership } from '../access/useAccess.ts'
import { MissionPanel } from '../mission/MissionPanel.tsx'
import { Composer } from './Composer.tsx'
import { authorLabel, currentTask } from './conversation-view.ts'
import { TaskCard } from './TaskCard.tsx'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  /** Names the room knows, by identity: the snapshot carries actor ids only. */
  names: ReadonlyMap<string, string>
  draft: string
  onDraft: (text: string) => void
}

export function Conversation({ projectId, identity, snapshot, names, draft, onDraft }: Props) {
  const me = useMembership(projectId, identity.name, identity.token).data?.actorId ?? ''
  const discussion = snapshot?.discussion ?? []
  const task = currentTask(snapshot?.work ?? [])
  return (
    <div className="conversation">
      <MissionPanel projectId={projectId} identity={identity} cursor={snapshot?.cursor} me={me} names={names} />
      <Discussion entries={discussion.slice(-6)} me={me} names={names} />
      {task && (
        <ol className="task-list">
          <TaskCard task={task} projectId={projectId} identity={identity} />
        </ol>
      )}
      <Composer projectId={projectId} identity={identity} draft={draft} onDraft={onDraft} />
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
