// Typed calls to the Sophia API (packages/contracts). The browser talks only to this API.
// No hidden retries: an ambiguous admission surfaces as outcome_unknown and the caller decides to
// retry with the SAME Idempotency-Key.
import type { Error as ApiErrorBody, GoalCommand, ProjectCreated, Receipt, Snapshot } from '@sophia/contracts'

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

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null
  return new ApiError(
    res.status,
    body?.code ?? `http_${res.status}`,
    body?.message ?? res.statusText,
    body?.retry ?? 'never',
  )
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

export async function getSnapshot(token: string, projectId: string, signal?: AbortSignal): Promise<Snapshot> {
  const res = await fetch(`/api/v1/projects/${projectId}/snapshot`, {
    headers: auth(token),
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as Snapshot
}

export async function admitGoalCommand(
  token: string,
  projectId: string,
  idempotencyKey: string,
  cmd: GoalCommand,
): Promise<Receipt> {
  let res: Response
  try {
    res = await fetch(`/api/v1/projects/${projectId}/commands`, {
      method: 'POST',
      headers: { ...auth(token), 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(cmd),
    })
  } catch {
    // The request may have reached the server and committed.
    throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')
  }
  if (!res.ok) throw await toError(res)
  return (await res.json()) as Receipt
}

/** createProject: idempotent per person and key; reuse the key when retrying an unknown outcome. */
export async function createProject(token: string, idempotencyKey: string, title: string): Promise<ProjectCreated> {
  let res: Response
  try {
    res = await fetch(`/api/v1/projects`, {
      method: 'POST',
      headers: { ...auth(token), 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ title }),
    })
  } catch {
    throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')
  }
  if (!res.ok) throw await toError(res)
  return (await res.json()) as ProjectCreated
}
