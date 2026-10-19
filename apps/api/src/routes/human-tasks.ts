// A project's human tasks (A39, docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md; #365 section 3): list, read, create,
// assign and finish. Reads run as the member under row security; an unknown project and one they aren't an active
// member of look the same (403). Writes go through 0074's functions (D-TASKS), and every answer is the task read back
// for this member now, its origin decided for them. Nothing here admits, wakes or settles any work.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ProjectTaskDoneRequest, ProjectTaskOwnerRequest, ProjectTaskRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  createProjectTask,
  finishProjectTask,
  nameActor,
  readProjectTask,
  readProjectTasks,
  readReportTasks,
  setProjectTaskOwner,
  withActor,
} from '@sophia/persistence'
import { namesOf } from './profile.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

const taskParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    taskId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'taskId'],
} as const

const artifactParams = {
  type: 'object',
  additionalProperties: false,
  properties: { artifactId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['artifactId'],
} as const

const listQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { cursor: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,200}$' } },
} as const

/**
 * The Task writes these routes call, as 0077 left them (FND-C50): each locks the project before reading the current
 * actor, and a new origin must be a Markdown report. /ready requires it, and so does every Task write: until it is
 * installed a create, assignment or Done is refused (503) before any database write.
 */
export const TASK_WRITES = `(SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.proname IN ('create_project_task',
    'set_project_task_owner', 'finish_project_task') AND p.pronamespace = 'sophia'::regnamespace
    AND position('Locked first, then the current actor (0077)' IN p.prosrc) > 0) = 3
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proname = 'create_project_task'
    AND p.pronamespace = 'sophia'::regnamespace AND position('r.format=''markdown''' IN p.prosrc) > 0)`

/** Refuses a Task write until 0077 is installed; once it is, it stays admitted (a migration is never rolled back). */
function taskWriteAdmission(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (!installed) installed = (await pool.query<{ ok: boolean }>(`SELECT ${TASK_WRITES} AS ok`)).rows[0]?.ok === true
    if (!installed) throw new DomainError('unavailable', 'Tasks are not available yet')
  }
}

type TaskParams = { projectId: string; taskId: string }
type Keyed = { 'idempotency-key': string }

function readRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { projectId: string }; Querystring: { cursor?: string } }>(
    '/api/v1/projects/:projectId/tasks',
    { schema: { params: projectParams, querystring: listQuery, response: { 200: { $ref: 'ProjectTaskList#' } } } },
    async (req) => {
      const list = await withActor(pool, req.actorId, 'read', (c) =>
        readProjectTasks(c, req.params.projectId, req.query.cursor ?? null),
      )
      if (!list) throw new DomainError('forbidden', 'Not permitted')
      return list
    },
  )

  app.get<{ Params: TaskParams }>(
    '/api/v1/projects/:projectId/tasks/:taskId',
    { schema: { params: taskParams, response: { 200: { $ref: 'ProjectTask#' } } } },
    async (req) => {
      const task = await withActor(pool, req.actorId, 'read', (c) =>
        readProjectTask(c, req.params.projectId, req.params.taskId),
      )
      if (!task) throw new DomainError('forbidden', 'Not permitted')
      return task
    },
  )

  app.get<{ Params: { artifactId: string } }>(
    '/api/v1/artifacts/:artifactId/tasks',
    { schema: { params: artifactParams, response: { 200: { $ref: 'ProjectTaskList#' } } } },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readReportTasks(c, req.params.artifactId)),
  )
}

export function humanTaskRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  readRoutes(app, pool)
  const preHandler = taskWriteAdmission(pool)

  app.post<{ Params: { projectId: string }; Headers: Keyed; Body: ProjectTaskRequest }>(
    '/api/v1/projects/:projectId/tasks',
    {
      preHandler,
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'ProjectTaskRequest#' },
        response: { 201: { $ref: 'ProjectTask#' } },
      },
    },
    async (req, reply) => {
      const task = await withActor(pool, req.actorId, 'write', async (c) => {
        await nameActor(c, namesOf(req))
        return createProjectTask(c, req.params.projectId, req.headers['idempotency-key'], req.body)
      })
      return reply.status(201).send(task)
    },
  )

  app.put<{ Params: TaskParams; Body: ProjectTaskOwnerRequest }>(
    '/api/v1/projects/:projectId/tasks/:taskId/owner',
    {
      preHandler,
      schema: {
        params: taskParams,
        body: { $ref: 'ProjectTaskOwnerRequest#' },
        response: { 200: { $ref: 'ProjectTask#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', async (c) => {
        await nameActor(c, namesOf(req))
        return setProjectTaskOwner(c, req.params.projectId, req.params.taskId, req.body)
      }),
  )

  app.post<{ Params: TaskParams; Headers: Keyed; Body: ProjectTaskDoneRequest }>(
    '/api/v1/projects/:projectId/tasks/:taskId/done',
    {
      preHandler,
      schema: {
        params: taskParams,
        headers: idempotencyHeader,
        body: { $ref: 'ProjectTaskDoneRequest#' },
        response: { 200: { $ref: 'ProjectTask#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', async (c) => {
        await nameActor(c, namesOf(req))
        return finishProjectTask(c, req.params.projectId, req.params.taskId, req.headers['idempotency-key'], req.body)
      }),
  )
}
