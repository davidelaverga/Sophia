// Versioned automatic conversation inputs (INC03-CC-002 S01a, migration 0095): a member's message in a saved project
// conversation, retained under the explicit `automatic_v1` contract, with no effect.
// What it guarantees:
// - The contract is an explicit, required argument checked here and again in SQL. Nothing is inferred from a missing
//   field or from a legacy askSophia boolean; the legacy writers (conversations.ts) never create an input.
// - Authority is the server's: the actor is the transaction's verified actor (withActor), the writer must be an admin
//   or editor of the project now, and audience, settings and context references are resolved by the database. No
//   actor, audience, origin, addressing, membership or approval is accepted from the caller.
// - One write: the member message, its idempotency record (the same per project/actor/key table and start/send
//   operations as the legacy writers), the input record and the existing conversation event. No reply, attempt,
//   binding, command, outbox, reservation, inference, provider, notification or grant.
// - The receipt says the input was recorded and that no effect follows. It never says received, accepted, verified
//   or started.
// What it does not do: route, assess, address, notify or answer. No route, contract amendment or index export uses it
// in this slice; its own tests are its only callers. Call inside withActor(..., 'write').
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { onlyRow } from './rows.ts'

/** The only interaction contract this boundary accepts. */
export const AUTOMATIC_V1 = 'automatic_v1'
export type AutomaticContract = typeof AUTOMATIC_V1

export interface ConversationInputStart {
  contract: AutomaticContract
  title: string
  text: string
}

export interface ConversationInputSend {
  contract: AutomaticContract
  text: string
}

/** What a recorded input answers: ids, the contract, and that nothing was set in motion. */
export interface ConversationInputReceipt {
  conversationId: string
  messageId: string
  inputId: string
  interactionContract: AutomaticContract
  contractVersion: 1
  input: 'recorded'
  effect: 'none'
}

const RECEIPT_KEYS = [
  'conversationId',
  'contractVersion',
  'effect',
  'input',
  'inputId',
  'interactionContract',
  'messageId',
].toSorted()

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

/** The receipt exactly as 0095 writes it: anything else is a programming error, never passed on. */
export function isInputReceipt(value: unknown): value is ConversationInputReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value).toSorted()
  if (keys.length !== RECEIPT_KEYS.length || keys.some((k, i) => k !== RECEIPT_KEYS[i])) return false
  const r: Record<string, unknown> = { ...value }
  return (
    isId(r.conversationId) &&
    isId(r.messageId) &&
    isId(r.inputId) &&
    r.interactionContract === AUTOMATIC_V1 &&
    r.contractVersion === 1 &&
    r.input === 'recorded' &&
    r.effect === 'none'
  )
}

/** The contract as given, refused unless it is exactly automatic_v1 (a caller typed elsewhere can still pass junk). */
function contractOf(contract: unknown): AutomaticContract {
  if (contract !== AUTOMATIC_V1) throw new DomainError('invalid_request', 'Invalid request')
  return AUTOMATIC_V1
}

async function inputReceipt(c: pg.PoolClient, statement: string, sql: string, params: unknown[]) {
  const { rows } = await c.query<{ receipt: unknown }>(sql, params)
  const value = onlyRow(rows, statement).receipt
  if (!isInputReceipt(value)) throw new Error(`${statement} returned an unexpected receipt`)
  return value
}

/** Start a conversation with its first message, retained as an automatic_v1 input. */
export const startConversationInput = (
  c: pg.PoolClient,
  projectId: string,
  key: string,
  write: ConversationInputStart,
  name: string | null,
): Promise<ConversationInputReceipt> =>
  inputReceipt(
    c,
    'start_conversation_input',
    'SELECT sophia.start_conversation_input($1, $2, $3, $4, $5, $6) AS receipt',
    [projectId, key, contractOf(write.contract), write.title, write.text, name],
  )

/** A message in a conversation, retained as an automatic_v1 input. */
export const sendConversationInput = (
  c: pg.PoolClient,
  conversationId: string,
  key: string,
  write: ConversationInputSend,
  name: string | null,
): Promise<ConversationInputReceipt> =>
  inputReceipt(c, 'send_conversation_input', 'SELECT sophia.send_conversation_input($1, $2, $3, $4, $5) AS receipt', [
    conversationId,
    key,
    contractOf(write.contract),
    write.text,
    name,
  ])
