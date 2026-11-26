import type pg from 'pg'
import type {
  AddressedConversationInputSend,
  AddressedConversationInputStart,
  ConversationArtifactVersion,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { isInputReceipt, type ConversationInputReceipt } from './conversation-inputs.ts'
import { onlyRow } from './rows.ts'

async function addressedInputReceipt(
  client: pg.PoolClient,
  statement: 'start_conversation_addressed_input' | 'send_conversation_addressed_input',
  argumentsSql: string,
  parameters: unknown[],
  artifactVersionId: string | undefined,
): Promise<ConversationInputReceipt> {
  const scoped = artifactVersionId !== undefined
  const { rows } = await client.query<{ receipt: unknown }>(
    `SELECT sophia.${statement}(${argumentsSql}${scoped ? ', $8::uuid' : ''}) AS receipt`,
    scoped ? [...parameters, artifactVersionId] : parameters,
  )
  const { receipt } = onlyRow(rows, statement)
  if (!isInputReceipt(receipt)) throw new Error(statement + ' returned an unexpected receipt')
  return receipt
}

/** Record the first message and its structured member choices inside the caller's write transaction. */
export function startAddressedConversationInput(
  client: pg.PoolClient,
  projectId: string,
  key: string,
  body: AddressedConversationInputStart,
  name: string | null,
): Promise<ConversationInputReceipt> {
  return addressedInputReceipt(
    client,
    'start_conversation_addressed_input',
    '$1, $2, $3, $4, $5, $6, $7::jsonb',
    [projectId, key, body.interactionContract, body.title, body.text, name, JSON.stringify(body.mentions)],
    body.artifactVersionId,
  )
}

/** Record the exact existing reply target and structured member choices without dispatching work. */
export function sendAddressedConversationInput(
  client: pg.PoolClient,
  conversationId: string,
  key: string,
  body: AddressedConversationInputSend,
  name: string | null,
): Promise<ConversationInputReceipt> {
  return addressedInputReceipt(
    client,
    'send_conversation_addressed_input',
    '$1, $2, $3, $4, $5, $6::jsonb, $7::uuid',
    [
      conversationId,
      key,
      body.interactionContract,
      body.text,
      name,
      JSON.stringify(body.mentions),
      body.replyToMessageId,
    ],
    body.artifactVersionId,
  )
}

export async function readConversationArtifactVersion(
  client: pg.PoolClient,
  projectId: string,
  versionId: string,
): Promise<ConversationArtifactVersion> {
  const { rows } = await client.query<ConversationArtifactVersion>(
    'SELECT * FROM sophia.conversation_artifact_version($1,$2)',
    [projectId, versionId],
  )
  if (!rows[0]) throw new DomainError('not_found', 'Artifact version unavailable')
  return rows[0]
}

/** Ephemeral authorized content for observation only; this is never an admission or an effect permit. */
export interface AddressedConversationInputRead {
  inputId: string
  projectId: string
  conversationId: string
  messageId: string
  actorId: string
  text: string
  messageSeq: string
  conversationRevision: string
  erasureRevision: string
  observedConversationRevision: string
  mentions: string[]
  replyTarget: { messageId: string; seq: string; author: 'member' | 'sophia'; actorId: string | null } | null
}

/**
 * One RLS snapshot in the caller's withActor read transaction. Refuse the whole context when any exact reference is
 * unavailable; null means no eligible observer payload, never unaddressed fallback. Do not select target text.
 * Admission must revalidate again later.
 */
export async function readAddressedConversationInput(
  client: pg.PoolClient,
  projectId: string,
  conversationId: string,
  inputId: string,
): Promise<AddressedConversationInputRead | null> {
  const { rows } = await client.query<AddressedConversationInputRead>(
    'SELECT * FROM sophia.read_saved_conversation_input_context($1,$2,$3)',
    [projectId, conversationId, inputId],
  )
  return rows[0] ?? null
}
