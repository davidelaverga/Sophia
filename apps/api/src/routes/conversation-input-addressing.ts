import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type {
  AddressedConversationInputSend,
  AddressedConversationInputStart,
  ConversationInputRecorded,
  ConversationInputStarted,
} from '@sophia/contracts'
import {
  nameActor,
  readConversationMessage,
  readConversationSummary,
  readFeedPosition,
  sendAddressedConversationInput,
  startAddressedConversationInput,
  withActor,
} from '@sophia/persistence'
import { conversationInputRef, conversationInputsInstallation } from './conversation-inputs.ts'
import { namesOf } from './profile.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

export const CONVERSATION_INPUT_ADDRESSING_SCHEMA = `SELECT
  to_regprocedure('sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid)') IS NOT NULL AS ok`

const conversationParams = {
  type: 'object',
  additionalProperties: false,
  properties: { conversationId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['conversationId'],
} as const

/** A63 adds addressed writes beside A49 and returns the existing record-only receipt. */
export function conversationInputAddressingRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }): void {
  const installed = conversationInputsInstallation(
    pool,
    CONVERSATION_INPUT_ADDRESSING_SCHEMA,
    'Addressed conversation inputs are not installed on this database',
  )
  registerAddressedStart(app, pool, installed)
  registerAddressedSend(app, pool, installed)
}

function registerAddressedStart(app: FastifyInstance, pool: pg.Pool, installed: () => Promise<void>): void {
  app.post<{
    Params: { projectId: string }
    Headers: { 'idempotency-key': string }
    Body: AddressedConversationInputStart
  }>(
    '/api/v1/projects/:projectId/conversation-inputs/addressed',
    {
      schema: {
        params: projectParams,
        headers: idempotencyHeader,
        body: { $ref: 'AddressedConversationInputStart#' },
        response: { 202: { $ref: 'ConversationInputStarted#' } },
      },
    },
    async (request, reply) => {
      await installed()
      const { projectId } = request.params
      const started = await withActor(
        pool,
        request.actorId,
        'write',
        async (client): Promise<ConversationInputStarted> => {
          const result = await startAddressedConversationInput(
            client,
            projectId,
            request.headers['idempotency-key'],
            request.body,
            await nameActor(client, namesOf(request)),
          )
          const conversation = await readConversationSummary(client, result.conversationId)
          const message = await readConversationMessage(client, result.messageId)
          return {
            conversation,
            message,
            input: conversationInputRef(result),
            cursor: await readFeedPosition(client, projectId),
          }
        },
      )
      return reply.status(202).send(started)
    },
  )
}

function registerAddressedSend(app: FastifyInstance, pool: pg.Pool, installed: () => Promise<void>): void {
  app.post<{
    Params: { conversationId: string }
    Headers: { 'idempotency-key': string }
    Body: AddressedConversationInputSend
  }>(
    '/api/v1/conversations/:conversationId/inputs/addressed',
    {
      schema: {
        params: conversationParams,
        headers: idempotencyHeader,
        body: { $ref: 'AddressedConversationInputSend#' },
        response: { 202: { $ref: 'ConversationInputRecorded#' } },
      },
    },
    async (request, reply) => {
      await installed()
      const recorded = await withActor(
        pool,
        request.actorId,
        'write',
        async (client): Promise<ConversationInputRecorded> => {
          const result = await sendAddressedConversationInput(
            client,
            request.params.conversationId,
            request.headers['idempotency-key'],
            request.body,
            await nameActor(client, namesOf(request)),
          )
          const message = await readConversationMessage(client, result.messageId)
          return { message, input: conversationInputRef(result) }
        },
      )
      return reply.status(202).send(recorded)
    },
  )
}
