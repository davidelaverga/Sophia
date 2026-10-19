// A member corrects or withdraws their own message in the room's discussion (contract amendment A36,
// docs/plans/message-acts.md): GET .../contributions/{contributionId}/preview?action=correct|withdraw, then POST
// .../correction or .../withdrawal with the preview's proof, revision and reach. Only the author, an active member; the
// member is the token's subject. The checks are the database's (0068), under the project's and the message's locks.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { ContributionActPreview, ContributionCorrection, ContributionWithdrawal } from '@sophia/contracts'
import { correctContribution, previewContributionAct, withActor, withdrawContribution } from '@sophia/persistence'
import { idempotencyHeader, UUID_PATTERN } from './schemas.ts'

const messageParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    contributionId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'contributionId'],
} as const

/** An act's schema: the message, its key, the body it carries, and the receipt it answers. */
const actSchema = (body: 'ContributionCorrection#' | 'ContributionWithdrawal#') => ({
  params: messageParams,
  headers: idempotencyHeader,
  body: { $ref: body },
  response: { 200: { $ref: 'ContributionActReceipt#' } },
})

interface MessageParams {
  projectId: string
  contributionId: string
}

export function contributionActRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: MessageParams; Querystring: { action: ContributionActPreview['action'] } }>(
    '/api/v1/projects/:projectId/contributions/:contributionId/preview',
    {
      schema: {
        params: messageParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { action: { type: 'string', enum: ['correct', 'withdraw'] } },
          required: ['action'],
        },
        response: { 200: { $ref: 'ContributionActPreview#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) =>
        previewContributionAct(c, req.params.projectId, req.params.contributionId, req.query.action),
      ),
  )

  app.post<{ Params: MessageParams; Headers: { 'idempotency-key': string }; Body: ContributionCorrection }>(
    '/api/v1/projects/:projectId/contributions/:contributionId/correction',
    { schema: actSchema('ContributionCorrection#') },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) =>
        correctContribution(
          c,
          req.params.projectId,
          req.params.contributionId,
          req.headers['idempotency-key'],
          req.body,
        ),
      ),
  )

  app.post<{ Params: MessageParams; Headers: { 'idempotency-key': string }; Body: ContributionWithdrawal }>(
    '/api/v1/projects/:projectId/contributions/:contributionId/withdrawal',
    { schema: actSchema('ContributionWithdrawal#') },
    async (req) =>
      withActor(pool, req.actorId, 'write', (c) =>
        withdrawContribution(
          c,
          req.params.projectId,
          req.params.contributionId,
          req.headers['idempotency-key'],
          req.body,
        ),
      ),
  )
}
