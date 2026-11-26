import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import type {
  AddressedConversationInputSend,
  AddressedConversationInputStart,
  ConversationInputRecorded,
  ConversationInputStarted,
} from '@sophia/contracts'
import {
  nameActor,
  readConversationArtifactVersion,
  readConversationMessage,
  readConversationSummary,
  readFeedPosition,
  recordAddressedInputObservation,
  sendAddressedConversationInput,
  startAddressedConversationInput,
  withActor,
} from '@sophia/persistence'
import { DomainError } from '@sophia/domain'
import { conversationInputRef, conversationInputsInstallation } from './conversation-inputs.ts'
import { namesOf } from './profile.ts'
import { idempotencyHeader, projectParams, UUID_PATTERN } from './schemas.ts'

export const CONVERSATION_INPUT_ADDRESSING_SCHEMA = `SELECT
  to_regprocedure('sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb)') IS NOT NULL
  AND to_regprocedure('sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid)') IS NOT NULL AS ok`

export const CONVERSATION_INPUT_REPLAY_SCHEMA = `SELECT
  to_regprocedure('sophia.addressed_input_replay_installed()') IS NOT NULL AS ok`

export const CONVERSATION_INPUT_OBSERVATION_SCHEMA = `SELECT
  to_regprocedure('sophia.read_saved_conversation_input_context(uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.record_saved_conversation_input_observation(uuid,uuid,uuid,jsonb)') IS NOT NULL AS ok`

const CONVERSATION_ARTIFACT_VERSION_SCHEMA = `SELECT
  to_regprocedure('sophia.conversation_artifact_version(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid,uuid)') IS NOT NULL AS ok`

const OBSERVATION_BUDGET_MS = 1000
type ObserveSavedInput = (
  request: FastifyRequest,
  input: { inputId: string; conversationId: string; projectId?: string },
) => Promise<void>

const conversationParams = {
  type: 'object',
  additionalProperties: false,
  properties: { conversationId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['conversationId'],
} as const

const artifactVersionParams = {
  type: 'object',
  additionalProperties: false,
  properties: { ...projectParams.properties, versionId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['projectId', 'versionId'],
} as const

/** A63 adds addressed writes beside A49 and returns the existing record-only receipt. */
export function conversationInputAddressingRoutes(
  app: FastifyInstance,
  { pool, observeInputs, replayOnly = false }: { pool: pg.Pool; observeInputs: boolean; replayOnly?: boolean },
): void {
  const addressingInstalled = conversationInputsInstallation(
    pool,
    CONVERSATION_INPUT_ADDRESSING_SCHEMA,
    'Addressed conversation inputs are not installed on this database',
  )
  const artifactVersionInstalled = conversationInputsInstallation(
    pool,
    CONVERSATION_ARTIFACT_VERSION_SCHEMA,
    'Artifact context is not installed on this database',
  )
  const replayInstalled = conversationInputsInstallation(
    pool,
    CONVERSATION_INPUT_REPLAY_SCHEMA,
    'Addressed input replay is not installed on this database',
  )
  const installed = async (versionId?: string) => {
    if (replayOnly) await replayInstalled()
    await addressingInstalled()
    if (versionId !== undefined) await artifactVersionInstalled()
  }
  registerArtifactVersionRead(app, pool, artifactVersionInstalled)
  const observe = observeInputs && !replayOnly ? savedInputObserver(pool) : undefined
  registerAddressedStart(app, pool, installed, { observe, replayOnly })
  registerAddressedSend(app, pool, installed, { observe, replayOnly })
}

function registerArtifactVersionRead(app: FastifyInstance, pool: pg.Pool, installed: () => Promise<void>): void {
  app.get<{ Params: { projectId: string; versionId: string } }>(
    '/api/v1/projects/:projectId/conversation-artifact-versions/:versionId',
    { schema: { params: artifactVersionParams, response: { 200: { $ref: 'ConversationArtifactVersion#' } } } },
    async (request) => {
      await installed()
      const { projectId, versionId } = request.params
      return withActor(pool, request.actorId, 'read', (client) =>
        readConversationArtifactVersion(client, projectId, versionId),
      )
    },
  )
}

/** Called after the input commits. The same HTTP idempotency key can retry a missed observation. */
function savedInputObserver(pool: pg.Pool): ObserveSavedInput {
  return async (request, input) => {
    try {
      await recordAddressedInputObservation(pool, request.actorId, input, {
        deadline: performance.now() + OBSERVATION_BUDGET_MS,
        signal: AbortSignal.timeout(OBSERVATION_BUDGET_MS),
      })
    } catch {
      request.log.warn('Saved input observation unavailable')
    }
  }
}

/** Require 0133 again in this transaction before any guarded writer; replay never updates the actor profile. */
async function inputName(client: pg.PoolClient, request: FastifyRequest, replayOnly: boolean): Promise<string | null> {
  if (!replayOnly) return nameActor(client, namesOf(request))
  const { rows } = await client.query<{ ok: boolean }>('SELECT sophia.addressed_input_replay_installed() AS ok')
  if (rows[0]?.ok !== true) throw new DomainError('projection_unavailable', 'Addressed input replay unavailable')
  await client.query("SELECT set_config('sophia.addressed_input_replay', 'on', true)")
  return null
}

function registerAddressedStart(
  app: FastifyInstance,
  pool: pg.Pool,
  installed: (versionId?: string) => Promise<void>,
  { observe, replayOnly }: { observe: ObserveSavedInput | undefined; replayOnly: boolean },
): void {
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
      const { artifactVersionId } = request.body
      await installed(artifactVersionId)
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
            await inputName(client, request, replayOnly),
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
      if (artifactVersionId === undefined)
        await observe?.(request, { projectId, inputId: started.input.id, conversationId: started.conversation.id })
      return reply.status(202).send(started)
    },
  )
}

function registerAddressedSend(
  app: FastifyInstance,
  pool: pg.Pool,
  installed: (versionId?: string) => Promise<void>,
  { observe, replayOnly }: { observe: ObserveSavedInput | undefined; replayOnly: boolean },
): void {
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
      const { artifactVersionId } = request.body
      await installed(artifactVersionId)
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
            await inputName(client, request, replayOnly),
          )
          const message = await readConversationMessage(client, result.messageId)
          return { message, input: conversationInputRef(result) }
        },
      )
      if (artifactVersionId === undefined)
        await observe?.(request, { inputId: recorded.input.id, conversationId: request.params.conversationId })
      return reply.status(202).send(recorded)
    },
  )
}
