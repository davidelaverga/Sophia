// The mission ledger for members (contract amendment A08). One read, the same MissionContext the voice guide's
// project_status uses; writes under the member's own identity, each idempotent per member and Idempotency-Key and
// answered with a receipt. A stale revision is a 409, never a silent overwrite. Nothing here reaches a model.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type {
  MissionCorrectionRequest,
  MissionDecisionRequest,
  MissionEntryRequest,
  MissionNoteConsentRequest,
  MissionNotePolicyRequest,
  MissionProposalRequest,
  MissionWithdrawalRequest,
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
  nameActor,
  withActor,
  withdrawMissionEntry,
} from '@sophia/persistence'
import { namesOf } from './profile.ts'
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

async function readContext(pool: pg.Pool, actorId: string, projectId: string, names = false) {
  const context = await withActor(pool, actorId, 'read', (c) =>
    readMissionContext(c, projectId, { actorId, channel: 'studio', names }),
  )
  if (!context) throw new DomainError('forbidden', 'Not permitted')
  return context
}

/**
 * A brief write as the member, named from their own token (their display name, 0062) so the note, proposal or decision
 * keeps who wrote it (0049); the request never names anyone.
 */
function asMember<T>(pool: pg.Pool, req: FastifyRequest, write: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return withActor(pool, req.actorId, 'write', async (c) => {
    await nameActor(c, namesOf(req))
    return write(c)
  })
}

function entryRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: MissionEntryRequest }>(
    '/api/v1/projects/:projectId/mission/entries',
    { schema: writeSchema(projectParams, 'MissionEntryRequest') },
    async (req, reply) => {
      const receipt = await asMember(pool, req, (c) =>
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
      const receipt = await asMember(pool, req, (c) =>
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

  app.post<{
    Params: { projectId: string; entryId: string }
    Headers: { 'idempotency-key': string }
    Body: MissionWithdrawalRequest
  }>(
    '/api/v1/projects/:projectId/mission/entries/:entryId/withdrawal',
    { schema: writeSchema(withId('entryId'), 'MissionWithdrawalRequest') },
    async (req, reply) => {
      const { projectId, entryId } = req.params
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        withdrawMissionEntry(c, projectId, entryId, req.headers['idempotency-key'], req.body),
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
      const receipt = await asMember(pool, req, (c) =>
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
      const receipt = await asMember(pool, req, (c) =>
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

/**
 * `names=1`: the reader reads the authors' names (A18). A Studio still open from before asks without it and reads the
 * brief it always read, since its validator refuses a property it doesn't know (Codex P1 on #336).
 */
const NAMES_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: { names: { type: 'string', enum: ['1'] } },
} as const

/** getMission and the mission writes (A08). */
export function missionRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<{ Params: { projectId: string }; Querystring: { names?: '1' } }>(
    '/api/v1/projects/:projectId/mission',
    { schema: { params: projectParams, querystring: NAMES_QUERY, response: { 200: { $ref: 'MissionContext#' } } } },
    async (req) => readContext(deps.pool, req.actorId, req.params.projectId, req.query.names === '1'),
  )
  entryRoutes(app, deps)
  proposalRoutes(app, deps)
  policyRoutes(app, deps)
}
