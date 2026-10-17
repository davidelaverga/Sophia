// Reply-owned runtime calls use the registered capability/lease; SQL owns all scope, admission and accounting.
import type pg from 'pg'
import type {
  RuntimeConversationClaimRequest,
  RuntimeConversationClaimReply,
  RuntimeConversationGoRequest,
  RuntimeConversationGoReply,
  RuntimeConversationReserveRequest,
  RuntimeConversationReservation,
  RuntimeConversationSettleRequest,
  RuntimeConversationSettlement,
  RuntimeConversationAcknowledgedRequest,
  RuntimeConversationAcknowledgement,
} from '@sophia/contracts'
import type { RuntimeCaller } from './runtime.ts'
import { onlyRow } from './rows.ts'

const args = (who: RuntimeCaller) => [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId]

async function operation<T>(c: pg.PoolClient, fn: string, who: RuntimeCaller, request: unknown): Promise<T> {
  const { rows } = await c.query<{ reply: T }>(`SELECT sophia.${fn}($1, $2, $3, $4) AS reply`, [
    ...args(who),
    JSON.stringify(request),
  ])
  return onlyRow(rows, fn).reply
}

export const runtimeConversationClaim = (
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: RuntimeConversationClaimRequest,
) => operation<RuntimeConversationClaimReply>(c, 'runtime_conversation_claim', who, request)

export const runtimeConversationGo = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationGoRequest) =>
  operation<RuntimeConversationGoReply>(c, 'runtime_conversation_go', who, request)

export const runtimeConversationReserve = (
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: RuntimeConversationReserveRequest,
) => operation<RuntimeConversationReservation>(c, 'runtime_conversation_reserve', who, request)

export const runtimeConversationSettle = (
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: RuntimeConversationSettleRequest,
) => operation<RuntimeConversationSettlement>(c, 'runtime_conversation_settle', who, request)

export const runtimeConversationAcknowledged = (
  c: pg.PoolClient,
  who: RuntimeCaller,
  request: RuntimeConversationAcknowledgedRequest,
) => operation<RuntimeConversationAcknowledgement>(c, 'runtime_conversation_acknowledged', who, request)
