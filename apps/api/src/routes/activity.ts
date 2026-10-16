// A project's activity, for its admins (contract amendment A28, docs/plans/project-activity.md): who did what, on whom,
// and when, from the project's events. Codes and names only, never content.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import {
  pendingMemberRemoval,
  readProjectActivity,
  removeMember,
  settleRoomRemoval,
  withActor,
  withService,
} from '@sophia/persistence'
import { removeParticipant, type LiveKitConfig } from '../livekit.ts'
import { idempotencyHeader, projectParams } from './schemas.ts'

const memberParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' }, actorId: { type: 'string', format: 'uuid' } },
  required: ['projectId', 'actorId'],
} as const

interface Deps {
  pool: pg.Pool
  livekit: LiveKitConfig | undefined
}

/**
 * One attempt to take a removed member out of the call, right after (A29). Removing recorded the removal (0058); this
 * settles it only on the room server's evidence, and the worker does the rest, keeping watch meanwhile.
 */
async function outOfTheCall({ pool, livekit }: Deps, actorId: string, projectId: string, target: string) {
  if (!livekit) return
  const open = await withActor(pool, actorId, 'read', (c) => pendingMemberRemoval(c, projectId, target))
  if (!open) return
  const result = await removeParticipant(livekit, open.roomId, open.identity)
  await withService(pool, (c) => settleRoomRemoval(c, open.id, `api:${randomUUID()}`, result))
}

/** removeMember (A29): admins only, never oneself, idempotent per actor and key; out of the call too. */
function removeMemberRoute(app: FastifyInstance, deps: Deps): void {
  app.post<{ Params: { projectId: string; actorId: string }; Headers: { 'idempotency-key': string } }>(
    '/api/v1/projects/:projectId/members/:actorId/removal',
    {
      schema: {
        params: memberParams,
        headers: idempotencyHeader,
        body: { $ref: 'MemberRemoveRequest#' },
        response: { 200: { $ref: 'MemberRemoved#' } },
      },
    },
    async (req) => {
      const removed = await withActor(deps.pool, req.actorId, 'write', (c) =>
        removeMember(c, req.params.projectId, req.params.actorId, req.headers['idempotency-key']),
      )
      await outOfTheCall(deps, req.actorId, req.params.projectId, req.params.actorId)
      return removed
    },
  )
}

export function activityRoutes(app: FastifyInstance, { pool, livekit }: Deps): void {
  removeMemberRoute(app, { pool, livekit })
  app.get<{ Params: { projectId: string }; Querystring: { before?: string } }>(
    '/api/v1/projects/:projectId/activity',
    {
      schema: {
        params: projectParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { before: { type: 'string', pattern: '^[1-9][0-9]{0,18}$' } },
        },
        response: { 200: { $ref: 'ActivityPage#' } },
      },
    },
    async (req) => {
      const before = req.query.before ?? null
      // Nineteen digits may still pass a bigint: refused here, not overflowed into a 503 (Codex P2 on #355).
      if (before !== null && BigInt(before) > MOST_SEQUENCE)
        throw new DomainError('invalid_request', 'That page is past any activity')
      return withActor(pool, req.actorId, 'read', (c) => readProjectActivity(c, req.params.projectId, before))
    },
  )
}

/** The largest sequence a bigint holds. */
const MOST_SEQUENCE = 9223372036854775807n
