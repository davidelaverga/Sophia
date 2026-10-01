// The personal space for signed-in people (contract amendment A10). Every read and write runs under the caller and
// reaches their own space only (owner-only RLS in 0021); a guest never gets here (app.ts refuses anonymous callers on
// every route but the room's door). Writes are idempotent per person and Idempotency-Key and answered with a receipt
// of ids. Sophia's replies are written by the companion after the turn commits; where no companion runs, a message is
// refused before anything is kept.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  PersonalCarryRequest,
  PersonalErasureRequest,
  PersonalMessage,
  PersonalNoteRequest,
  PersonalReceipt,
  PersonalResumeRequest,
  PersonalSuggestionDecision,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  carryPersonalNote,
  decidePersonalSuggestion,
  erasePersonalSpace,
  forgetPersonalNote,
  keepPersonalNote,
  readPersonalExport,
  readPersonalSpace,
  readPersonalTurnsAfter,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
  withActor,
} from '@sophia/persistence'
import type { CompanionRunner } from '../companion.ts'
import { idempotencyHeader, UUID_PATTERN } from './schemas.ts'

interface Deps {
  pool: pg.Pool
  companion: CompanionRunner | null
}

type Key = { 'idempotency-key': string }

const idParams = (name: string) =>
  ({
    type: 'object',
    additionalProperties: false,
    properties: { [name]: { type: 'string', pattern: UUID_PATTERN } },
    required: [name],
  }) as const

/**
 * The ids a body names are canonical lowercase UUIDs, as the path's are: the contract's `format: uuid` also takes
 * `urn:uuid:` and uppercase forms, which the database can't read (a 503 instead of the 422 they are).
 */
const BODY_IDS: Readonly<Record<string, readonly string[]>> = {
  PersonalNoteRequest: ['fromTurnId', 'suggestionId'],
  PersonalCarryRequest: ['projectId'],
}

const bodySchema = (body: string) => {
  const ids = BODY_IDS[body]
  if (!ids) return { $ref: `${body}#` }
  const pattern = { type: 'string', pattern: UUID_PATTERN }
  return { allOf: [{ $ref: `${body}#` }, { properties: Object.fromEntries(ids.map((id) => [id, pattern])) }] }
}

const writeSchema = (params: object | null, body: string | null) => ({
  ...(params ? { params } : {}),
  headers: idempotencyHeader,
  ...(body ? { body: bodySchema(body) } : {}),
  response: { 202: { $ref: 'PersonalReceipt#' } },
})

const NO_COMPANION = 'Sophia can’t answer here yet. Nothing was kept.'

/** The receipt of a welcome that wasn't due: nothing written, the space as it is. */
async function nothingDue(c: pg.PoolClient): Promise<PersonalReceipt> {
  const { revision } = await readPersonalTurnsAfter(c, Number.MAX_SAFE_INTEGER)
  return {
    operation: 'resume',
    revision,
    turnId: null,
    seq: null,
    suggestionId: null,
    noteId: null,
    releaseId: null,
    projectId: null,
    erased: null,
  }
}

function readRoutes(app: FastifyInstance, { pool, companion }: Deps): void {
  app.get('/api/v1/personal', { schema: { response: { 200: { $ref: 'PersonalSpace#' } } } }, async (req) => {
    const space = await withActor(pool, req.actorId, 'read', (c) => readPersonalSpace(c))
    return { companion: companion?.mode ?? 'unavailable', ...space }
  })

  app.get<{ Querystring: { after: string } }>(
    '/api/v1/personal/turns',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { after: { type: 'string', pattern: '^(0|[1-9][0-9]{0,15})$' } },
          required: ['after'],
        },
        response: { 200: { $ref: 'PersonalTurnPage#' } },
      },
    },
    async (req) => {
      const after = Number(req.query.after)
      if (!Number.isSafeInteger(after)) throw new DomainError('invalid_request', 'after is beyond the largest turn')
      return withActor(pool, req.actorId, 'read', (c) => readPersonalTurnsAfter(c, after))
    },
  )

  app.get('/api/v1/personal/export', { schema: { response: { 200: { $ref: 'PersonalExport#' } } } }, async (req) => {
    const everything = await withActor(pool, req.actorId, 'read', (c) => readPersonalExport(c))
    return { exportedAt: new Date().toISOString(), ...everything }
  })
}

function conversationRoutes(app: FastifyInstance, { pool, companion }: Deps): void {
  app.post<{ Headers: Key; Body: PersonalMessage }>(
    '/api/v1/personal/turns',
    { schema: writeSchema(null, 'PersonalMessage') },
    async (req, reply) => {
      if (!companion) throw new DomainError('unavailable', NO_COMPANION)
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        sendPersonalTurn(c, req.headers['idempotency-key'], req.body.text),
      )
      if (receipt.turnId) void companion.answer(req.actorId, receipt.turnId)
      return reply.status(202).send(receipt)
    },
  )

  // A welcome back is written only when one is due, so a retry after a lost reply can't write a second one.
  app.post<{ Headers: Key; Body: PersonalResumeRequest }>(
    '/api/v1/personal/resume',
    { schema: writeSchema(null, 'PersonalResumeRequest') },
    async (req, reply) => {
      if (!companion) throw new DomainError('unavailable', NO_COMPANION)
      const greeted = await companion.greet(req.actorId, req.body.name?.trim() || null)
      const receipt = greeted ?? (await withActor(pool, req.actorId, 'read', (c) => nothingDue(c)))
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { turnId: string }; Headers: Key }>(
    '/api/v1/personal/turns/:turnId/retry',
    { schema: writeSchema(idParams('turnId'), null) },
    async (req, reply) => {
      if (!companion) throw new DomainError('unavailable', NO_COMPANION)
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        retryPersonalTurn(c, req.headers['idempotency-key'], req.params.turnId),
      )
      void companion.answer(req.actorId, req.params.turnId)
      return reply.status(202).send(receipt)
    },
  )
}

function noteRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.post<{ Params: { suggestionId: string }; Headers: Key; Body: PersonalSuggestionDecision }>(
    '/api/v1/personal/suggestions/:suggestionId/decision',
    { schema: writeSchema(idParams('suggestionId'), 'PersonalSuggestionDecision') },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        decidePersonalSuggestion(c, req.headers['idempotency-key'], req.params.suggestionId, req.body.decision),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Headers: Key; Body: PersonalNoteRequest }>(
    '/api/v1/personal/notes',
    { schema: writeSchema(null, 'PersonalNoteRequest') },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        keepPersonalNote(c, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { noteId: string }; Headers: Key }>(
    '/api/v1/personal/notes/:noteId/forget',
    { schema: writeSchema(idParams('noteId'), null) },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        forgetPersonalNote(c, req.headers['idempotency-key'], req.params.noteId),
      )
      return reply.status(202).send(receipt)
    },
  )
}

function crossingRoutes(app: FastifyInstance, { pool }: Deps): void {
  // A carried note is attributed to the name the person shows (their token's), never to an id or to request input.
  app.post<{ Params: { noteId: string }; Headers: Key; Body: PersonalCarryRequest }>(
    '/api/v1/personal/notes/:noteId/carry',
    { schema: writeSchema(idParams('noteId'), 'PersonalCarryRequest') },
    async (req, reply) => {
      const { noteId } = req.params
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        carryPersonalNote(c, req.headers['idempotency-key'], noteId, req.body.projectId, req.actorName),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { releaseId: string }; Headers: Key }>(
    '/api/v1/personal/releases/:releaseId/take-back',
    { schema: writeSchema(idParams('releaseId'), null) },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        takeBackPersonalRelease(c, req.headers['idempotency-key'], req.params.releaseId),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Headers: Key; Body: PersonalErasureRequest }>(
    '/api/v1/personal/erasure',
    { schema: writeSchema(null, 'PersonalErasureRequest') },
    async (req, reply) => {
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        erasePersonalSpace(c, req.headers['idempotency-key'], req.body.confirm),
      )
      return reply.status(202).send(receipt)
    },
  )
}

export function personalRoutes(app: FastifyInstance, deps: Deps): void {
  readRoutes(app, deps)
  conversationRoutes(app, deps)
  noteRoutes(app, deps)
  crossingRoutes(app, deps)
}
