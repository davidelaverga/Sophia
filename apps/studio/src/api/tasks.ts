// A project's human tasks (A39, docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md): served through the generated parsers
// under the tasks flag; under the vision flag, the A17 proposal the fixture pages answer (api/vision.ts). A served task
// is read as the Studio's ProjectTask: its passage a link only (no quote is sent or kept), none, or unavailable to this
// reader; its revision kept, which owner changes and Done are compared against.
import type { ProjectTask as ServedTask, ProjectTaskList } from '@sophia/contracts'
import { parseProjectTask, parseProjectTaskList } from '@sophia/contracts/validate'
import { TASKS } from '../app/tasks.ts'
import { VISION } from '../app/vision.ts'
import { locatorParam, readLocator } from '../features/artifacts/passage-link.ts'
import { PASSAGE_PARAM } from '../features/artifacts/report-link.ts'
import { callApi } from './client.ts'
import * as proposed from './vision.ts'
import type { ProjectTask, TaskAsk } from './vision.ts'

/** A39's tasks are served (the tasks flag), and the vision flag's proposal isn't answered instead. */
export const SERVED_TASKS = TASKS && !VISION

/** Tasks are offered: served (A39), or proposed on the fixture pages (A17). */
export const TASKABLE = TASKS || VISION

/** A39's task as the Studio reads it. */
export const shownTask = (t: ServedTask): ProjectTask => ({
  taskId: t.taskId,
  text: t.title,
  owner: t.ownerId,
  ownerName: t.ownerName,
  from: fromOf(t.origin),
  by: t.createdBy,
  at: t.createdAt,
  doneBy: t.doneBy,
  doneAt: t.doneAt,
  revision: t.revision,
})

function fromOf(origin: ServedTask['origin']): ProjectTask['from'] {
  if (origin === null) return null
  if (!origin.available || !origin.artifactId || !origin.versionId || !origin.at) return 'unavailable'
  return {
    artifactId: origin.artifactId,
    versionId: origin.versionId,
    versionNumber: origin.versionNumber ?? null,
    passage: locatorParam(origin.at),
    quote: null,
  }
}

const shownList = (list: ProjectTaskList) => ({ tasks: list.tasks.map(shownTask), next: list.next })

const project = (projectId: string): `/api/${string}` => `/api/v1/projects/${projectId}/tasks`

/** A report's tasks whose passage this reader may follow now; the proposal's, on the fixture pages. */
export const listReportTasks = (token: string, artifactId: string, signal?: AbortSignal) =>
  SERVED_TASKS
    ? callApi(`/api/v1/artifacts/${artifactId}/tasks`, { token, method: 'GET', ...(signal ? { signal } : {}) }, (v) =>
        shownList(parseProjectTaskList(v)),
      )
    : proposed.listTasks(token, artifactId, signal)

/** A39: the project's tasks, open first, newest first, a page from `cursor`. */
export const listProjectTasks = (token: string, projectId: string, cursor: string | null, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/tasks${cursor ? `?${new URLSearchParams({ cursor }).toString()}` : ''}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    (v) => shownList(parseProjectTaskList(v)),
  )

/** A39: one task, read for this member now (a deep link's). */
export const getProjectTask = (token: string, projectId: string, taskId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/tasks/${taskId}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    (v) => shownTask(parseProjectTask(v)),
  )

/**
 * A new task, once per key. Served: the member's words, whom for, and the passage as a link (its version and place);
 * the passage's words never leave the page.
 */
export function createTask(token: string, projectId: string, key: string, ask: TaskAsk): Promise<ProjectTask> {
  if (!SERVED_TASKS) return proposed.createTask(token, projectId, key, ask)
  const from = ask.from
  const place = from ? readLocator(`?${PASSAGE_PARAM}=${encodeURIComponent(from.passage)}`) : null
  const origin = from && place ? { artifactId: from.artifactId, versionId: from.versionId, ...place } : null
  return callApi(project(projectId), { token, key, body: { title: ask.text, ownerId: ask.owner, origin } }, (v) =>
    shownTask(parseProjectTask(v)),
  )
}

/** Done, once per key; served, against the revision shown. */
export const finishTask = (
  token: string,
  projectId: string,
  task: Pick<ProjectTask, 'taskId' | 'revision'>,
  key: string,
): Promise<ProjectTask> =>
  SERVED_TASKS
    ? callApi(
        `/api/v1/projects/${projectId}/tasks/${task.taskId}/done`,
        { token, key, body: { expectedRevision: task.revision ?? 0 } },
        (v) => shownTask(parseProjectTask(v)),
      )
    : proposed.finishTask(token, projectId, task.taskId, key)

/** A39: claim, assign, reassign or release (editors and admins), against the revision shown. */
export const setTaskOwner = (token: string, projectId: string, task: ProjectTask, ownerId: string | null) =>
  callApi(
    `/api/v1/projects/${projectId}/tasks/${task.taskId}/owner`,
    { token, method: 'PUT', body: { ownerId, expectedRevision: task.revision ?? 0 } },
    (v) => shownTask(parseProjectTask(v)),
  )
