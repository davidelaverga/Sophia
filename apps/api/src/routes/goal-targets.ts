// A goal's owner and target date, and a project's members (contract amendment A25, docs/plans/goal-owner-date.md).
// Kept beside the goal: nothing here moves a goal's revision or authority.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { GoalTargetRequest, ProjectMember } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  changeMemberRole,
  readGoalTargets,
  readInvitablePeople,
  readProjectMembers,
  setGoalTarget,
  withActor,
} from '@sophia/persistence'
import { projectParams } from './schemas.ts'

const goalParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' }, goalId: { type: 'string', format: 'uuid' } },
  required: ['projectId', 'goalId'],
} as const

const memberParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' }, actorId: { type: 'string', format: 'uuid' } },
  required: ['projectId', 'actorId'],
} as const

/** changeMemberRole (A27): admins only; a project keeps at least one admin; a role already held changes nothing. */
function memberRoleRoute(app: FastifyInstance, pool: pg.Pool): void {
  app.put<{ Params: { projectId: string; actorId: string }; Body: { role: ProjectMember['role'] } }>(
    '/api/v1/projects/:projectId/members/:actorId/role',
    {
      schema: {
        params: memberParams,
        body: { $ref: 'MemberRoleRequest#' },
        response: { 200: { $ref: 'MemberRoleSet#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) =>
        changeMemberRole(c, req.params.projectId, req.params.actorId, req.body.role),
      ),
  )
}

export function goalTargetRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  memberRoleRoute(app, pool)
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

  // listInvitablePeople (A26): an admin's people from other projects, to invite here by address.
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/invitable',
    { schema: { params: projectParams, response: { 200: { $ref: 'InvitablePeople#' } } } },
    async (req) => ({
      people: await withActor(pool, req.actorId, 'read', (c) => readInvitablePeople(c, req.params.projectId)),
    }),
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
