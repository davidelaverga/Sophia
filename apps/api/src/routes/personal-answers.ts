// Personal answers (INC03-CC-003 A2, contract amendment A53, migrations 0101 and 0102; docs/plans/personal-answers.md).
// The owner's message under the versioned Answer operation `personal_answer_v1`: kept as an automatic_v1 input and
// decided at once (admitted, or waiting while the payer is not admitted), then retried or cancelled only explicitly,
// each under its own Idempotency-Key and the decision seq it expects. Every replay returns the receipt that mutation
// remembered (0101), never a newer decision.
//
// The owner is the verified token's subject, never a field. The trusted answer profile is the live companion's own,
// built from its live settings for each write (CompanionRunner.answerProfile); no request names a profile, payer,
// route or model, and the schemas are closed. Send and retry need the companion to answer this person live; anyone
// else gets 503 and nothing is kept. After a send or retry commits, the owner's oldest waiting turn is resumed (R2): its
// answer is paid for only through 0102's effect guard. Cancel wakes nothing; the decision read is effect-free and
// leaves out the frozen profile.
//
// A52's record-only POST /api/v1/personal/inputs and the legacy Personal routes are untouched. Mounted only when the API
// is built with personalAnswers (off by default; server.ts never sets it); a database without 0101's writers or 0102's
// guard answers projection_unavailable (503), never a database message.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  PersonalAnswerCancel,
  PersonalAnswerDecisionList,
  PersonalAnswerReceipt,
  PersonalAnswerRetry,
  PersonalAnswerSend,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  cancelPersonalAnswerInput,
  PERSONAL_ANSWER_V1,
  readPersonalAnswerDecisions,
  retryPersonalAnswerInput,
  sendPersonalAnswerInput,
  withActor,
  type PersonalAnswerDecisionRecord,
  type PersonalAnswerProfile,
} from '@sophia/persistence'
import type { CompanionRunner } from '../companion.ts'
import { idempotencyHeader, UUID_PATTERN } from './schemas.ts'

/**
 * What the routes need of the database: 0101's three writers and its decisions, and 0102's guard (named in two parts,
 * so this read is never taken for a reservation statement).
 */
export const PERSONAL_ANSWERS_SCHEMA = `SELECT to_regprocedure('sophia.send_personal_answer_input(text,text,bigint,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.retry_personal_answer_input(text,uuid,integer,bigint,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.cancel_personal_answer_input(text,uuid,integer,bigint)') IS NOT NULL
  AND to_regclass('sophia.personal_input_decisions') IS NOT NULL
  AND to_regclass('sophia.personal_answer_effect_refusals') IS NOT NULL
  AND to_regprocedure('sophia.reserve_personal_' || 'answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb)') IS NOT NULL AS ok`

type Headers = { 'idempotency-key': string; 'x-sophia-personal-epoch': string }
type Params = { inputId: string }

/** The write's key, and the epoch it is made against: at most 15 digits, so a safe integer (as routes/personal.ts). */
const headers = {
  type: 'object',
  properties: {
    ...idempotencyHeader.properties,
    'x-sophia-personal-epoch': { type: 'string', pattern: '^(0|[1-9][0-9]{0,14})$' },
  },
  required: [...idempotencyHeader.required, 'x-sophia-personal-epoch'],
} as const

/** An input id as the database reads it: a canonical lowercase UUID. */
const params = {
  type: 'object',
  additionalProperties: false,
  properties: { inputId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['inputId'],
} as const

const NO_ANSWER = 'Sophia can’t answer here yet. Nothing was kept.'
const NOT_WAITING = 'This input is not waiting for a decision.'
const NO_INPUT = 'Input not found'

/** Whether 0101 and 0102 are installed: remembered once seen (a migration is never undone under a running API). */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(PERSONAL_ANSWERS_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok) throw new DomainError('projection_unavailable', 'Personal answers are not installed on this database')
    installed = true
  }
}

/** The SQLSTATE a refused write carried, when the error is one the database gave. */
const sqlstate = (err: unknown): string | null => {
  const cause: unknown = err instanceof DomainError ? err.cause : err
  const code: unknown = typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : null
  return typeof code === 'string' ? code : null
}

/**
 * A decided, record-only or full input refused by 0101 (55000, 54000) is a state the client caused, said in our words
 * (409 invalid_state), never as an outage or in the database's.
 */
async function decided<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err: unknown) {
    const code = sqlstate(err)
    if (code === '55000' || code === '54000') throw new DomainError('invalid_state', NOT_WAITING, { cause: err })
    throw err
  }
}

const epochOf = (h: Headers) => Number(h['x-sophia-personal-epoch'])

interface Deps {
  pool: pg.Pool
  companion: CompanionRunner
  /** 0101 and 0102 installed, checked before each request until seen. */
  installed: () => Promise<void>
}

export function personalAnswerRoutes(
  app: FastifyInstance,
  { pool, companion }: { pool: pg.Pool; companion: CompanionRunner },
): void {
  const deps: Deps = { pool, companion, installed: installation(pool) }
  decidingRoutes(app, deps)
  cancelRoute(app, deps)
  readRoute(app, deps)
}

/** The companion's trusted profile for this person, now; refused before anything is kept for anyone it does not serve. */
function profileFor(companion: CompanionRunner, actorId: string): PersonalAnswerProfile {
  const profile = companion.serves(actorId) ? companion.answerProfile() : null
  if (!profile) throw new DomainError('unavailable', NO_ANSWER)
  return profile
}

/** Send and retry: decided under the companion's profile now, then the owner's oldest waiting turn is resumed (R2). */
function decidingRoutes(app: FastifyInstance, { pool, companion, installed }: Deps): void {
  app.post<{ Headers: Headers; Body: PersonalAnswerSend }>(
    '/api/v1/personal/answers',
    {
      schema: { headers, body: { $ref: 'PersonalAnswerSend#' }, response: { 202: { $ref: 'PersonalAnswerReceipt#' } } },
    },
    async (req, reply) => {
      await installed()
      const profile = profileFor(companion, req.actorId)
      const receipt: PersonalAnswerReceipt = await withActor(pool, req.actorId, 'write', (c) =>
        sendPersonalAnswerInput(c, req.headers['idempotency-key'], {
          contract: PERSONAL_ANSWER_V1,
          epoch: epochOf(req.headers),
          text: req.body.text,
          profile,
        }),
      )
      // Committed (a replay too): the owner's oldest waiting turn is resumed; its answer passes 0102's guard. A write
      // that failed, or whose outcome is unknown, threw above and wakes nothing.
      void companion.resume(req.actorId)
      return reply.status(202).send(receipt)
    },
  )

  app.post<{ Headers: Headers; Params: Params; Body: PersonalAnswerRetry }>(
    '/api/v1/personal/answers/:inputId/retry',
    {
      schema: {
        params,
        headers,
        body: { $ref: 'PersonalAnswerRetry#' },
        response: { 202: { $ref: 'PersonalAnswerReceipt#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const profile = profileFor(companion, req.actorId)
      const receipt: PersonalAnswerReceipt = await decided(() =>
        withActor(pool, req.actorId, 'write', (c) =>
          retryPersonalAnswerInput(c, req.headers['idempotency-key'], {
            inputId: req.params.inputId,
            expectedSeq: req.body.expectedSeq,
            epoch: epochOf(req.headers),
            profile,
          }),
        ),
      )
      void companion.resume(req.actorId)
      return reply.status(202).send(receipt)
    },
  )
}

/** Cancel: terminal and owner-scoped; any owner may cancel their own waiting input, and nothing is woken. */
function cancelRoute(app: FastifyInstance, { pool, installed }: Deps): void {
  app.post<{ Headers: Headers; Params: Params; Body: PersonalAnswerCancel }>(
    '/api/v1/personal/answers/:inputId/cancel',
    {
      schema: {
        params,
        headers,
        body: { $ref: 'PersonalAnswerCancel#' },
        response: { 202: { $ref: 'PersonalAnswerReceipt#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const receipt: PersonalAnswerReceipt = await decided(() =>
        withActor(pool, req.actorId, 'write', (c) =>
          cancelPersonalAnswerInput(c, req.headers['idempotency-key'], {
            inputId: req.params.inputId,
            expectedSeq: req.body.expectedSeq,
            epoch: epochOf(req.headers),
          }),
        ),
      )
      return reply.status(202).send(receipt)
    },
  )
}

/** The decisions as the list carries them: the receipt's fields and when each was made; the frozen profile left out. */
function listOf(records: readonly PersonalAnswerDecisionRecord[]): PersonalAnswerDecisionList | null {
  const first = records[0]
  if (!first) return null
  return {
    inputId: first.inputId,
    turnId: first.turnId,
    decisions: records.map((r) => ({
      decision: {
        seq: r.seq,
        operation: r.operation,
        outcome: r.outcome,
        reason: r.reason,
        late: r.late,
        epoch: r.epoch,
        admittedAt: r.admittedAt,
        policy: r.policy,
        policyVersion: r.policyVersion,
        family: r.family,
        basis: r.basis,
      },
      createdAt: r.createdAt,
    })),
  }
}

/** The owner's own input's decisions: effect-free; another owner's, an unknown and a record-only input read alike. */
function readRoute(app: FastifyInstance, { pool, installed }: Deps): void {
  app.get<{ Params: Params }>(
    '/api/v1/personal/answers/:inputId/decisions',
    { schema: { params, response: { 200: { $ref: 'PersonalAnswerDecisionList#' } } } },
    async (req) => {
      await installed()
      const records = await withActor(pool, req.actorId, 'read', (c) =>
        readPersonalAnswerDecisions(c, req.params.inputId),
      )
      const list = listOf(records)
      if (!list) throw new DomainError('not_found', NO_INPUT)
      return list
    },
  )
}
