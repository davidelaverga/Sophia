// A native task (A05) as the team sees it: its observed phase, and once captured, the drafted brief with the model
// that produced it. The brief is a candidate for review; Hold and Stop live on its goal (WorkControls).
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { NativeTask, NativeTaskDetail } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { briefBlocks, TASK_PHASE } from './conversation-view.ts'

interface Props {
  task: NativeTask
  projectId: string
  identity: Identity
}

export function TaskCard({ task, projectId, identity }: Props) {
  const [open, setOpen] = useState(false)
  const phase = TASK_PHASE[task.phase]
  return (
    <li className="task" data-phase={task.phase}>
      <div className="goal-meta">
        <Tag tone={phase.tone}>{phase.label}</Tag>
        <span className="muted">Implementation brief</span>
      </div>
      <p className="goal-outcome">{task.reason ?? phase.note}</p>
      {task.resultSourceId && (
        <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide the brief' : 'Read the brief'}
        </button>
      )}
      {open && (
        <BriefDetail taskId={task.id} projectId={projectId} identity={identity} revision={task.resultSourceId} />
      )}
    </li>
  )
}

function BriefDetail({
  taskId,
  projectId,
  identity,
  revision,
}: {
  taskId: string
  projectId: string
  identity: Identity
  revision: string | null
}) {
  const detail = useQuery({
    // The result source id is part of the key: a new result is a new read.
    queryKey: ['native-task', projectId, taskId, revision, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, taskId),
  })
  if (detail.isPending) return <p className="muted">Loading the brief…</p>
  if (detail.isError || !detail.data.result) return <p className="muted">The brief couldn’t be loaded.</p>
  return <BriefView result={detail.data.result} />
}

function BriefView({ result }: { result: NonNullable<NativeTaskDetail['result']> }) {
  const by = [result.provider, result.model].filter(Boolean).join(' / ') || 'a model the runtime did not name'
  return (
    <article className="brief" aria-label="Drafted brief">
      <p className="brief-note">
        <Tag tone="lav">Candidate</Tag> Drafted by {by}. For the team to review; not an accepted plan.
      </p>
      {briefBlocks(result.markdown).map((block, i) => {
        if (block.kind === 'heading') return <h4 key={i}>{block.text}</h4>
        if (block.kind === 'item')
          return (
            <p key={i} className="brief-item">
              • {block.text}
            </p>
          )
        return <p key={i}>{block.text}</p>
      })}
      <p className="brief-source muted">Source {result.sha256.slice(0, 12)}</p>
    </article>
  )
}
