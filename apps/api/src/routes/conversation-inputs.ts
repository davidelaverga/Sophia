// Saved-conversation automatic inputs (INC03-CC-002 S01b, contract amendment A49, migration 0095). A writer's message is
// kept once, as a conversation message, with a metadata-only input record under the explicit automatic_v1 contract, and
// nothing follows from it: no reply, assessment, attention, notification, outbox or work.
//
// The actor is the verified token's subject and the author name is the token's (nameActor), never a field of the
// request. The bodies are closed: no actor, name, audience, origin, mention, reply, selection, context or askSophia.
// Authority (a current admin or editor), audience, settings and revisions are the database's, under its locks; path ids
// reach SQL as typed uuids. The same Idempotency-Key and request replays the first receipt under the caller's current
// authority; another request under the key is idempotency_conflict (0063's conversation_prior).
//
// Mounted only when the API is built with conversations and conversationInputs (both off by default; server.ts wires
// conversations from SOPHIA_CONVERSATIONS and never sets conversationInputs). A database without 0095 answers
// projection_unavailable (503), never a database message.
// The legacy A33 routes (project-conversations.ts) are untouched.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  ConversationInputRecorded,
  ConversationInputRef,
  ConversationInputSend,
  ConversationInputStart,
  ConversationInputStarted,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  nameActor,
  readConversationMessage,
  readConversationSummary,
  readFeedPosition,
  sendConversationInput,
  startConversationInput,
  withActor,
  type ConversationInputReceipt,
} from '@sophia/persistence'
import { namesOf } from './profile.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

/** What the routes call of 0095: its two writers. /ready requires them only while the routes are served. */
export const CONVERSATION_INPUTS_SCHEMA = `SELECT to_regprocedure('sophia.start_conversation_input(uuid,text,text,text,text,text)') IS NOT NULL
  AND to_regprocedure('sophia.send_conversation_input(uuid,text,text,text,text)') IS NOT NULL AS ok`

const conversationParams = {
  type: 'object',
  additionalProperties: false,
  properties: { conversationId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['conversationId'],
} as const

/** Whether 0095 is installed: remembered once seen (a migration is never undone under a running API). */
function installation(pool: pg.Pool): () => Promise<void> {
  let installed = false
  return async () => {
    if (installed) return
    let ok = false
    try {
      const { rows } = await pool.query<{ ok: boolean }>(CONVERSATION_INPUTS_SCHEMA)
      ok = rows[0]?.ok === true
    } catch (err) {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }
    if (!ok) throw new DomainError('projection_unavailable', 'Automatic inputs are not installed on this database')
    installed = true
  }
}

/** The input as the receipt names it: recorded, with no effect. */
const inputRef = (r: ConversationInputReceipt): ConversationInputRef => ({
  id: r.inputId,
  interactionContract: r.interactionContract,
  contractVersion: r.contractVersion,
  state: r.input,
  effect: r.effect,
})

export function conversationInputRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  const installed = installation(pool)

  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: ConversationInputStart }>(
    '/api/v1/projects/:projectId/conversation-inputs',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'ConversationInputStart#' },
        response: { 202: { $ref: 'ConversationInputStarted#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const { projectId } = req.params
      const started = await withActor(pool, req.actorId, 'write', async (c): Promise<ConversationInputStarted> => {
        const r = await startConversationInput(
          c,
          projectId,
          req.headers['idempotency-key'],
          { contract: req.body.interactionContract, title: req.body.title, text: req.body.text },
          await nameActor(c, namesOf(req)),
        )
        const conversation = await readConversationSummary(c, r.conversationId)
        const message = await readConversationMessage(c, r.messageId)
        // Where this receipt is current: read last, under the project lock the start holds until commit.
        return { conversation, message, input: inputRef(r), cursor: await readFeedPosition(c, projectId) }
      })
      return reply.status(202).send(started)
    },
  )

  app.post<{ Params: { conversationId: string }; Headers: { 'idempotency-key': string }; Body: ConversationInputSend }>(
    '/api/v1/conversations/:conversationId/inputs',
    {
      schema: {
        params: conversationParams,
        headers: idempotencyHeader,
        body: { $ref: 'ConversationInputSend#' },
        response: { 202: { $ref: 'ConversationInputRecorded#' } },
      },
    },
    async (req, reply) => {
      await installed()
      const recorded = await withActor(pool, req.actorId, 'write', async (c): Promise<ConversationInputRecorded> => {
        const r = await sendConversationInput(
          c,
          req.params.conversationId,
          req.headers['idempotency-key'],
          { contract: req.body.interactionContract, text: req.body.text },
          await nameActor(c, namesOf(req)),
        )
        return { message: await readConversationMessage(c, r.messageId), input: inputRef(r) }
      })
      return reply.status(202).send(recorded)
    },
  )
}
