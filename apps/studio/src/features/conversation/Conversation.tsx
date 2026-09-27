// The Converse lens: the project's recent discussion, the composer, and one explicit way to ask Sophia's runtime
// for a brief from points the person chooses (editors and admins only; viewers discuss and read). Discussion never
// starts work: only "Draft a brief" admits a task, once per click, retried with the same key after no reply.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { DiscussionEntry, NativeTaskReceipt, NativeTaskRequest, Snapshot } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { admitNativeTask } from '../../api/conversation.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { canInvite, useMembership } from '../access/useAccess.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { Composer } from './Composer.tsx'
import { authorLabel, currentTask, liveInputs, MAX_BRIEF_INPUTS, toggleInput } from './conversation-view.ts'
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
  const role = useMembership(projectId, identity.name, identity.token).data
  const canAct = canInvite(role)
  const [picked, setPicked] = useState<string[]>([])
  const discussion = snapshot?.discussion ?? []
  const selected = liveInputs(picked, discussion)
  const task = currentTask(snapshot?.work ?? [])
  return (
    <div className="conversation">
      <Discussion
        entries={discussion.slice(-6)}
        me={role?.actorId ?? ''}
        names={names}
        selected={canAct ? selected : null}
        onToggle={(id) => setPicked(toggleInput(selected, id))}
      />
      {canAct && snapshot && (
        <BriefRequest
          projectId={projectId}
          identity={identity}
          snapshot={snapshot}
          inputs={selected}
          onAdmitted={() => setPicked([])}
        />
      )}
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
  /** The chosen brief inputs, or null when this person cannot ask for a brief. */
  selected: readonly string[] | null
  onToggle: (id: string) => void
}

function Discussion({ entries, me, names, selected, onToggle }: DiscussionProps) {
  // Nothing said yet: the composer's own invitation is enough, and the room keeps its space for Sophia's line.
  if (entries.length === 0) return null
  return (
    <ol className="discussion" aria-label="Recent discussion">
      {entries.map((entry) => (
        <li key={entry.id} className="contribution">
          <span className="contribution-author">{authorLabel(entry.actorId, me, names)}</span>
          <span className="contribution-text">{entry.text}</span>
          {selected && (
            <label className="contribution-pick">
              <input type="checkbox" checked={selected.includes(entry.id)} onChange={() => onToggle(entry.id)} />
              <span className="sr-only">Use in the brief</span>
            </label>
          )}
        </li>
      ))}
    </ol>
  )
}

interface BriefProps {
  projectId: string
  identity: Identity
  snapshot: Snapshot
  inputs: readonly string[]
  onAdmitted: () => void
}

const DEFAULT_INSTRUCTION = 'Draft an implementation brief from the points we chose.'

function BriefRequest({ projectId, identity, snapshot, inputs, onAdmitted }: BriefProps) {
  const queryClient = useQueryClient()
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION)
  // The whole request is the admission's argument: Try again after an unknown outcome resends exactly what was
  // sent under the same key, whatever was typed or changed since (the server would refuse anything else).
  const admission = useAdmission<NativeTaskRequest, NativeTaskReceipt>(async (key, request) => {
    try {
      return await admitNativeTask(identity.token, projectId, key, request)
    } finally {
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  })
  const busy = admission.state.status === 'sending'
  const ask = async () => {
    const request: NativeTaskRequest = {
      kind: 'draft_brief',
      instruction,
      contributionIds: [...inputs],
      expectedMissionRevision: snapshot.missionRevision,
    }
    if (await admission.submit(request)) onAdmitted()
  }
  return (
    <div className="brief-request">
      <label htmlFor="brief-instruction" className="sr-only">
        What the brief should do
      </label>
      <input
        id="brief-instruction"
        value={instruction}
        maxLength={4000}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <button type="button" className="pill" disabled={busy || instruction.trim() === ''} onClick={() => void ask()}>
        Draft a brief{inputs.length > 0 ? ` from ${inputs.length}` : ''}
      </button>
      <span className="muted">Tick up to {MAX_BRIEF_INPUTS} points to include.</span>
      {admission.state.status === 'unknown' && (
        <span>
          <Tag tone="amber">Not confirmed</Tag>
          <button type="button" className="text-button" onClick={() => void admission.retry()}>
            Try again
          </button>
        </span>
      )}
      {admission.state.status === 'rejected' && <Tag tone="rose">{admission.state.error.message}</Tag>}
    </div>
  )
}
