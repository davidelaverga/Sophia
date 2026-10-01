// The personal space for signed-in people (contract amendment A10). Every read and write runs under the caller and
// reaches their own space only (owner-only RLS in 0021); a guest never gets here (app.ts refuses anonymous callers on
// every route but the room's door). Writes are idempotent per person and Idempotency-Key and answered with a receipt
// of ids; every one but erasure names the epoch of the space it was made against, and is refused when an erasure came
// in between (personal_fence). Sophia's replies are written by the companion after the turn commits; where no
// companion runs, a message is refused before anything is kept.
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
  fencePersonalWrite,
  forgetPersonalNote,
  keepPersonalNote,
  readPersonalEpoch,
  readPersonalExport,
  readPersonalSpace,
  readPersonalTurnsAfter,
  readPersonalTurnsBefore,
  replayPersonalGreeting,
  replayPersonalRetry,
  replayPersonalTurn,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
  withActor,
} from '@sophia/persistence'
import { stoppedEverywhere, type CompanionRunner } from '../companion.ts'
import { idempotencyHeader, UUID_PATTERN } from './schemas.ts'

interface Deps {
  pool: pg.Pool
  companion: CompanionRunner | null
}

type Key = { 'idempotency-key': string }

/** A write made against the epoch of the space the client last read (PersonalSpace.epoch, ProjectList.personalEpoch). */
type Fenced = Key & { 'x-sophia-personal-epoch': string }

/** The write's key, and its epoch: at most 15 digits, so a safe integer. */
const fencedHeaders = {
  type: 'object',
  properties: {
    ...idempotencyHeader.properties,
    'x-sophia-personal-epoch': { type: 'string', pattern: '^(0|[1-9][0-9]{0,14})$' },
  },
  required: [...idempotencyHeader.required, 'x-sophia-personal-epoch'],
} as const

/** A read made against the space's epoch (the export): one asked for after an erasure is refused as erased. */
type Epoch = { 'x-sophia-personal-epoch': string }

const epochHeader = {
  type: 'object',
  properties: { 'x-sophia-personal-epoch': fencedHeaders.properties['x-sophia-personal-epoch'] },
  required: ['x-sophia-personal-epoch'],
} as const

const epochOf = (headers: Epoch) => Number(headers['x-sophia-personal-epoch'])

/**
 * A personal write in one transaction with its fence: the space is held, and a write made against another epoch than
 * the space's (one issued before an erasure, however late it arrives) is refused as erased.
 */
const fenced = <T>(pool: pg.Pool, actorId: string, headers: Fenced, write: (c: pg.PoolClient) => Promise<T>) =>
  withActor(pool, actorId, 'write', async (c) => {
    await fencePersonalWrite(c, epochOf(headers))
    return write(c)
  })

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

const writeSchema = (params: object | null, body: string | null, headers: object = fencedHeaders) => ({
  ...(params ? { params } : {}),
  headers,
  ...(body ? { body: bodySchema(body) } : {}),
  response: { 202: { $ref: 'PersonalReceipt#' } },
})

const NO_COMPANION = 'Sophia can’t answer here yet. Nothing was kept.'

/** An export page asked for against an epoch an erasure has since moved. */
const ERASED_SINCE = 'Everything was deleted since this copy began.'

/** An erasure that committed, but whose wait for the companion to stop could not finish: asked again, it ends. */
const UNFINISHED_ERASURE = 'Everything was deleted, but it is not finished yet. Ask again.'

/**
 * Where no companion runs (a deploy rolling out, one never configured), a retry still gets the receipt its key keeps;
 * only new work is refused, before anything is kept.
 */
async function replayed(
  pool: pg.Pool,
  req: { actorId: string; headers: Fenced },
  replay: (c: pg.PoolClient) => Promise<PersonalReceipt | null>,
): Promise<PersonalReceipt> {
  const kept = await fenced(pool, req.actorId, req.headers, replay)
  if (!kept) throw new DomainError('unavailable', NO_COMPANION)
  return kept
}

/** An IANA time zone's shape (Europe/Madrid, America/Argentina/Buenos_Aires, UTC); the database says if it knows it. */
const TIME_ZONE_PATTERN = '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'

function readRoutes(app: FastifyInstance, { pool, companion }: Deps): void {
  // Its days are counted in the reader's time zone (an IANA name; UTC without one), over the whole conversation.
  app.get<{ Querystring: { timeZone?: string } }>(
    '/api/v1/personal',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { timeZone: { type: 'string', maxLength: 64, pattern: TIME_ZONE_PATTERN } },
        },
        response: { 200: { $ref: 'PersonalSpace#' } },
      },
    },
    async (req) => {
      const timeZone = req.query.timeZone ?? 'UTC'
      const space = await withActor(pool, req.actorId, 'read', (c) => readPersonalSpace(c, timeZone))
      return { companion: companion?.mode ?? 'unavailable', ...space }
    },
  )

  // A page of turns at a time (after `after`, a seq), so one read stays bounded however long the conversation.
  app.get<{ Querystring: { after?: string }; Headers: Epoch }>(
    '/api/v1/personal/export',
    {
      schema: {
        headers: epochHeader,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { after: { type: 'string', pattern: '^(0|[1-9][0-9]{0,15})$' } },
        },
        response: { 200: { $ref: 'PersonalExport#' } },
      },
    },
    async (req) => {
      const after = Number(req.query.after ?? 0)
      if (!Number.isSafeInteger(after)) throw new DomainError('invalid_request', 'after is beyond the largest turn')
      // Read against the epoch the copy began in: a page asked for after an erasure is refused, so a copy never mixes
      // an erased space with what came after it, nor outlives it.
      const page = await withActor(pool, req.actorId, 'read', async (c) => {
        if ((await readPersonalEpoch(c)) !== epochOf(req.headers)) throw new DomainError('request_erased', ERASED_SINCE)
        return readPersonalExport(c, after)
      })
      return { exportedAt: new Date().toISOString(), ...page }
    },
  )
}

/** The conversation a page at a time: what came after a turn (polling), and what came before one (reading back). */
function pageRoutes(app: FastifyInstance, { pool }: Deps): void {
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

  app.get<{ Querystring: { before: string } }>(
    '/api/v1/personal/turns/earlier',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { before: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' } },
          required: ['before'],
        },
        response: { 200: { $ref: 'PersonalEarlierTurns#' } },
      },
    },
    async (req) => {
      const before = Number(req.query.before)
      if (!Number.isSafeInteger(before)) throw new DomainError('invalid_request', 'before is beyond the largest turn')
      return withActor(pool, req.actorId, 'read', (c) => readPersonalTurnsBefore(c, before))
    },
  )
}

function conversationRoutes(app: FastifyInstance, { pool, companion }: Deps): void {
  app.post<{ Headers: Fenced; Body: PersonalMessage }>(
    '/api/v1/personal/turns',
    { schema: writeSchema(null, 'PersonalMessage') },
    async (req, reply) => {
      const key = req.headers['idempotency-key']
      if (!companion)
        return reply.status(202).send(await replayed(pool, req, (c) => replayPersonalTurn(c, key, req.body.text)))
      const receipt = await fenced(pool, req.actorId, req.headers, (c) => sendPersonalTurn(c, key, req.body.text))
      if (receipt.turnId) void companion.answer(req.actorId, receipt.turnId)
      return reply.status(202).send(receipt)
    },
  )

  // A welcome back is written only when one is due, so a retry after a lost reply can't write a second one.
  app.post<{ Headers: Fenced; Body: PersonalResumeRequest }>(
    '/api/v1/personal/resume',
    { schema: writeSchema(null, 'PersonalResumeRequest') },
    async (req, reply) => {
      const { headers } = req
      const name = req.body.name?.trim() || null
      if (!companion) {
        return reply
          .status(202)
          .send(await replayed(pool, req, (c) => replayPersonalGreeting(c, headers['idempotency-key'], name)))
      }
      const receipt = await companion.greet(req.actorId, headers['idempotency-key'], epochOf(headers), name)
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { turnId: string }; Headers: Fenced }>(
    '/api/v1/personal/turns/:turnId/retry',
    { schema: writeSchema(idParams('turnId'), null) },
    async (req, reply) => {
      const key = req.headers['idempotency-key']
      const { turnId } = req.params
      if (!companion)
        return reply.status(202).send(await replayed(pool, req, (c) => replayPersonalRetry(c, key, turnId)))
      const receipt = await fenced(pool, req.actorId, req.headers, (c) => retryPersonalTurn(c, key, turnId))
      void companion.answer(req.actorId, turnId)
      return reply.status(202).send(receipt)
    },
  )
}

function noteRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.post<{ Params: { suggestionId: string }; Headers: Fenced; Body: PersonalSuggestionDecision }>(
    '/api/v1/personal/suggestions/:suggestionId/decision',
    { schema: writeSchema(idParams('suggestionId'), 'PersonalSuggestionDecision') },
    async (req, reply) => {
      const receipt = await fenced(pool, req.actorId, req.headers, (c) =>
        decidePersonalSuggestion(c, req.headers['idempotency-key'], req.params.suggestionId, req.body.decision),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Headers: Fenced; Body: PersonalNoteRequest }>(
    '/api/v1/personal/notes',
    { schema: writeSchema(null, 'PersonalNoteRequest') },
    async (req, reply) => {
      const receipt = await fenced(pool, req.actorId, req.headers, (c) =>
        keepPersonalNote(c, req.headers['idempotency-key'], req.body),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { noteId: string }; Headers: Fenced }>(
    '/api/v1/personal/notes/:noteId/forget',
    { schema: writeSchema(idParams('noteId'), null) },
    async (req, reply) => {
      const receipt = await fenced(pool, req.actorId, req.headers, (c) =>
        forgetPersonalNote(c, req.headers['idempotency-key'], req.params.noteId),
      )
      return reply.status(202).send(receipt)
    },
  )
}

function crossingRoutes(app: FastifyInstance, { pool, companion }: Deps): void {
  // A carried note is attributed to the name the person shows (their token's), never to an id or to request input.
  app.post<{ Params: { noteId: string }; Headers: Fenced; Body: PersonalCarryRequest }>(
    '/api/v1/personal/notes/:noteId/carry',
    { schema: writeSchema(idParams('noteId'), 'PersonalCarryRequest') },
    async (req, reply) => {
      const { noteId } = req.params
      const receipt = await fenced(pool, req.actorId, req.headers, (c) =>
        carryPersonalNote(c, req.headers['idempotency-key'], noteId, req.body.projectId, req.actorName),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Params: { releaseId: string }; Headers: Fenced }>(
    '/api/v1/personal/releases/:releaseId/take-back',
    { schema: writeSchema(idParams('releaseId'), null) },
    async (req, reply) => {
      const receipt = await fenced(pool, req.actorId, req.headers, (c) =>
        takeBackPersonalRelease(c, req.headers['idempotency-key'], req.params.releaseId),
      )
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Headers: Key; Body: PersonalErasureRequest }>(
    '/api/v1/personal/erasure',
    { schema: writeSchema(null, 'PersonalErasureRequest', idempotencyHeader) },
    async (req, reply) => {
      // Never fenced: erasing writes nothing back, and a retry of it gets its receipt after the epoch moved.
      const receipt = await withActor(pool, req.actorId, 'write', (c) =>
        erasePersonalSpace(c, req.headers['idempotency-key'], req.body.confirm),
      )
      // Acknowledged once nothing of the space is being answered, in any process. The erasure has committed: should
      // that wait fail, the same request asks again under its key (it gets its receipt, and waits again).
      await stoppedEverywhere(pool, req.actorId, companion).catch((err: unknown) => {
        throw new DomainError('outcome_unknown', UNFINISHED_ERASURE, { cause: err })
      })
      return reply.status(202).send(receipt)
    },
  )
}

export function personalRoutes(app: FastifyInstance, deps: Deps): void {
  readRoutes(app, deps)
  pageRoutes(app, deps)
  conversationRoutes(app, deps)
  noteRoutes(app, deps)
  crossingRoutes(app, deps)
}
