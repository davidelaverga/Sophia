// A project's human tasks (A39, docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md; #365 section 3). Reads run as the
// reader (withActor, sophia_api) under row security; a task's origin is a link only, decided here for THIS reader on
// every read: it is shown while its version is published and its source ready and readable by them (the source rule,
// 0002), and otherwise only as unavailable, with nothing of the source: no id, place, title, words or hash. Writes go
// through 0074's functions (D-TASKS, compare-and-set, once per key) and the task is then read back for the writer, so a
// retry never answers stored source data.
import type pg from 'pg'
import type {
  ProjectTask,
  ProjectTaskDoneRequest,
  ProjectTaskList,
  ProjectTaskOwnerRequest,
  ProjectTaskRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'

/** Tasks per page of a project's list; a report's list holds at most REPORT_TASKS. */
export const TASK_PAGE = 50
export const REPORT_TASKS = 100

/**
 * The origin's report and version, joined only when this reader may read its source now: a published version
 * (stable or superseded) of this project, its source ready, and theirs or the project's released and eligible.
 */
const ORIGIN = `LEFT JOIN LATERAL (
    SELECT a.id AS artifact_id, v.id AS version_id, v.version_number, a.title
      FROM sophia.artifact_versions v
      JOIN sophia.artifacts a ON a.project_id = v.project_id AND a.id = v.artifact_id AND a.format = 'markdown'
      JOIN sophia.source_objects s ON s.project_id = v.project_id AND s.id = v.source_id
     WHERE t.origin_version_id IS NOT NULL AND v.project_id = t.project_id AND v.artifact_id = t.origin_artifact_id
       AND v.id = t.origin_version_id AND v.state IN ('stable', 'superseded') AND s.state = 'ready'
       AND (s.owner_id = sophia.actor_id() OR (s.scope = 'project' AND s.eligible))) o ON true`

/** A task's creation in microseconds, as its cursor keeps it. */
const US = `(extract(epoch FROM t.created_at) * 1000000)::bigint`

/** A task's columns for its reader: the place in the origin only with the origin available. */
const COLUMNS = `t.id, t.project_id, t.title, t.owner_id, sophia.actor_label(t.project_id, t.owner_id, NULL) AS owner_name,
  t.state, t.revision, t.created_by, sophia.actor_label(t.project_id, t.created_by, NULL) AS created_by_name,
  t.created_at, ${US}::text AS created_us,
  t.done_by, sophia.actor_label(t.project_id, t.done_by, NULL) AS done_by_name, t.done_at,
  t.origin_version_id IS NOT NULL AS has_origin, o.artifact_id AS origin_artifact, o.version_id AS origin_version,
  o.version_number AS origin_number, o.title AS origin_title,
  CASE WHEN o.version_id IS NOT NULL THEN t.origin_block END AS origin_block,
  CASE WHEN o.version_id IS NOT NULL THEN t.origin_word END AS origin_word,
  CASE WHEN o.version_id IS NOT NULL THEN t.origin_count END AS origin_count`

/** Open ones first, then newest first. */
const ORDER = `(t.state = 'done'), t.created_at DESC, t.id DESC`

interface TaskRow {
  id: string
  project_id: string
  title: string
  owner_id: string | null
  owner_name: string | null
  state: 'open' | 'done'
  revision: string
  created_by: string
  created_by_name: string | null
  created_at: Date
  created_us: string
  done_by: string | null
  done_by_name: string | null
  done_at: Date | null
  has_origin: boolean
  origin_artifact: string | null
  origin_version: string | null
  origin_number: number | null
  origin_title: string | null
  origin_block: number | null
  origin_word: number | null
  origin_count: number | null
}

/** The origin as this reader may see it: a link while available, else only that it is unavailable. */
function originOf(r: TaskRow): ProjectTask['origin'] {
  if (!r.has_origin) return null
  if (r.origin_artifact === null || r.origin_version === null || r.origin_title === null) return { available: false }
  return {
    available: true,
    artifactId: r.origin_artifact,
    versionId: r.origin_version,
    versionNumber: r.origin_number,
    title: r.origin_title,
    at: { block: Number(r.origin_block), word: Number(r.origin_word), count: Number(r.origin_count) },
  }
}

const toTask = (r: TaskRow): ProjectTask => ({
  taskId: r.id,
  projectId: r.project_id,
  title: r.title,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  state: r.state,
  revision: Number(r.revision),
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  createdAt: r.created_at.toISOString(),
  doneBy: r.done_by,
  doneByName: r.done_by_name,
  doneAt: r.done_at?.toISOString() ?? null,
  origin: originOf(r),
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BIGINT_MAX = 9223372036854775807n

/** The keyset of a page's last task: done or not, its creation in microseconds, its id. */
const encodeCursor = (r: TaskRow) =>
  Buffer.from(`${r.state === 'done' ? '1' : '0'}.${r.created_us}.${r.id}`).toString('base64url')

function decodeCursor(cursor: string): { done: boolean; us: string; id: string } {
  const [done, us, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('.')
  const known =
    rest.length === 0 &&
    (done === '0' || done === '1') &&
    us !== undefined &&
    /^[0-9]{1,19}$/.test(us) &&
    BigInt(us) <= BIGINT_MAX &&
    id !== undefined &&
    UUID.test(id)
  if (!known) throw new DomainError('invalid_request', 'Unknown cursor')
  return { done: done === '1', us, id }
}

/** Whether the project is this reader's (RLS: an active member's). */
async function isMine(c: pg.PoolClient, projectId: string): Promise<boolean> {
  const { rows } = await c.query(`SELECT 1 FROM sophia.projects WHERE id = $1`, [projectId])
  return rows.length > 0
}

/**
 * A cursor of this project's list: its task must be one of the project's (finding 4319532308). Another list's cursor,
 * even one this reader may read, is refused as unknown, never used as this list's boundary; its format is unchanged.
 * Tasks are not deleted, so a page's last task stays the project's.
 */
async function projectCursor(c: pg.PoolClient, projectId: string, cursor: string) {
  const after = decodeCursor(cursor)
  const { rows } = await c.query(`SELECT 1 FROM sophia.project_tasks WHERE project_id = $1 AND id = $2`, [
    projectId,
    after.id,
  ])
  if (rows.length === 0) throw new DomainError('invalid_request', 'Unknown cursor')
  return after
}

/** listProjectTasks (A39): a page, open first, newest first. Null when the project isn't the reader's. */
export async function readProjectTasks(
  c: pg.PoolClient,
  projectId: string,
  cursor: string | null,
): Promise<ProjectTaskList | null> {
  if (!(await isMine(c, projectId))) return null
  const after = cursor === null ? null : await projectCursor(c, projectId, cursor)
  const { rows } = await c.query<TaskRow>(
    `SELECT ${COLUMNS} FROM sophia.project_tasks t ${ORIGIN}
      WHERE t.project_id = $1
        AND ($2::boolean IS NULL OR (t.state = 'done') > $2::boolean OR ((t.state = 'done') = $2::boolean
            AND (${US} < $3::bigint OR (${US} = $3::bigint AND t.id < $4::uuid))))
      ORDER BY ${ORDER} LIMIT ${String(TASK_PAGE + 1)}`,
    [projectId, after?.done ?? null, after?.us ?? null, after?.id ?? null],
  )
  const page = rows.slice(0, TASK_PAGE)
  const last = page.at(-1)
  return { tasks: page.map(toTask), next: rows.length > TASK_PAGE && last ? encodeCursor(last) : null }
}

/** getProjectTask (A39): one task, for this reader now. Null when the project isn't the reader's; not_found if no task. */
export async function readProjectTask(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
): Promise<ProjectTask | null> {
  if (!(await isMine(c, projectId))) return null
  const { rows } = await c.query<TaskRow>(
    `SELECT ${COLUMNS} FROM sophia.project_tasks t ${ORIGIN} WHERE t.project_id = $1 AND t.id = $2`,
    [projectId, taskId],
  )
  const r = rows[0]
  if (!r) throw new DomainError('not_found', 'Task not found')
  return toTask(r)
}

/**
 * listReportTasks (A39): the tasks whose origin is this report AND is available to this reader now, open first, newest
 * first; a task whose origin they may not read is not listed, so nothing says it is linked. not_found if the report
 * isn't theirs to see.
 */
export async function readReportTasks(c: pg.PoolClient, artifactId: string): Promise<ProjectTaskList> {
  const { rows: report } = await c.query<{ project_id: string }>(
    `SELECT project_id FROM sophia.artifacts WHERE id = $1 AND format = 'markdown'`,
    [artifactId],
  )
  const project = report[0]?.project_id
  if (!project) throw new DomainError('not_found', 'Report not found')
  const { rows } = await c.query<TaskRow>(
    `SELECT ${COLUMNS} FROM sophia.project_tasks t ${ORIGIN}
      WHERE t.project_id = $1 AND t.origin_artifact_id = $2 AND o.version_id IS NOT NULL
      ORDER BY ${ORDER} LIMIT ${String(REPORT_TASKS)}`,
    [project, artifactId],
  )
  return { tasks: rows.map(toTask), next: null }
}

/** What a write answers before its task is read back: the task, its revision, the event cursor. */
interface TaskReceipt {
  taskId: string
  revision: number
  cursor: string
}

function receiptOf(value: unknown): TaskReceipt {
  if (typeof value !== 'object' || value === null || !('taskId' in value) || typeof value.taskId !== 'string') {
    throw new DomainError('unavailable', 'A task write without its receipt')
  }
  const r: Record<string, unknown> = { ...value }
  return { taskId: value.taskId, revision: Number(r.revision), cursor: String(r.cursor) }
}

/** createProjectTask (A39), once per key; the task read back for the writer. Call inside withActor(..., "write"). */
export async function createProjectTask(
  c: pg.PoolClient,
  projectId: string,
  key: string,
  request: ProjectTaskRequest,
): Promise<ProjectTask> {
  const { rows } = await c.query<{ r: unknown }>(`SELECT sophia.create_project_task($1, $2, $3::jsonb) AS r`, [
    projectId,
    key,
    JSON.stringify({ title: request.title, ownerId: request.ownerId ?? null, origin: request.origin ?? null }),
  ])
  return readBack(c, projectId, receiptOf(rows[0]?.r).taskId)
}

/** setTaskOwner (A39), against the revision shown; the task read back. Call inside withActor(..., "write"). */
export async function setProjectTaskOwner(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
  request: ProjectTaskOwnerRequest,
): Promise<ProjectTask> {
  await c.query(`SELECT sophia.set_project_task_owner($1, $2, $3, $4)`, [
    projectId,
    taskId,
    request.ownerId,
    request.expectedRevision,
  ])
  return readBack(c, projectId, taskId)
}

/** finishProjectTask (A39), once per key, against the revision shown; the task read back. Inside withActor write. */
export async function finishProjectTask(
  c: pg.PoolClient,
  projectId: string,
  taskId: string,
  key: string,
  request: ProjectTaskDoneRequest,
): Promise<ProjectTask> {
  await c.query(`SELECT sophia.finish_project_task($1, $2, $3, $4)`, [projectId, taskId, key, request.expectedRevision])
  return readBack(c, projectId, taskId)
}

/** The task as its writer reads it now (their RLS and source rule), never what a receipt kept. */
async function readBack(c: pg.PoolClient, projectId: string, taskId: string): Promise<ProjectTask> {
  const task = await readProjectTask(c, projectId, taskId)
  if (!task) throw new DomainError('forbidden', 'Not permitted')
  return task
}
