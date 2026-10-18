// What a report was made for (docs/plans/report-origin.md): the research task that made the version (its trigger), the
// goal that task served, a press that opens it in Goals, and what was asked. It reads only what is served; without a
// trigger, a task read, or a goal the project holds, it says less, never an error. Where the report covers the page (a
// phone, the full page) the press closes it before opening Goals, as a source's origin does (Codex P2 on #383).
import { useQueryClient } from '@tanstack/react-query'
import type { ArtifactVersion, Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { useProjectGo } from '../studio/project-go.tsx'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { TaskRefused } from './TaskRefused.tsx'
import { useOwnedTaskDetail } from './task-detail.ts'
import { useDocumentViewer } from './viewer-context.ts'

export function ReportOrigin({ version, identity }: { version: ArtifactVersion; identity: Identity }) {
  const taskId = version.trigger?.taskId
  // The origin task's own refusal (task-detail-read.ts) withholds its private instruction and goal link.
  const { query: task, refused } = useOwnedTaskDetail({
    queryKey: ['native-task-origin', version.projectId, taskId, identity.name],
    projectId: version.projectId,
    taskId,
    identity,
    staleTime: Infinity,
    retry: 1,
  })
  const snapshot = useQueryClient().getQueryData<Snapshot>(snapshotKey(version.projectId, identity.name))
  const go = useProjectGo()
  const viewer = useDocumentViewer()
  if (refused && taskId) return <TaskRefused projectId={version.projectId} taskId={taskId} identity={identity} />
  const data = task.data
  if (!data) return null
  const goal = snapshot?.goals.find((g) => g.id === data.task.goalId)
  const asked = data.instruction.trim()
  if (!goal && !asked) return null
  return (
    <div className="report-origin" role="group" aria-label="What it was made for">
      {goal && go && viewer && (
        <span className="report-origin-goal">
          <span className="report-origin-label">Made for</span>
          <button
            type="button"
            className="text-button"
            onClick={() => viewer.leaveFor(() => go({ view: 'goals', goalId: goal.id }))}
          >
            {goal.title}
          </button>
        </span>
      )}
      {asked && (
        <span className="report-origin-asked" title={asked}>
          <span className="report-origin-label">Asked</span> {asked}
        </span>
      )}
    </div>
  )
}
