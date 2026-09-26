// The runtime service (db/migrations/0012, contract amendment A04): what the API does for one registered dsh
// runtime. Every call runs inside withService, WITHOUT a member actor; the sophia.runtime_* functions authenticate the capability
// hash, the runtime unit and the lease themselves, so a runtime can never act as a person.
import { createHash } from 'node:crypto'
import type pg from 'pg'
import type {
  RuntimeCommandBatch,
  RuntimeHello,
  RuntimeHelloReply,
  RuntimeObservation,
  RuntimeReady,
  RuntimeReceipt,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'

/** Who is calling, as the transport headers and bearer say; nothing here is trusted until the database agrees. */
export interface RuntimeCaller {
  /** SHA-256 of the bearer capability (the capability itself is never passed to the database). */
  tokenSha256: Buffer
  runtimeUnitId: string
  bridgeInstanceId: string
}

/** The capability's hash as stored by `sophia.register_runtime`. */
export const runtimeTokenHash = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest()

const args = (who: RuntimeCaller) => [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId]

export async function runtimeHello(
  c: pg.PoolClient,
  who: RuntimeCaller,
  hello: RuntimeHello,
): Promise<RuntimeHelloReply> {
  const { rows } = await c.query<{ reply: RuntimeHelloReply }>(`SELECT sophia.runtime_hello($1, $2, $3, $4) AS reply`, [
    ...args(who),
    JSON.stringify(hello),
  ])
  return onlyRow(rows, 'runtime_hello').reply
}

/** The batch after `after`, and which runtime instance the caller is (the API wakes on its notifications). */
export async function runtimePoll(
  c: pg.PoolClient,
  who: RuntimeCaller,
  after: number,
): Promise<RuntimeCommandBatch & { runtimeId: string }> {
  const { rows } = await c.query<{ batch: RuntimeCommandBatch & { runtimeId: string } }>(
    `SELECT sophia.runtime_poll($1, $2, $3, $4) AS batch`,
    [...args(who), after],
  )
  return onlyRow(rows, 'runtime_poll').batch
}

/** Record receipts; returns how many were new (a repeat of a recorded stage changes nothing). */
export async function recordRuntimeReceipts(
  c: pg.PoolClient,
  who: RuntimeCaller,
  receipts: readonly RuntimeReceipt[],
): Promise<number> {
  const { rows } = await c.query<{ n: number }>(`SELECT sophia.runtime_record_receipts($1, $2, $3, $4) AS n`, [
    ...args(who),
    JSON.stringify(receipts),
  ])
  return onlyRow(rows, 'runtime_record_receipts').n
}

/** Record observations; returns how many were new. */
export async function recordRuntimeObservations(
  c: pg.PoolClient,
  who: RuntimeCaller,
  observations: readonly RuntimeObservation[],
): Promise<number> {
  const { rows } = await c.query<{ n: number }>(`SELECT sophia.runtime_record_observations($1, $2, $3, $4) AS n`, [
    ...args(who),
    JSON.stringify(observations),
  ])
  return onlyRow(rows, 'runtime_record_observations').n
}

export async function recordRuntimeReady(c: pg.PoolClient, who: RuntimeCaller, ready: RuntimeReady): Promise<void> {
  await c.query(`SELECT sophia.runtime_record_ready($1, $2, $3, $4)`, [...args(who), JSON.stringify(ready)])
}
