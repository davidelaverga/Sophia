// A goal's owner and target date, and a project's members (contract amendment A25, docs/plans/goal-owner-date.md).
// Kept beside the goal: nothing here moves a goal's revision or authority.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { GoalTargetRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readGoalTargets, readProjectMembers, setGoalTarget, withActor } from '@sophia/persistence'
import { projectParams } from './schemas.ts'

const goalParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' }, goalId: { type: 'string', format: 'uuid' } },
  required: ['projectId', 'goalId'],
} as const

export function goalTargetRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/goal-targets',
    { schema: { params: projectParams, response: { 200: { $ref: 'GoalTargetList#' } } } },
    async (req) => {
      const targets = await withActor(pool, req.actorId, 'read', (c) => readGoalTargets(c, req.params.projectId))
      if (!targets) throw new DomainError('forbidden', 'Not permitted')
      return { targets }
    },
  )

  app.put<{ Params: { projectId: string; goalId: string }; Body: GoalTargetRequest }>(
    '/api/v1/projects/:projectId/goals/:goalId/target',
    {
      schema: {
        params: goalParams,
        body: { $ref: 'GoalTargetRequest#' },
        response: { 200: { $ref: 'GoalTargetSet#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) => setGoalTarget(c, req.params.projectId, req.params.goalId, req.body)),
  )

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/members',
    { schema: { params: projectParams, response: { 200: { $ref: 'ProjectMembers#' } } } },
    async (req) => {
      const members = await withActor(pool, req.actorId, 'read', (c) => readProjectMembers(c, req.params.projectId))
      if (!members) throw new DomainError('forbidden', 'Not permitted')
      return { members }
    },
  )
}
