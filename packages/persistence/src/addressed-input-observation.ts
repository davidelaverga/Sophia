// Ephemeral deterministic observation of one retained A63 input. No ledger, admission, notification or dispatch.
import type pg from 'pg'
import { observeIntake, type IntakeObservation } from '@sophia/coordination'
import { readAddressedConversationInput, type AddressedConversationInputRead } from './conversation-input-addressing.ts'
import { withActor } from './tx.ts'

export interface AddressedInputScope {
  projectId: string
  conversationId: string
  inputId: string
}

export interface AddressedInputObservation {
  readonly source: AddressedInputScope & {
    readonly messageId: string
    readonly actorId: string
    readonly origin: 'text'
    readonly messageSeq: string
    readonly conversationRevision: string
    readonly erasureRevision: string
    readonly observedConversationRevision: string
  }
  readonly observation: IntakeObservation
}

/** Only address members validated in the same RLS snapshot enter the policy; no other facts are defaulted in. */
function observeRetained(input: AddressedConversationInputRead): IntakeObservation {
  const reply = input.replyTarget
  const memberAuthor = reply?.actorId
  const result = observeIntake({
    interaction: { contract: 'automatic_v1' },
    text: input.text,
    context: {
      audience: 'project',
      originalAudience: 'project',
      origin: 'human',
      operationId: input.inputId,
      trustedMentions: input.mentions,
      currentMembers: [...new Set([...input.mentions, ...(memberAuthor ? [memberAuthor] : [])])],
      ...(reply ? { replyTo: reply.messageId, replyAuthor: reply.author === 'sophia' ? 'sophia' : reply.actorId } : {}),
    },
  })
  if (!result.ok) throw new Error('Retained addressed input does not satisfy the observation contract')
  return result.observation
}

/**
 * The initiating actor must already be verified by the application. A viewer may read a peer's message, but may not
 * reinterpret it as their own instruction. Null means no eligible proposal, never an unaddressed/default fallback.
 * Every call rechecks current context; this snapshot is observation only and grants no continuing admission authority.
 */
export function observeAddressedConversationInput(
  pool: pg.Pool,
  verifiedActorId: string,
  scope: AddressedInputScope,
): Promise<AddressedInputObservation | null> {
  return withActor(pool, verifiedActorId, 'read', async (client) => {
    const input = await readAddressedConversationInput(client, scope.projectId, scope.conversationId, scope.inputId)
    if (!input || input.actorId !== verifiedActorId) return null
    return addressedObservationOf(input)
  })
}

/** Shared mapping for the ephemeral read and the lock-held durable writer; not a package-level caller-facts API. */
export function addressedObservationOf(input: AddressedConversationInputRead): AddressedInputObservation {
  return {
    source: {
      projectId: input.projectId,
      conversationId: input.conversationId,
      inputId: input.inputId,
      messageId: input.messageId,
      actorId: input.actorId,
      origin: 'text',
      messageSeq: input.messageSeq,
      conversationRevision: input.conversationRevision,
      erasureRevision: input.erasureRevision,
      observedConversationRevision: input.observedConversationRevision,
    },
    observation: observeRetained(input),
  }
}
