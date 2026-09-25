// Typed calls to the Sophia API (packages/contracts). The browser talks only to this API.
// No hidden retries: an ambiguous admission surfaces as outcome_unknown and the caller decides to
// retry with the SAME Idempotency-Key.
import type {
  Error as ApiErrorBody,
  ExchangeReceipt,
  FloorRequest,
  GoalCommand,
  ProjectCreated,
  Receipt,
  RoomToken,
  RoomTokenRequest,
  Snapshot,
} from '@sophia/contracts'
import {
  asErrorBody,
  ContractViolation,
  parseExchangeReceipt,
  parseProjectCreated,
  parseReceipt,
  parseRoomToken,
  parseSnapshot,
} from '@sophia/contracts/validate'
import { apiUrl } from './base.ts'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retry: ApiErrorBody['retry']

  constructor(status: number, code: string, message: string, retry: ApiErrorBody['retry']) {
    super(message)
    this.status = status
    this.code = code
    this.retry = retry
  }
}

/** The reply's error body when it matches the contract; otherwise the HTTP status speaks. */
export async function toError(res: Response, retry: ApiErrorBody['retry'] = 'never'): Promise<ApiError> {
  const body = asErrorBody(await res.json().catch(() => null))
  return body
    ? new ApiError(res.status, body.code, body.message, body.retry)
    : new ApiError(res.status, `http_${res.status}`, res.statusText, retry)
}

/**
 * A success body, validated. A reply that breaks the contract is an error, never a cast: `retry`
 * says what is safe (a read can be repeated; an admission is repeated with the same key).
 */
async function readBody<T>(res: Response, parse: (value: unknown) => T, retry: ApiErrorBody['retry']): Promise<T> {
  try {
    return parse(await res.json())
  } catch (err: unknown) {
    const message = err instanceof ContractViolation ? err.message : 'Unreadable reply from Sophia'
    throw new ApiError(res.status, 'contract_violation', message, retry)
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

export async function getSnapshot(token: string, projectId: string, signal?: AbortSignal): Promise<Snapshot> {
  const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/snapshot`), {
    headers: auth(token),
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) throw await toError(res)
  return readBody(res, parseSnapshot, 'safe_read')
}

/**
 * One idempotent write: POST with the caller's Idempotency-Key, the reply validated as `parse`. No reply
 * at all is outcome_unknown (the write may have committed), so the caller retries with the same key.
 */
async function postIdempotent<T>(
  token: string,
  path: `/api/${string}`,
  idempotencyKey: string,
  body: unknown,
  parse: (value: unknown) => T,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { ...auth(token), 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')
  }
  if (!res.ok) throw await toError(res)
  return readBody(res, parse, 'same_admission_key')
}

export const admitGoalCommand = (token: string, projectId: string, key: string, cmd: GoalCommand): Promise<Receipt> =>
  postIdempotent(token, `/api/v1/projects/${projectId}/commands`, key, cmd, parseReceipt)

/** createProject: idempotent per person and key; reuse the key when retrying an unknown outcome. */
export const createProject = (token: string, key: string, title: string): Promise<ProjectCreated> =>
  postIdempotent(token, '/api/v1/projects', key, { title }, parseProjectCreated)

/** A short-lived token for this project's LiveKit room; issuing it changes nothing, so a retry is harmless. */
export const issueRoomToken = (
  token: string,
  projectId: string,
  key: string,
  req: RoomTokenRequest,
): Promise<RoomToken> => postIdempotent(token, `/api/v1/projects/${projectId}/room-token`, key, req, parseRoomToken)

/** Pass who may address Sophia. Compare-and-set on the room revision; it never touches goals or work. */
export const transferInputFloor = (
  token: string,
  roomId: string,
  key: string,
  req: FloorRequest,
): Promise<ExchangeReceipt> =>
  postIdempotent(token, `/api/v1/rooms/${roomId}/input-floor`, key, req, parseExchangeReceipt)
