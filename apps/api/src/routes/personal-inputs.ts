// Personal automatic inputs (INC03-CC-002 P2, contract amendment A52, migrations 0098 and 0099). The owner's message
// is kept once in their Personal space under the explicit automatic_v1 contract, held (`recorded`), and nothing follows
// from it: no companion is woken or asked, nothing is assessed, claimed, reserved, notified, routed or worked on.
//
// The owner is the verified token's subject, never a field: the body is closed (interactionContract and text only), and
// a missing, null or other contract is refused by the schema before anything is read. As every Personal write, it names
// the space's epoch (x-sophia-personal-epoch) and its Idempotency-Key is in the owner's one Personal key namespace: the
// same key and words replay the first receipt; other words, the legacy send or another operation under it conflict, and
// after an erasure an older key or epoch is refused (0098's writer, which fences before it reads the key).
//
// The receipt is the exact turn kept, read in the write's own transaction through the owner's own input row, and the
// input's metadata (A52 PersonalInputRecorded). The legacy POST /api/v1/personal/turns, its PersonalReceipt and its
// companion are untouched (routes/personal.ts). Mounted only when the API is built with personalInputs (off by default;
// server.ts and the environment never set it); a database without 0098's writer or 0099's welcome rule answers
// projection_unavailable (503), never a database message.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { PersonalInputRecorded, PersonalInputSend } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { PERSONAL_AUTOMATIC_V1, recordPersonalInput, withActor } from '@sophia/persistence'
import { idempotencyHeader } from './schemas.ts'

/**
 * What the route needs of the database: 0098's writer, and 0099's welcome rule (held words are not activity), so held
 * words are never kept where a welcome would count them.
 */
export const PERSONAL_INPUTS_SCHEMA = `SELECT to_regprocedure('sophia.send_personal_input(text,text,bigint,text)') IS NOT NULL
  AND coalesce((SELECT position('recorded' IN p.prosrc) > 0 FROM pg_catalog.pg_proc p
                 WHERE p.oid = to_regprocedure('sophia.personal_welcome_due()')), false) AS ok`

type Headers = { 'idempotency-key': string; 'x-sophia-personal-epoch': string }

/** The write's key, and the epoch it is made against: at most 15 digits, so a safe integer (as routes/personal.ts). */
const headers = {
  type: 'object',
  properties: {
    ...idempotencyHeader.properties,
    'x-sophia-personal-epoch': { type: 'string', pattern: '^(0|[1-9][0-9]{0,14})$' },
  },
  required: [...idempotencyHeader.required, 'x-sophia-personal-epoch'],
} as const

/** Whether 0098 and 0099 are installed: remembered once seen (a migration is never undone under a running API). */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(PERSONAL_INPUTS_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok) throw new DomainError('projection_unavailable', 'Personal inputs are not installed on this database')
    installed = true
  }
}

export function personalInputRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  const installed = installation(pool)

  app.post<{ Headers: Headers; Body: PersonalInputSend }>(
    '/api/v1/personal/inputs',
    {
      schema: {
        headers,
        body: { $ref: 'PersonalInputSend#' },
        response: { 202: { $ref: 'PersonalInputRecorded#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const recorded: PersonalInputRecorded = await withActor(pool, req.actorId, 'write', (c) =>
        recordPersonalInput(c, req.headers['idempotency-key'], {
          contract: PERSONAL_AUTOMATIC_V1,
          epoch: Number(req.headers['x-sophia-personal-epoch']),
          text: req.body.text,
        }),
      )
      return reply.status(202).send(recorded)
    },
  )
}
