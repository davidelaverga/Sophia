// Personal held inputs (INC03-CC-002 P1, migration 0098): a person's message in their Personal space, retained under
// the explicit automatic_v1 contract and held (`recorded`), with no effect.
// What it guarantees:
// - The contract is an explicit, required argument checked here and again in SQL; the epoch the caller read is
//   required too, and the SQL writer fences to it in the same transaction (personal_fence) before the key is read.
// - The owner is the transaction's verified actor (withActor); nothing names an owner, audience, addressee or context.
// - One write: the person turn (body kept once, reply `recorded`), its metadata-only input row and the request under
//   the owner's personal key namespace. No reply is asked for: no claim, companion call, outbox, notification or work.
// What it does not do: answer, assess, admit or route. P2 (amendment A52, 0099): POST /api/v1/personal/inputs calls
// recordPersonalInput when the API is built with Personal inputs (off by default); every Personal read lists the turn
// with reply `recorded`, and neither the companion's history nor a welcome back reads or counts it
// (docs/plans/personal-inputs.md, "P2"). Call inside withActor(..., 'write').
import type pg from 'pg'
import type { PersonalInputRecorded, PersonalTurn } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readPersonalInputTurn } from './personal.ts'
import { onlyRow } from './rows.ts'

/** The only interaction contract this writer accepts. */
export const PERSONAL_AUTOMATIC_V1 = 'automatic_v1'
export type PersonalAutomaticContract = typeof PERSONAL_AUTOMATIC_V1

export interface PersonalInputSend {
  contract: PersonalAutomaticContract
  /** The space's epoch the caller last read: a write made against another one is refused (40001). */
  epoch: number
  text: string
}

/** What a held Personal input answers: ids, the contract, and that nothing was set in motion. */
export interface PersonalInputReceipt {
  operation: 'send_input'
  revision: number
  turnId: string
  seq: number
  inputId: string
  interactionContract: PersonalAutomaticContract
  contractVersion: 1
  input: 'recorded'
  effect: 'none'
  suggestionId: null
  noteId: null
  releaseId: null
  projectId: null
  erased: null
}

const RECEIPT_KEYS = [
  'contractVersion',
  'effect',
  'erased',
  'input',
  'inputId',
  'interactionContract',
  'noteId',
  'operation',
  'projectId',
  'releaseId',
  'revision',
  'seq',
  'suggestionId',
  'turnId',
].toSorted()

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0

/** Each receipt field and what it must be. */
const RECEIPT_FIELDS: Record<string, (v: unknown) => boolean> = {
  operation: (v) => v === 'send_input',
  revision: isCount,
  turnId: isId,
  seq: isCount,
  inputId: isId,
  interactionContract: (v) => v === PERSONAL_AUTOMATIC_V1,
  contractVersion: (v) => v === 1,
  input: (v) => v === 'recorded',
  effect: (v) => v === 'none',
  suggestionId: (v) => v === null,
  noteId: (v) => v === null,
  releaseId: (v) => v === null,
  projectId: (v) => v === null,
  erased: (v) => v === null,
}

/** The receipt exactly as 0098 writes it: anything else is a programming error, never passed on. */
export function isPersonalInputReceipt(value: unknown): value is PersonalInputReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value).toSorted()
  if (keys.length !== RECEIPT_KEYS.length || keys.some((k, i) => k !== RECEIPT_KEYS[i])) return false
  const r: Record<string, unknown> = { ...value }
  return Object.entries(RECEIPT_FIELDS).every(([k, ok]) => ok(r[k]))
}

/** The contract and epoch as given, refused unless exact (a caller typed elsewhere can still pass junk). */
function checked(write: PersonalInputSend): { contract: PersonalAutomaticContract; epoch: number } {
  const { contract, epoch }: { contract: unknown; epoch: unknown } = write
  if (contract !== PERSONAL_AUTOMATIC_V1) throw new DomainError('invalid_request', 'Invalid request')
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 0)
    throw new DomainError('invalid_request', 'Invalid request')
  return { contract: PERSONAL_AUTOMATIC_V1, epoch }
}

/** A Personal message retained as an automatic_v1 input, held, under the caller's own key. */
export async function sendPersonalInput(
  c: pg.PoolClient,
  key: string,
  write: PersonalInputSend,
): Promise<PersonalInputReceipt> {
  const { contract, epoch } = checked(write)
  const { rows } = await c.query<{ receipt: unknown }>('SELECT sophia.send_personal_input($1, $2, $3, $4) AS receipt', [
    key,
    contract,
    epoch,
    write.text,
  ])
  const value = onlyRow(rows, 'send_personal_input').receipt
  if (!isPersonalInputReceipt(value)) throw new Error('send_personal_input returned an unexpected receipt')
  return value
}

/**
 * A held input and the exact turn it keeps, read in the write's own transaction under the same verified owner: what the
 * route answers. The turn is the one the writer's receipt names (id and seq), the person's, held; the input is the
 * caller's own row for it. Anything else is a programming error, never passed on.
 */
export async function recordPersonalInput(
  c: pg.PoolClient,
  key: string,
  write: PersonalInputSend,
): Promise<PersonalInputRecorded> {
  const r = await sendPersonalInput(c, key, write)
  const turn: PersonalTurn | null = await readPersonalInputTurn(c, r.inputId)
  if (!turn || turn.id !== r.turnId || turn.seq !== r.seq || turn.author !== 'person' || turn.reply !== 'recorded')
    throw new Error('send_personal_input kept no matching held turn')
  return {
    revision: r.revision,
    turn,
    input: {
      id: r.inputId,
      interactionContract: r.interactionContract,
      contractVersion: r.contractVersion,
      state: r.input,
      effect: r.effect,
    },
  }
}

/** The most held inputs one metadata read returns (and its default). */
export const PERSONAL_INPUT_PAGE_LIMIT = 100

/**
 * One of the caller's own held inputs, as metadata (no words, no digest): what the record says, and the position of the
 * turn it keeps in the conversation (seq, unique per owner: the page's cursor).
 */
export interface PersonalInputRecord {
  id: string
  turnId: string
  seq: number
  interactionContract: PersonalAutomaticContract
  contractVersion: 1
  origin: 'text'
  audience: 'personal_owner'
  addressingBasis: 'personal_default'
  state: 'recorded'
  createdAt: string
}

/** A page of held inputs, newest first, and the seq to read before for the next one (null on the last). */
export interface PersonalInputPage {
  inputs: PersonalInputRecord[]
  next: number | null
}

const RECORD_KEYS = [
  'addressingBasis',
  'audience',
  'contractVersion',
  'createdAt',
  'id',
  'interactionContract',
  'origin',
  'seq',
  'state',
  'turnId',
].toSorted()

const isInstant = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v))

const RECORD_FIELDS: Record<string, (v: unknown) => boolean> = {
  id: isId,
  turnId: isId,
  seq: isCount,
  interactionContract: (v) => v === PERSONAL_AUTOMATIC_V1,
  contractVersion: (v) => v === 1,
  origin: (v) => v === 'text',
  audience: (v) => v === 'personal_owner',
  addressingBasis: (v) => v === 'personal_default',
  state: (v) => v === 'recorded',
  createdAt: isInstant,
}

/** A held input's metadata exactly as readPersonalInputs projects it: closed, typed, no words. */
export function isPersonalInputRecord(value: unknown): value is PersonalInputRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value).toSorted()
  if (keys.length !== RECORD_KEYS.length || keys.some((k, i) => k !== RECORD_KEYS[i])) return false
  const r: Record<string, unknown> = { ...value }
  return Object.entries(RECORD_FIELDS).every(([k, ok]) => ok(r[k]))
}

/** Where a page starts and how long it is, refused unless exact (as `checked`). */
function pageOf(page: { before?: number | null; limit?: number }): { before: number | null; limit: number } {
  const { before = null, limit = PERSONAL_INPUT_PAGE_LIMIT }: { before?: unknown; limit?: unknown } = page
  if (before !== null && !isCount(before)) throw new DomainError('invalid_request', 'Invalid request')
  if (!isCount(limit) || limit > PERSONAL_INPUT_PAGE_LIMIT) throw new DomainError('invalid_request', 'Invalid request')
  return { before, limit }
}

/**
 * The caller's own held inputs, a bounded page at a time, newest first: those whose turn comes before `before` (a seq;
 * all when null), at most `limit` (1..100). The cursor is the turn's seq, unique per owner, so inputs written at the same
 * instant are each read once. Owner-only by its filter and by RLS. Call inside withActor.
 */
export async function readPersonalInputs(
  c: pg.PoolClient,
  page: { before?: number | null; limit?: number } = {},
): Promise<PersonalInputPage> {
  const { before, limit } = pageOf(page)
  const { rows } = await c.query<{
    id: string
    turn_id: string
    seq: string
    interaction_contract: string
    contract_version: number
    origin: string
    audience: string
    addressing_basis: string
    state: string
    created_at: Date
  }>(
    `SELECT i.id, i.turn_id, t.seq, i.interaction_contract, i.contract_version, i.origin, i.audience,
            i.addressing_basis, i.state, i.created_at
       FROM sophia.personal_inputs i
       JOIN sophia.personal_turns t ON t.owner_id = i.owner_id AND t.id = i.turn_id
      WHERE i.owner_id = sophia.actor_id() AND ($1::bigint IS NULL OR t.seq < $1::bigint)
      ORDER BY t.seq DESC LIMIT $2`,
    [before, limit + 1],
  )
  const inputs = rows.slice(0, limit).map((r) => {
    const record: unknown = {
      id: r.id,
      turnId: r.turn_id,
      seq: Number(r.seq),
      interactionContract: r.interaction_contract,
      contractVersion: r.contract_version,
      origin: r.origin,
      audience: r.audience,
      addressingBasis: r.addressing_basis,
      state: r.state,
      createdAt: r.created_at.toISOString(),
    }
    if (!isPersonalInputRecord(record)) throw new Error('personal_inputs returned an unexpected record')
    return record
  })
  return { inputs, next: rows.length > limit ? (inputs.at(-1)?.seq ?? null) : null }
}
