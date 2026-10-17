// A goal's reports (docs/plans/goal-reports.md): the current versions whose artifact one of the goal's tasks made, or
// whose trigger is one of its tasks; one per report, newest first. The snapshot carries the project's latest 50 tasks
// and each artifact's current version, so a goal lists what those tasks made. Pure.
import type { ArtifactVersion, NativeTask } from '@sophia/contracts'

export function goalReports(
  goalId: string,
  work: readonly NativeTask[],
  artifacts: readonly ArtifactVersion[],
): ArtifactVersion[] {
  const tasks = work.filter((t) => t.goalId === goalId)
  const made = new Set(tasks.flatMap((t) => (t.artifactId === undefined ? [] : [t.artifactId])))
  const ids = new Set(tasks.map((t) => t.id))
  const mine = artifacts.filter((v) => made.has(v.artifactId) || (v.trigger !== undefined && ids.has(v.trigger.taskId)))
  const one = [...new Map(mine.map((v) => [v.artifactId, v])).values()]
  return one.toSorted((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}
