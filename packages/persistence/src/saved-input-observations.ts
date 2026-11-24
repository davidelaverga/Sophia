// Immutable observation-only recording; never a payer, beneficiary, permit or effect admission.
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import type { ServiceControl } from './service-control.ts'
import { withActor, withActorWithin } from './tx.ts'
import { readAddressedConversationInput } from './conversation-input-addressing.ts'
import {
  addressedObservationOf,
  type AddressedInputObservation,
  type AddressedInputScope,
} from './addressed-input-observation.ts'
import { onlyRow } from './rows.ts'

type SavedInputRef = Omit<AddressedInputScope, 'projectId'> & { projectId?: string }

export interface SavedInputObservation {
  readonly recordId: string
  readonly schemaVersion: 1
  readonly state: 'observed'
  readonly effect: 'none'
  readonly recordedAt: string
  readonly context: {
    readonly audienceKind: 'project_members'
    readonly audienceRevision: string
    readonly mentions: readonly string[]
    readonly replyTarget: { messageId: string; seq: string; author: 'member' | 'sophia'; actorId: string | null } | null
  }
  readonly payload: {
    readonly source: AddressedInputObservation['source']
    readonly observation: Omit<AddressedInputObservation['observation'], 'inputSha256' | 'observationId'>
  }
}

async function writeObservation(
  client: pg.PoolClient,
  scope: AddressedInputScope,
  payload: AddressedInputObservation | null,
) {
  const { rows } = await client.query<{ receipt: SavedInputObservation | null }>(
    'SELECT sophia.record_saved_conversation_input_observation($1,$2,$3,$4::jsonb) AS receipt',
    [scope.projectId, scope.conversationId, scope.inputId, payload === null ? null : JSON.stringify(payload)],
  )
  return onlyRow(rows, 'record_saved_conversation_input_observation').receipt
}

/**
 * SQL NULL is a lock-held probe, not an observation or caller-selected policy. Both paths recheck writer/sender and
 * exact current context. An existing immutable record returns before policy invocation, including across upgrades.
 */
export function recordAddressedInputObservation(
  pool: pg.Pool,
  verifiedActorId: string,
  inputRef: SavedInputRef,
  control?: ServiceControl,
): Promise<SavedInputObservation> {
  const record = async (client: pg.PoolClient, within?: () => Promise<void>) => {
    const projectId = inputRef.projectId ?? (await projectForInput(client, inputRef))
    const scope = { ...inputRef, projectId }
    await within?.()
    const prior = await writeObservation(client, scope, null)
    if (prior) return prior
    await within?.()
    const input = await readAddressedConversationInput(client, scope.projectId, scope.conversationId, scope.inputId)
    if (!input || input.actorId !== verifiedActorId) throw new DomainError('not_found', 'Input unavailable')
    await within?.()
    const recorded = await writeObservation(client, scope, addressedObservationOf(input))
    if (!recorded) throw new Error('Observation writer returned no record')
    return recorded
  }
  return control
    ? withActorWithin(pool, verifiedActorId, 'write', record, control)
    : withActor(pool, verifiedActorId, 'write', record)
}

/** The send route has a conversation ID and only resolves a current sender's saved input. */
async function projectForInput(client: pg.PoolClient, { inputId, conversationId }: SavedInputRef): Promise<string> {
  const { rows } = await client.query<{ projectId: string }>(
    `SELECT project_id AS "projectId" FROM sophia.saved_conversation_inputs
      WHERE id=$1 AND conversation_id=$2 AND actor_id=sophia.actor_id()`,
    [inputId, conversationId],
  )
  if (!rows[0]) throw new DomainError('not_found', 'Input unavailable')
  return rows[0].projectId
}
