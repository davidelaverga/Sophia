// The mission ledger for members (contract amendment A08). One read, the same MissionContext the voice guide's
// project_status uses; writes under the member's own identity, each idempotent per member and Idempotency-Key and
// answered with a receipt. A stale revision is a 409, never a silent overwrite. Nothing here reaches a model.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  MissionCorrectionRequest,
  MissionDecisionRequest,
  MissionEntryRequest,
  MissionNoteConsentRequest,
  MissionNotePolicyRequest,
  MissionProposalRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  decideMissionChange,
  previewMissionWithdrawal,
  proposeMissionChange,
  readMissionContext,
  recordMissionEntry,
  setMissionNoteConsent,
  setMissionNotePolicy,
  withActor,
  withdrawMissionEntry,
} from '@sophia/persistence'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

const withId = (name: string) =>
  ({
    type: 'object',
    additionalProperties: false,
    properties: {
      projectId: { type: 'string', pattern: UUID_PATTERN },
      [name]: { type: 'string', pattern: UUID_PATTERN },
    },
    required: ['projectId', name],
  }) as const

const writeSchema = (params: object, body: string) => ({
  params,
  headers: idempotencyHeader,
  body: { $ref: `${body}#` },
  response: { 202: { $ref: 'MissionReceipt#' } },
})

interface Deps {
  pool: pg.Pool
}

async function readContext(pool: pg.Pool, actorId: string, projectId: string) {
  const context = await withActor(pool, actorId, 'read', (c) =>
    readMissionContext(c, projectId, { actorId, channel: 'studio' }),
  )
  if (!context) throw new DomainError('forbidden', 'Not permitted')
  return context
}

function entryRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: MissionEntryRequest }>(
    '/api/v1/projects/:projectId/mission/entries',
    { schema: writeSchema(projectParams, 'MissionEntryRequest') },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        recordMissionEntry(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{
    Params: { projectId: string; entryId: string }
    Headers: { 'idempotency-key': string }
    Body: MissionCorrectionRequest
  }>(
    '/api/v1/projects/:projectId/mission/entries/:entryId/correction',
    { schema: writeSchema(withId('entryId'), 'MissionCorrectionRequest') },
    async (req, reply) => {
      const write = { ...req.body, correctsEntryId: req.params.entryId }
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        recordMissionEntry(c, req.params.projectId, req.headers['idempotency-key'], write),
      )
      return reply.status(202).send(receipt)
    },
  )

  // What forgetting would erase, by the withdrawal's own rule: the Studio lists it before the member confirms.
  app.get<{ Params: { projectId: string; entryId: string } }>(
    '/api/v1/projects/:projectId/mission/entries/:entryId/withdrawal',
    { schema: { params: withId('entryId'), response: { 200: { $ref: 'MissionWithdrawalPreview#' } } } },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) =>
        previewMissionWithdrawal(c, req.params.projectId, req.params.entryId),
      ),
  )

  app.post<{ Params: { projectId: string; entryId: string }; Headers: { 'idempotency-key': string } }>(
    '/api/v1/projects/:projectId/mission/entries/:entryId/withdrawal',
    { schema: writeSchema(withId('entryId'), 'MissionWithdrawalRequest') },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        withdrawMissionEntry(c, req.params.projectId, req.params.entryId, req.headers['idempotency-key']),
      )
      return reply.status(202).send(receipt)
    },
  )
}

function proposalRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: MissionProposalRequest }>(
    '/api/v1/projects/:projectId/mission/proposals',
    { schema: writeSchema(projectParams, 'MissionProposalRequest') },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        proposeMissionChange(c, req.params.projectId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{
    Params: { projectId: string; proposalId: string }
    Headers: { 'idempotency-key': string }
    Body: MissionDecisionRequest
  }>(
    '/api/v1/projects/:projectId/mission/proposals/:proposalId/decision',
    { schema: writeSchema(withId('proposalId'), 'MissionDecisionRequest') },
    async (req, reply) => {
      const { projectId, proposalId } = req.params
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        decideMissionChange(c, projectId, proposalId, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )
}

function policyRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.put<{ Params: { projectId: string }; Body: MissionNotePolicyRequest }>(
    '/api/v1/projects/:projectId/mission/note-policy',
    {
      schema: {
        params: projectParams,
        body: { $ref: 'MissionNotePolicyRequest#' },
        response: { 200: { $ref: 'MissionNotePolicy#' } },
      },
    },
    async (req) => {
      const { capture, expectedRevision } = req.body
      await withActor(pool, req.actorId, 'write', (c) =>
        setMissionNotePolicy(c, req.params.projectId, capture, expectedRevision),
      )
      return (await readContext(pool, req.actorId, req.params.projectId)).notePolicy
    },
  )

  app.put<{ Params: { projectId: string }; Body: MissionNoteConsentRequest }>(
    '/api/v1/projects/:projectId/mission/note-consent',
    {
      schema: {
        params: projectParams,
        body: { $ref: 'MissionNoteConsentRequest#' },
        response: { 200: { $ref: 'MissionNotePolicy#' } },
      },
    },
    async (req) => {
      await withActor(pool, req.actorId, 'write', (c) => setMissionNoteConsent(c, req.params.projectId, req.body.state))
      return (await readContext(pool, req.actorId, req.params.projectId)).notePolicy
    },
  )
}

/** getMission and the mission writes (A08). */
export function missionRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/mission',
    { schema: { params: projectParams, response: { 200: { $ref: 'MissionContext#' } } } },
    async (req) => readContext(deps.pool, req.actorId, req.params.projectId),
  )
  entryRoutes(app, deps)
  proposalRoutes(app, deps)
  policyRoutes(app, deps)
}
