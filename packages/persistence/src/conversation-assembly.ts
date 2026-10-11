// CON-01 G2-S3 (CX-0094 N2): a reply's context, assembled and recorded for one claimed attempt, through the review-only
// candidate db/candidates/con01-s3-conversation-reply-context.sql. Dormant: not exported from the package and called by
// nothing; the role it runs as has no login member outside a disposable test cluster.
// * One call is one claim (its own committed transaction), at most one assembly transaction, and, after a terminal
//   refusal, one short fail transaction. There is no loop: a retry is another call, and the claims count it.
// * Every transaction is bounded by the caller's limits, none defaulted here (live values are unbound):
//   - a client deadline, connect to COMMIT, past which the connection is destroyed (and after every transaction, whatever
//     happened);
//   - on the server, for when the client itself has failed: SET LOCAL statement_timeout (a statement, lock waits
//     included), idle_in_transaction_session_timeout (a gap between statements) and client_connection_check_interval
//     (a running statement whose client is gone), with lock_timeout for a lock wait alone. A backend whose client
//     closed its connection ends at once when idle and within the check interval when running; one whose client went
//     silent ends within statement_timeout plus idle_in_transaction_session_timeout. PostgreSQL 16 has no
//     transaction_timeout: those two, with the statements' fixed count, are the server's bound on a transaction;
//   - a lease no shorter than three deadlines (claim, assembly, fail) nor than that server bound, so a claim outlives
//     any lock its failed attempt could still hold.
// * The assembly reads as the asker its reply row names, never as the caller: SET LOCAL ROLE to the assembler role, then
//   the actor set transaction-locally. The mission context is readMissionContext's, unchanged, under row security.
import pg from 'pg'
import { safeInt } from './bigint.ts'
import {
  ContextRenderError,
  renderConversationContext,
  type ContextMessage,
  type RenderedContext,
} from './conversation-context.ts'
import { readMissionContext } from './mission-context.ts'

export const ASSEMBLER_ROLE = 'sophia_conversation_assembler'

/** Milliseconds, each the caller's: tests pass explicit local values; nothing here chooses a live one. */
export interface AssemblyLimits {
  leaseMs: number
  /** One transaction on the client, connect to COMMIT. */
  deadlineMs: number
  connectMs: number
  statementTimeoutMs: number
  lockTimeoutMs: number
  idleInTransactionMs: number
  connectionCheckMs: number
}

const LIMIT_KEYS = [
  'leaseMs',
  'deadlineMs',
  'connectMs',
  'statementTimeoutMs',
  'lockTimeoutMs',
  'idleInTransactionMs',
  'connectionCheckMs',
] as const satisfies readonly (keyof AssemblyLimits)[]

/** PostgreSQL's largest millisecond setting. */
const MAX_MS = 2_147_483_647

/**
 * The limits, refused unless each is a whole number of milliseconds, connecting fits the deadline, the check interval
 * fits a statement, and the lease covers three deadlines and the longest a failed client's backend can keep its locks.
 */
export function checkedLimits(limits: AssemblyLimits): AssemblyLimits {
  for (const key of LIMIT_KEYS) {
    const ms = limits[key]
    if (!Number.isSafeInteger(ms) || ms < 1 || ms > MAX_MS)
      throw new RangeError(`${key} is not a whole number of milliseconds`)
  }
  if (limits.connectMs > limits.deadlineMs) throw new RangeError('connecting may outlast the deadline')
  if (limits.connectionCheckMs > limits.statementTimeoutMs)
    throw new RangeError('the check interval outlasts a statement')
  if (limits.leaseMs < 3 * limits.deadlineMs) throw new RangeError('the lease is shorter than three deadlines')
  if (limits.leaseMs < limits.statementTimeoutMs + limits.idleInTransactionMs)
    throw new RangeError('the lease is shorter than a failed client can hold its locks')
  return limits
}

export type Stage = 'claim' | 'assembly' | 'fail'
export type RetryCause =
  | 'serialization'
  | 'statement_timeout'
  | 'lock_timeout'
  | 'idle_timeout'
  | 'deadline'
  | 'claim_not_current'
  | 'unreadable'
  | 'connection'
  | 'database'

export type AssemblyResult =
  | { outcome: 'recorded'; attempt: number; contextHash: string; byteLength: number }
  | { outcome: 'already_recorded'; attempt: number; contextHash: string }
  | { outcome: 'in_progress'; attempt: number; leaseExpiresAt: string }
  | { outcome: 'not_pending'; state: string }
  | { outcome: 'exhausted'; attempts: number }
  | { outcome: 'closed'; reason: string }
  | { outcome: 'failed'; attempt: number; reason: string }
  /** Nothing terminal happened: the attempt is counted, and the next call claims again once its lease is over. */
  | { outcome: 'retry'; stage: Stage; attempt: number | null; cause: RetryCause }
  /** A COMMIT whose answer was lost: the next claim reconciles it before it counts another. */
  | { outcome: 'unknown'; stage: Stage; attempt: number | null }

interface Claimed {
  attempt: number
  token: string
}

/** What begin found under its locks, for the reads that follow it as the asker. */
export interface Binding {
  projectId: string
  conversationId: string
  askedBy: string
  messageId: string
  cutoffSeq: number
  earlierCount: number
  window: string[]
}

class DeadlinePassed extends Error {}

/** A read as the asker found less than begin did: not terminal, the next attempt's begin settles it. */
class Unreadable extends Error {}

// --- Reading the functions' jsonb answers -----------------------------------------------------------------------------

function object(value: unknown, what: string): object {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${what} is not an object`)
  return value
}

function text(o: object, key: string): string {
  const value: unknown = Reflect.get(o, key)
  if (typeof value !== 'string') throw new TypeError(`${key} is not a string`)
  return value
}

function count(o: object, key: string): number {
  const value: unknown = Reflect.get(o, key)
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${key} is not a count`)
  return value
}

function strings(o: object, key: string): string[] {
  const value: unknown = Reflect.get(o, key)
  if (!Array.isArray(value)) throw new TypeError(`${key} is not a list`)
  const out = value.filter((v): v is string => typeof v === 'string')
  if (out.length !== value.length) throw new TypeError(`${key} is not a list of ids`)
  return out
}

function binding(v: object): Binding {
  return {
    projectId: text(v, 'projectId'),
    conversationId: text(v, 'conversationId'),
    askedBy: text(v, 'askedBy'),
    messageId: text(v, 'messageId'),
    cutoffSeq: count(v, 'cutoffSeq'),
    earlierCount: count(v, 'earlierCount'),
    window: strings(v, 'window'),
  }
}

async function answer(c: pg.PoolClient, sql: string, params: unknown[]): Promise<object> {
  const { rows } = await c.query<{ v: unknown }>(sql, params)
  return object(rows[0]?.v, sql)
}

// --- One bounded transaction --------------------------------------------------------------------------------------------

interface Tx {
  committing: boolean
}

const disposed = new WeakSet<pg.PoolClient>()

/** The connection destroyed, never reused: the server ends whatever transaction it held. */
function dispose(c: pg.PoolClient): void {
  if (disposed.has(c)) return
  disposed.add(c)
  c.connection.stream.destroy()
  c.release(true)
}

async function connected<T>(
  pool: pg.Pool,
  held: { client?: pg.PoolClient; expired: boolean },
  run: (c: pg.PoolClient) => Promise<T>,
) {
  const c = await pool.connect()
  c.on('error', () => undefined)
  held.client = c
  if (held.expired) {
    dispose(c)
    throw new DeadlinePassed('the deadline passed while connecting')
  }
  return run(c)
}

/** One transaction on its own connection within the deadline; past it the connection is destroyed mid-flight. */
async function bounded<T>(pool: pg.Pool, limits: AssemblyLimits, run: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const held: { client?: pg.PoolClient; expired: boolean } = { expired: false }
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      held.expired = true
      if (held.client) dispose(held.client)
      reject(new DeadlinePassed('the deadline passed'))
    }, limits.deadlineMs)
  })
  const work = connected(pool, held, run)
  work.catch(() => undefined)
  try {
    return await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer)
    if (held.client) dispose(held.client)
  }
}

/** BEGIN, the assembler role and the server-side limits: utility statements, so no snapshot is taken before begin. */
function opening(isolation: 'READ COMMITTED' | 'REPEATABLE READ', limits: AssemblyLimits): string {
  return [
    `BEGIN ISOLATION LEVEL ${isolation}`,
    `SET LOCAL ROLE ${ASSEMBLER_ROLE}`,
    `SET LOCAL statement_timeout = ${String(limits.statementTimeoutMs)}`,
    `SET LOCAL lock_timeout = ${String(limits.lockTimeoutMs)}`,
    `SET LOCAL idle_in_transaction_session_timeout = ${String(limits.idleInTransactionMs)}`,
    `SET LOCAL client_connection_check_interval = ${String(limits.connectionCheckMs)}`,
  ].join('; ')
}

async function commit(c: pg.PoolClient, tx: Tx): Promise<void> {
  tx.committing = true
  await c.query('COMMIT')
}

function causeOf(err: unknown): RetryCause {
  if (err instanceof DeadlinePassed) return 'deadline'
  if (err instanceof Unreadable || (err instanceof ContextRenderError && err.code === 'source_withdrawn'))
    return 'unreadable'
  if (!(err instanceof pg.DatabaseError)) return 'connection'
  if (err.code === '40001' || err.code === '40P01') return 'serialization'
  if (err.code === '57014') return 'statement_timeout'
  if (err.code === '55P03') return 'lock_timeout'
  if (err.code === '25P03') return 'idle_timeout'
  return err.message === 'claim_not_current' ? 'claim_not_current' : 'database'
}

/** A refusal that ends the reply failed, or null for one that is not terminal. */
function terminalReason(err: unknown): string | null {
  if (err instanceof ContextRenderError) return err.code === 'source_withdrawn' ? null : err.code
  if (err instanceof pg.DatabaseError && err.code === '22023') {
    return ['context_forged', 'source_ineligible', 'context_compiler_changed'].includes(err.message)
      ? err.message
      : null
  }
  return null
}

// --- The three transactions ------------------------------------------------------------------------------------------------

async function claimTx(c: pg.PoolClient, replyId: string, limits: AssemblyLimits, tx: Tx) {
  await c.query(opening('READ COMMITTED', limits))
  const v = await answer(c, 'SELECT sophia.conversation_assembly_claim($1, $2) AS v', [replyId, limits.leaseMs])
  await commit(c, tx)
  return v
}

function claimed(v: object): AssemblyResult | Claimed {
  switch (text(v, 'verdict')) {
    case 'claimed':
      return { attempt: count(v, 'attempt'), token: text(v, 'token') }
    case 'already_recorded':
      return { outcome: 'already_recorded', attempt: count(v, 'attempt'), contextHash: text(v, 'contextHash') }
    case 'assembly_in_progress':
      return { outcome: 'in_progress', attempt: count(v, 'attempt'), leaseExpiresAt: text(v, 'leaseExpiresAt') }
    case 'not_pending':
      return { outcome: 'not_pending', state: text(v, 'state') }
    case 'exhausted':
      return { outcome: 'exhausted', attempts: count(v, 'attempts') }
    case 'closed':
      return { outcome: 'closed', reason: text(v, 'reason') }
    default:
      throw new TypeError('an unknown claim verdict')
  }
}

interface MessageRow {
  id: string
  conversation_id: string
  seq: string
  author: ContextMessage['author']
  author_name: string | null
  body: string | null
  created_at: Date
}

/** The window and the asking message, read as the asker under row security: every one begin named, or none. */
async function readWindow(c: pg.PoolClient, b: Binding): Promise<ContextMessage[]> {
  const ids = [...b.window, b.messageId]
  const { rows } = await c.query<MessageRow>(
    `SELECT id, conversation_id, seq::text AS seq, author, author_name, body, created_at
       FROM sophia.conversation_messages WHERE project_id = $1 AND conversation_id = $2 AND id = ANY($3::uuid[])`,
    [b.projectId, b.conversationId, ids],
  )
  if (rows.length !== ids.length) throw new Unreadable('a message begin named is not readable as the asker')
  return rows.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    seq: safeInt(m.seq, 'message.seq'),
    author: m.author,
    name: m.author_name,
    body: m.body,
    at: m.created_at.toISOString(),
  }))
}

/** The context, read and rendered as the asker in begin's snapshot: the actor set transaction-locally, never the caller. */
export async function renderBound(c: pg.PoolClient, b: Binding): Promise<RenderedContext> {
  await c.query("SELECT set_config('sophia.actor_id', $1, true)", [b.askedBy])
  const context = await readMissionContext(c, b.projectId, { actorId: b.askedBy, channel: 'studio' })
  if (!context) throw new Unreadable('the asker cannot read the project')
  const messages = await readWindow(c, b)
  return renderConversationContext({
    context,
    conversationId: b.conversationId,
    cutoffSeq: b.cutoffSeq,
    messages,
    earlierCount: b.earlierCount,
  })
}

/** What the record takes: the rendered context, never a source or a hash (those it derives). */
export function recordPayload(r: RenderedContext): string {
  return JSON.stringify({
    compiler: r.compiler,
    renderer: r.renderer,
    text: r.text,
    fragments: r.fragments,
    coverage: r.coverage,
    revisions: r.revisions,
  })
}

async function assemblyTx(
  c: pg.PoolClient,
  replyId: string,
  k: Claimed,
  limits: AssemblyLimits,
  tx: Tx,
): Promise<AssemblyResult> {
  const args = [replyId, k.attempt, k.token]
  await c.query(opening('REPEATABLE READ', limits))
  const begun = await answer(c, 'SELECT sophia.conversation_assembly_begin($1, $2, $3) AS v', args)
  const verdict = text(begun, 'verdict')
  if (verdict === 'not_pending') return { outcome: 'not_pending', state: text(begun, 'state') }
  if (verdict === 'privacy') {
    const reason = text(begun, 'reason')
    await answer(c, 'SELECT sophia.conversation_assembly_close($1, $2, $3, $4) AS v', [...args, reason])
    await commit(c, tx)
    return { outcome: 'closed', reason }
  }
  if (verdict !== 'begun') throw new TypeError('an unknown begin verdict')
  const rendered = await renderBound(c, binding(begun))
  const recorded = await answer(c, 'SELECT sophia.conversation_record_context($1, $2, $3, $4::jsonb) AS v', [
    ...args,
    recordPayload(rendered),
  ])
  await commit(c, tx)
  return {
    outcome: 'recorded',
    attempt: k.attempt,
    contextHash: text(recorded, 'contextHash'),
    byteLength: count(recorded, 'byteLength'),
  }
}

async function failTx(
  c: pg.PoolClient,
  failing: { replyId: string; k: Claimed; reason: string },
  limits: AssemblyLimits,
  tx: Tx,
) {
  await c.query(opening('READ COMMITTED', limits))
  const { replyId, k, reason } = failing
  const v = await answer(c, 'SELECT sophia.conversation_assembly_fail($1, $2, $3, $4) AS v', [
    replyId,
    k.attempt,
    k.token,
    reason,
  ])
  await commit(c, tx)
  return v
}

async function failReply(
  pool: pg.Pool,
  replyId: string,
  k: Claimed,
  reason: string,
  limits: AssemblyLimits,
): Promise<AssemblyResult> {
  const tx: Tx = { committing: false }
  try {
    const v = await bounded(pool, limits, (c) => failTx(c, { replyId, k, reason }, limits, tx))
    const verdict = text(v, 'verdict')
    if (verdict === 'failed') return { outcome: 'failed', attempt: k.attempt, reason }
    if (verdict === 'not_pending') return { outcome: 'not_pending', state: text(v, 'state') }
    return { outcome: 'retry', stage: 'fail', attempt: k.attempt, cause: 'claim_not_current' }
  } catch (err) {
    if (tx.committing) return { outcome: 'unknown', stage: 'fail', attempt: k.attempt }
    return { outcome: 'retry', stage: 'fail', attempt: k.attempt, cause: causeOf(err) }
  }
}

async function assemble(pool: pg.Pool, replyId: string, k: Claimed, limits: AssemblyLimits): Promise<AssemblyResult> {
  const tx: Tx = { committing: false }
  try {
    return await bounded(pool, limits, (c) => assemblyTx(c, replyId, k, limits, tx))
  } catch (err) {
    if (tx.committing) return { outcome: 'unknown', stage: 'assembly', attempt: k.attempt }
    const reason = terminalReason(err)
    if (reason === null) return { outcome: 'retry', stage: 'assembly', attempt: k.attempt, cause: causeOf(err) }
    return failReply(pool, replyId, k, reason, limits)
  }
}

async function claim(pool: pg.Pool, replyId: string, limits: AssemblyLimits): Promise<AssemblyResult | Claimed> {
  const tx: Tx = { committing: false }
  try {
    return claimed(await bounded(pool, limits, (c) => claimTx(c, replyId, limits, tx)))
  } catch (err) {
    if (tx.committing) return { outcome: 'unknown', stage: 'claim', attempt: null }
    return { outcome: 'retry', stage: 'claim', attempt: null, cause: causeOf(err) }
  }
}

/**
 * Claim an attempt at a pending reply and, when claimed, assemble and record its context, through `url`: a login that
 * is a member of the assembler role. Each of the up to three transactions is bounded by `limits`.
 */
export async function assembleReply(url: string, replyId: string, limits: AssemblyLimits): Promise<AssemblyResult> {
  checkedLimits(limits)
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: limits.connectMs,
    application_name: 'sophia-conversation-assembler',
    keepAlive: true,
  })
  pool.on('error', () => undefined)
  try {
    const k = await claim(pool, replyId, limits)
    return 'outcome' in k ? k : await assemble(pool, replyId, k, limits)
  } finally {
    await pool.end()
  }
}
