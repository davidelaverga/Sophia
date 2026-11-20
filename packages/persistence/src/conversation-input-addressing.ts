import type pg from 'pg'
import type { AddressedConversationInputSend, AddressedConversationInputStart } from '@sophia/contracts'
import { isInputReceipt, type ConversationInputReceipt } from './conversation-inputs.ts'
import { onlyRow } from './rows.ts'

async function addressedInputReceipt(
  client: pg.PoolClient,
  statement: string,
  sql: string,
  parameters: unknown[],
): Promise<ConversationInputReceipt> {
  const { rows } = await client.query<{ receipt: unknown }>(sql, parameters)
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
    'SELECT sophia.start_conversation_addressed_input($1, $2, $3, $4, $5, $6, $7::jsonb) AS receipt',
    [projectId, key, body.interactionContract, body.title, body.text, name, JSON.stringify(body.mentions)],
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
    'SELECT sophia.send_conversation_addressed_input($1, $2, $3, $4, $5, $6::jsonb, $7::uuid) AS receipt',
    [
      conversationId,
      key,
      body.interactionContract,
      body.text,
      name,
      JSON.stringify(body.mentions),
      body.replyToMessageId,
    ],
  )
}
