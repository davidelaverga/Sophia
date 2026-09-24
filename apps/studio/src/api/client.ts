// Typed calls to the Sophia API (packages/contracts). The browser talks only to this API.
// No hidden retries: an ambiguous admission surfaces as outcome_unknown and the caller decides to
// retry with the SAME Idempotency-Key.
import type { Error as ApiErrorBody, GoalCommand, ProjectCreated, Receipt, Snapshot } from '@sophia/contracts'
import {
  asErrorBody,
  ContractViolation,
  parseProjectCreated,
  parseReceipt,
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

export async function admitGoalCommand(
  token: string,
  projectId: string,
  idempotencyKey: string,
  cmd: GoalCommand,
): Promise<Receipt> {
  let res: Response
  try {
    res = await fetch(apiUrl(`/api/v1/projects/${projectId}/commands`), {
      method: 'POST',
      headers: { ...auth(token), 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(cmd),
    })
  } catch {
    // The request may have reached the server and committed.
    throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')
  }
  if (!res.ok) throw await toError(res)
  return readBody(res, parseReceipt, 'same_admission_key')
}

/** createProject: idempotent per person and key; reuse the key when retrying an unknown outcome. */
export async function createProject(token: string, idempotencyKey: string, title: string): Promise<ProjectCreated> {
  let res: Response
  try {
    res = await fetch(apiUrl('/api/v1/projects'), {
      method: 'POST',
      headers: { ...auth(token), 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ title }),
    })
  } catch {
    throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')
  }
  if (!res.ok) throw await toError(res)
  return readBody(res, parseProjectCreated, 'same_admission_key')
}
