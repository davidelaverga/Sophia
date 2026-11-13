// Personal answer control (INC03-CC-003 A3, contract amendment A54, migration 0103; docs/plans/personal-answers.md, "A3").
// The owner cancels or replaces their own admitted automatic answer input, cancels or admits a held replacement, and
// reads the conversation, its inputs and their withheld answers, versioned. Each write names its Idempotency-Key, the
// epoch it is made against and the control revision it expects; a replay returns its remembered receipt (a refused
// admission included) before any flag or profile is read, and wakes nothing.
//
// Installation is the boundary (C6): served whenever 0103 is installed, whatever personalAnswers or
// personalAnswerReplacementAdmission say and whether or not a live companion answers this owner. Without 0103 the
// family answers 503 projection_unavailable; a failed read, 503 unavailable: never an empty or legacy answer. Only a
// fresh admission of a replacement needs both paid gates and the companion's current profile, which the server passes.
//
// The owner is the verified token's subject, never a field; the schemas are closed (A54). A52, A53 and the old Personal
// routes are untouched; those reads refuse an owner with controlled inputs (routes/personal.ts).
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import {
  admitPersonalAnswerInput,
  controlPersonalAnswerInput,
  personalAnswerControlsInstalled,
  readPersonalAnswerControl,
  readPersonalAnswerControlLog,
  readPersonalControlledExport,
  readPersonalControlledTurns,
  readPersonalEpoch,
  withActor,
  type PersonalAnswerAuthority,
  type PersonalAnswerControlAction,
  type PersonalAnswerControlResult,
} from '@sophia/persistence'
import type { CompanionRunner } from '../companion.ts'
import { idempotencyHeader } from './schemas.ts'

type Headers = { 'idempotency-key': string; 'x-sophia-personal-epoch': string }
type Params = { inputId: string }

const epochPattern = { type: 'string', pattern: '^(0|[1-9][0-9]{0,14})$' } as const

/** A write's key and the epoch it is made against: at most 15 digits, so a safe integer (as routes/personal.ts). */
const writeHeaders = {
  type: 'object',
  properties: { ...idempotencyHeader.properties, 'x-sophia-personal-epoch': epochPattern },
  required: [...idempotencyHeader.required, 'x-sophia-personal-epoch'],
} as const

/** The epoch a versioned export page is read against. */
const exportHeaders = {
  type: 'object',
  properties: { 'x-sophia-personal-epoch': epochPattern },
  required: ['x-sophia-personal-epoch'],
} as const

/** An input id as A53/A54 declare it (`format: uuid`, any case, optionally `urn:uuid:`). */
const params = {
  type: 'object',
  additionalProperties: false,
  properties: { inputId: { type: 'string', format: 'uuid' } },
  required: ['inputId'],
} as const

/**
 * The one spelling the database and the idempotency semantic read (A2-F01's): lowercase, without the prefix. Applied
 * only to a value the format already accepted, so every spelling of one id names it.
 */
const canonicalId = (id: string): string => id.slice(-36).toLowerCase()

const cursor = { type: 'string', pattern: '^(0|[1-9][0-9]{0,15})$' } as const

const NOT_INSTALLED = 'Personal answer control is not installed on this database'
const NOT_APPLICABLE = 'This input is not in a state this operation applies to.'
const ERASED_SINCE = 'Everything was deleted since this copy began.'

/** Whether 0103 is installed: remembered once seen (a migration is never undone under a running API). */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok: boolean
    try {
      ok = await personalAnswerControlsInstalled(pool)
    } catch (err: unknown) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok) throw new DomainError('projection_unavailable', NOT_INSTALLED)
    installed = true
  }
}

/** The SQLSTATE a refused write carried, when the error is one the database gave. */
const sqlstate = (err: unknown): string | null => {
  const cause: unknown = err instanceof DomainError ? err.cause : err
  const code: unknown = typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : null
  return typeof code === 'string' ? code : null
}

/** A state the client caused (0103's 55000) said in our words (409 invalid_state), never as an outage. */
async function applicable<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err: unknown) {
    if (sqlstate(err) === '55000') throw new DomainError('invalid_state', NOT_APPLICABLE, { cause: err })
    throw err
  }
}

const epochOf = (h: { 'x-sophia-personal-epoch': string }) => Number(h['x-sophia-personal-epoch'])

interface Deps {
  pool: pg.Pool
  companion: CompanionRunner | null
  /** personalAnswers AND personalAnswerReplacementAdmission: the paid replacement admission gate (both default off). */
  replacementAdmission: boolean
  installed: () => Promise<void>
}

/**
 * The server's authority for a fresh admission now: the live companion's profile for this owner, and both paid gates
 * with it. Read only on a first write (SQL reads the key first); a replay never uses it.
 */
function authorityFor({ companion, replacementAdmission }: Deps, actorId: string): PersonalAnswerAuthority {
  const live = companion?.mode === 'live' && companion.serves(actorId)
  const profile = live ? companion.answerProfile() : null
  return { profile, admission: replacementAdmission && profile !== null }
}

/** After the first commit of an applied control or admission, the owner's oldest waiting turn is resumed. */
function wakeAfter(deps: Deps, actorId: string, result: PersonalAnswerControlResult): void {
  if (!result.replayed && result.receipt.outcome === 'applied') void deps.companion?.resume(actorId)
}

export function personalAnswerControlRoutes(
  app: FastifyInstance,
  deps: { pool: pg.Pool; companion: CompanionRunner | null; replacementAdmission: boolean },
): void {
  const all: Deps = { ...deps, installed: installation(deps.pool) }
  controlRoute(app, all)
  admitRoute(app, all)
  viewRoute(app, all)
  logRoute(app, all)
  turnsRoute(app, all)
  exportRoute(app, all)
}

interface ControlBody {
  controlContract: 'personal_answer_control_v1'
  action: PersonalAnswerControlAction
  expectedRevision: number
  text?: string
}

interface AdmitBody {
  controlContract: 'personal_answer_control_v1'
  controlId: string
  expectedRevision: number
}

/** C1/C2/C4: cancel or replace an admitted input, or cancel a held replacement. */
function controlRoute(app: FastifyInstance, deps: Deps): void {
  const { pool, installed } = deps
  app.post<{ Headers: Headers; Params: Params; Body: ControlBody }>(
    '/api/v1/personal/answers/:inputId/control',
    {
      schema: {
        params,
        headers: writeHeaders,
        body: { $ref: 'PersonalAnswerControlRequest#' },
        response: { 202: { $ref: 'PersonalAnswerControlReceipt#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const authority = authorityFor(deps, req.actorId)
      const result = await applicable(() =>
        withActor(pool, req.actorId, 'write', (c) =>
          controlPersonalAnswerInput(
            c,
            {
              key: req.headers['idempotency-key'],
              inputId: canonicalId(req.params.inputId),
              action: req.body.action,
              expectedRevision: req.body.expectedRevision,
              epoch: epochOf(req.headers),
              text: req.body.text ?? null,
            },
            authority,
          ),
        ),
      )
      wakeAfter(deps, req.actorId, result)
      return reply.status(202).send(result.receipt)
    },
  )
}

/** C3/C3': the owner admits a held replacement their own replace created; a refusal is remembered as its receipt. */
function admitRoute(app: FastifyInstance, deps: Deps): void {
  const { pool, installed } = deps
  app.post<{ Headers: Headers; Params: Params; Body: AdmitBody }>(
    '/api/v1/personal/answers/:inputId/control/admit',
    {
      schema: {
        params,
        headers: writeHeaders,
        body: { $ref: 'PersonalAnswerAdmitRequest#' },
        response: { 202: { $ref: 'PersonalAnswerControlReceipt#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const authority = authorityFor(deps, req.actorId)
      const result = await applicable(() =>
        withActor(pool, req.actorId, 'write', (c) =>
          admitPersonalAnswerInput(
            c,
            {
              key: req.headers['idempotency-key'],
              inputId: canonicalId(req.params.inputId),
              controlId: canonicalId(req.body.controlId),
              expectedRevision: req.body.expectedRevision,
              epoch: epochOf(req.headers),
            },
            authority,
          ),
        ),
      )
      wakeAfter(deps, req.actorId, result)
      return reply.status(202).send(result.receipt)
    },
  )
}

/** The owner's input as it stands now. Effect-free. */
function viewRoute(app: FastifyInstance, { pool, installed }: Deps): void {
  app.get<{ Params: Params }>(
    '/api/v1/personal/answers/:inputId/control',
    { schema: { params, response: { 200: { $ref: 'PersonalAnswerControlView#' } } } },
    async (req) => {
      await installed()
      return withActor(pool, req.actorId, 'read', (c) => readPersonalAnswerControl(c, canonicalId(req.params.inputId)))
    },
  )
}

/** The owner's control operations, a page at a time. Effect-free. */
function logRoute(app: FastifyInstance, { pool, installed }: Deps): void {
  app.get<{ Querystring: { after?: string } }>(
    '/api/v1/personal/answer-controls/log',
    {
      schema: {
        querystring: { type: 'object', additionalProperties: false, properties: { after: cursor } },
        response: { 200: { $ref: 'PersonalAnswerControlLog#' } },
      },
    },
    async (req) => {
      await installed()
      const after = Number(req.query.after ?? 0)
      if (!Number.isSafeInteger(after)) throw new DomainError('invalid_request', 'after is beyond the largest control')
      return withActor(pool, req.actorId, 'read', (c) => readPersonalAnswerControlLog(c, after))
    },
  )
}

/** The conversation as it is kept, with controlled inputs: newest, after a turn, or before one. Effect-free. */
function turnsRoute(app: FastifyInstance, { pool, installed }: Deps): void {
  app.get<{ Querystring: { after?: string; before?: string } }>(
    '/api/v1/personal/answer-controls/turns',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { after: cursor, before: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' } },
        },
        response: { 200: { $ref: 'PersonalControlledTurnPage#' } },
      },
    },
    async (req) => {
      await installed()
      const { after, before } = req.query
      if (after !== undefined && before !== undefined)
        throw new DomainError('invalid_request', 'Ask for turns after one, or before one, not both')
      const at = Number(after ?? before ?? 0)
      if (!Number.isSafeInteger(at)) throw new DomainError('invalid_request', 'The cursor is beyond the largest turn')
      const page = after !== undefined ? { after: at } : before !== undefined ? { before: at } : {}
      return withActor(pool, req.actorId, 'read', (c) => readPersonalControlledTurns(c, page))
    },
  )
}

/** Everything the space keeps, versioned, a page at a time against the epoch the copy began in. */
function exportRoute(app: FastifyInstance, { pool, installed }: Deps): void {
  app.get<{ Querystring: { after?: string }; Headers: { 'x-sophia-personal-epoch': string } }>(
    '/api/v1/personal/answer-controls/export',
    {
      schema: {
        headers: exportHeaders,
        querystring: { type: 'object', additionalProperties: false, properties: { after: cursor } },
        response: { 200: { $ref: 'PersonalControlledExport#' } },
      },
    },
    async (req) => {
      await installed()
      const after = Number(req.query.after ?? 0)
      if (!Number.isSafeInteger(after)) throw new DomainError('invalid_request', 'after is beyond the largest turn')
      // Read against the epoch the copy began in: a page after an erasure is refused, never mixed with what followed.
      const page = await withActor(pool, req.actorId, 'read', async (c) => {
        if ((await readPersonalEpoch(c)) !== epochOf(req.headers)) throw new DomainError('request_erased', ERASED_SINCE)
        return readPersonalControlledExport(c, after)
      })
      return { exportedAt: new Date().toISOString(), ...page }
    },
  )
}
