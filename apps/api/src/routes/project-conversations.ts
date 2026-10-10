// Saved project conversations (CON-01, contract amendment A16, db/migrations/0048). Members read; writers (admins and
// editors) start and continue them in a project whose conversations are on; an author withdraws their own message and
// an admin any, or erases a conversation. Each write is one sophia.* function under the member's own identity,
// idempotent per Idempotency-Key, and answers with the records read back under that member in the same transaction.
// The author's name is the verified token's (req.actorName), never the client's. Nothing here reaches a model:
// asking Sophia records a reply request that says its own state.
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  ConversationMessageSent,
  ConversationSend,
  ConversationStart,
  ConversationStarted,
  ConversationWithdrawal,
} from '@sophia/contracts'
import {
  eraseConversation,
  readConversationList,
  readConversationMessage,
  readConversationPage,
  readConversationReply,
  readProjectConversationPage,
  readConversationSummary,
  readFeedPosition,
  sendConversationMessage,
  startConversation,
  withActor,
  withdrawConversationMessage,
  type ConversationReceipt,
} from '@sophia/persistence'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

const conversationParams = {
  type: 'object',
  additionalProperties: false,
  properties: { conversationId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['conversationId'],
} as const

const projectConversationParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    conversationId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'conversationId'],
} as const

const messageParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    conversationId: { type: 'string', pattern: UUID_PATTERN },
    messageId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['conversationId', 'messageId'],
} as const

const pageQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { before: { type: 'string', minLength: 1, maxLength: 200 } },
} as const

/** The functions 0048 adds that these routes call; /ready requires them only while the routes are served. */
export const CONVERSATION_SCHEMA = `SELECT to_regprocedure('sophia.start_conversation(uuid,text,text,text,boolean,text)') IS NOT NULL
  AND to_regprocedure('sophia.send_conversation_message(uuid,text,text,boolean,text)') IS NOT NULL
  AND to_regprocedure('sophia.withdraw_conversation_message(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.erase_conversation(uuid,text)') IS NOT NULL
  AND to_regprocedure('sophia.conversation_access(uuid)') IS NOT NULL AS ok`

/** The message and its reply request, as the write left them, read under the writer. */
async function written(c: pg.PoolClient, r: ConversationReceipt): Promise<ConversationMessageSent> {
  const message = await readConversationMessage(c, r.messageId)
  const reply = r.replyId ? await readConversationReply(c, r.replyId) : null
  return { message, sophia: r.sophia, reply }
}

export function projectConversationRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  readRoutes(app, deps)
  writeRoutes(app, deps)
  removalRoutes(app, deps)
}

/** The list and a conversation's pages: members, viewers included. */
function readRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/conversations',
    { schema: { params: projectParams, response: { 200: { $ref: 'ConversationList#' } } } },
    async (req) => withActor(pool, req.actorId, 'read', (c) => readConversationList(c, req.params.projectId)),
  )

  app.get<{ Params: { conversationId: string }; Querystring: { before?: string } }>(
    '/api/v1/conversations/:conversationId/messages',
    {
      schema: {
        params: conversationParams,
        querystring: pageQuery,
        response: { 200: { $ref: 'ConversationMessagePage#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) =>
        readConversationPage(c, req.params.conversationId, req.query.before ?? null),
      ),
  )

  // Within its project, in one snapshot: a non-member is refused (403) before anything of the conversation is read;
  // to a member, not found means none open in this project (CON-01-CC-0072).
  app.get<{ Params: { projectId: string; conversationId: string }; Querystring: { before?: string } }>(
    '/api/v1/projects/:projectId/conversations/:conversationId/messages',
    {
      schema: {
        params: projectConversationParams,
        querystring: pageQuery,
        response: { 200: { $ref: 'ConversationMessagePage#' } },
      },
    },
    async (req) =>
      withActor(pool, req.actorId, 'read', (c) =>
        readProjectConversationPage(c, req.params.projectId, req.params.conversationId, req.query.before ?? null),
      ),
  )
}

/** Start and continue: writers, once per key, read back under the writer in the same transaction. */
function writeRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.post<{ Params: { projectId: string }; Headers: { 'idempotency-key': string }; Body: ConversationStart }>(
    '/api/v1/projects/:projectId/conversations',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'ConversationStart#' },
        response: { 202: { $ref: 'ConversationStarted#' } },
      },
    },
    async (req, reply) => {
      const started = await withActor(pool, req.actorId, 'write', async (c): Promise<ConversationStarted> => {
        const r = await startConversation(
          c,
          req.params.projectId,
          req.headers['idempotency-key'],
          req.body,
          req.actorName,
        )
        const conversation = await readConversationSummary(c, r.conversationId)
        const receipt = await written(c, r)
        // Where this receipt is current: read last, under the project lock the start holds until commit.
        return { conversation, ...receipt, cursor: await readFeedPosition(c, req.params.projectId) }
      })
      return reply.status(202).send(started)
    },
  )

  app.post<{ Params: { conversationId: string }; Headers: { 'idempotency-key': string }; Body: ConversationSend }>(
    '/api/v1/conversations/:conversationId/messages',
    {
      schema: {
        params: conversationParams,
        headers: idempotencyHeader,
        body: { $ref: 'ConversationSend#' },
        response: { 202: { $ref: 'ConversationMessageSent#' } },
      },
    },
    async (req, reply) => {
      const sent = await withActor(pool, req.actorId, 'write', async (c) =>
        written(
          c,
          await sendConversationMessage(
            c,
            req.params.conversationId,
            req.headers['idempotency-key'],
            req.body,
            req.actorName,
          ),
        ),
      )
      return reply.status(202).send(sent)
    },
  )
}

/** Withdrawal (an author their own, an admin any) and erasure (admins): never switched off. */
function removalRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  app.post<{ Params: { conversationId: string; messageId: string }; Headers: { 'idempotency-key': string } }>(
    '/api/v1/conversations/:conversationId/messages/:messageId/withdrawal',
    {
      schema: {
        params: messageParams,
        headers: idempotencyHeader,
        response: { 202: { $ref: 'ConversationWithdrawal#' } },
      },
    },
    async (req, reply) => {
      const { conversationId, messageId } = req.params
      const withdrawn = await withActor(pool, req.actorId, 'write', async (c): Promise<ConversationWithdrawal> => {
        await withdrawConversationMessage(c, conversationId, messageId, req.headers['idempotency-key'])
        return { conversationId, message: await readConversationMessage(c, messageId) }
      })
      return reply.status(202).send(withdrawn)
    },
  )

  app.post<{ Params: { conversationId: string }; Headers: { 'idempotency-key': string } }>(
    '/api/v1/conversations/:conversationId/erasure',
    {
      schema: {
        params: conversationParams,
        headers: idempotencyHeader,
        response: { 202: { $ref: 'ConversationErasure#' } },
      },
    },
    async (req, reply) => {
      const { conversationId } = req.params
      await withActor(pool, req.actorId, 'write', (c) =>
        eraseConversation(c, conversationId, req.headers['idempotency-key']),
      )
      return reply.status(202).send({ conversationId, erased: true })
    },
  )
}
