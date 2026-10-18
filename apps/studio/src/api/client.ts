// Typed calls to the Sophia API (packages/contracts). The browser talks only to this API.
// No hidden retries: an ambiguous admission surfaces as outcome_unknown and the caller decides to
// retry with the SAME Idempotency-Key.
import type {
  Error as ApiErrorBody,
  ExchangeReceipt,
  FloorRequest,
  GoalCommand,
  ProjectCreated,
  ProjectArchived,
  ProjectRenamed,
  ProjectLeft,
  DiscussionPage,
  GoalTargetList,
  GoalTargetRequest,
  GoalTargetSet,
  ProjectMembers,
  MemberRoleSet,
  ActivityPage,
  MemberRemoved,
  Receipt,
  RoomToken,
  RoomTokenRequest,
  Snapshot,
} from '@sophia/contracts'
import {
  asErrorBody,
  parseExchangeReceipt,
  parseProjectCreated,
  parseProjectRenamed,
  parseProjectArchived,
  parseProjectLeft,
  parseDiscussionPage,
  parseGoalTargetList,
  parseGoalTargetSet,
  parseProjectMembers,
  parseMemberRoleSet,
  parseActivityPage,
  parseMemberRemoved,
  parseReceipt,
  parseRoomToken,
  parseSnapshot,
} from '@sophia/contracts/validate'
import { apiUrl } from './base.ts'
import { READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from './timeouts.ts'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retry: ApiErrorBody['retry']

  constructor(status: number, code: string, message: string, retry: ApiErrorBody['retry'], options?: ErrorOptions) {
    super(message, options)
    this.status = status
    this.code = code
    this.retry = retry
  }
}

/**
 * A refusal with no words of its own, the same over any protocol (HTTP/2 carries no status text, and an empty refusal
 * shows as nothing): what happened, and «Try again» only where trying again can help. The status is the code's
 * (`http_502`), never the person's to read (docs/plans/copy-no-raw-codes.md).
 */
const unreadRefusal = (status: number) =>
  `That didn’t go through.${status >= 500 || status === 429 ? ' Try again.' : ''}`

/** The reply's error body when it matches the contract; otherwise the HTTP status speaks, in words. */
export async function toError(res: Response, retry: ApiErrorBody['retry'] = 'never'): Promise<ApiError> {
  const body = asErrorBody(await res.json().catch(() => null))
  return body
    ? new ApiError(res.status, body.code, body.message, body.retry)
    : new ApiError(res.status, `http_${res.status}`, unreadRefusal(res.status), retry)
}

/**
 * A success body, validated. A reply that breaks the contract is an error, never a cast: `retry`
 * says what is safe (a read can be repeated; an admission is repeated with the same key).
 */
async function readBody<T>(res: Response, parse: (value: unknown) => T, retry: ApiErrorBody['retry']): Promise<T> {
  try {
    // No content: the parser says whether nothing is an answer (a 204 write).
    if (res.status === 204) return parse(null)
    return parse(await res.json())
  } catch (err: unknown) {
    // The person reads that the reply couldn't be read; the contract's own words stay with the error, for us.
    throw new ApiError(res.status, 'contract_violation', 'Sophia’s reply couldn’t be read.', retry, { cause: err })
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

export { READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from './timeouts.ts'

/**
 * No wait is endless. `run` gets a signal that aborts when `ms` pass before it settles (the reply's headers and
 * its body), or when the caller's own signal does. Without it, a server that takes the connection and never answers
 * leaves "Creating…" or "Joining…" on screen for good.
 */
async function inTime<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, outer?: AbortSignal): Promise<T> {
  const limit = new AbortController()
  const abort = () => limit.abort()
  if (outer?.aborted) abort()
  outer?.addEventListener('abort', abort)
  const timer = setTimeout(abort, ms)
  try {
    return await run(limit.signal)
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', abort)
  }
}

export function getSnapshot(token: string, projectId: string, signal?: AbortSignal): Promise<Snapshot> {
  const read = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/snapshot`), { headers: auth(token), signal: limit })
    if (!res.ok) throw await toError(res)
    return readBody(res, parseSnapshot, 'safe_read')
  }
  return inTime(READ_TIMEOUT_MS, read, signal)
}

/** readDiscussion (A23): a page of the room's discussion, oldest first: the newest, or the 50 before `before`. */
export function getDiscussionPage(token: string, projectId: string, before: string | null): Promise<DiscussionPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  const read = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/discussion${query}`), {
      headers: auth(token),
      signal: limit,
    })
    if (!res.ok) throw await toError(res)
    return readBody(res, parseDiscussionPage, 'safe_read')
  }
  return inTime(READ_TIMEOUT_MS, read)
}

/** A JSON read under the person's token, validated as `parse` (A25's goal targets and members). */
function readJson<T>(token: string, path: `/api/${string}`, parse: (value: unknown) => T): Promise<T> {
  const read = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(path), { headers: auth(token), signal: limit })
    if (!res.ok) throw await toError(res)
    return readBody(res, parse, 'safe_read')
  }
  return inTime(READ_TIMEOUT_MS, read)
}

/** listGoalTargets (A25): the project's goals' owners and target dates. */
export const getGoalTargets = (token: string, projectId: string): Promise<GoalTargetList> =>
  readJson(token, `/api/v1/projects/${projectId}/goal-targets`, parseGoalTargetList)

/** listProjectMembers (A25): the project's active members, with the names the room keeps. */
export const getProjectMembers = (token: string, projectId: string): Promise<ProjectMembers> =>
  readJson(token, `/api/v1/projects/${projectId}/members`, parseProjectMembers)

/** setGoalTarget (A25): editors and admins, compare-and-set on the target's revision (0 for none yet). */
export async function setGoalTarget(
  token: string,
  projectId: string,
  goalId: string,
  body: GoalTargetRequest,
): Promise<GoalTargetSet> {
  const send = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/goals/${goalId}/target`), {
      method: 'PUT',
      headers: { ...auth(token), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: limit,
    })
    if (!res.ok) throw await toError(res)
    return readBody(res, parseGoalTargetSet, 'never')
  }
  return inTime(READ_TIMEOUT_MS, send)
}

/** readProjectActivity (A28): who did what in the project, for its admins; newest first, before a sequence. */
export function getProjectActivity(token: string, projectId: string, before: string | null): Promise<ActivityPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  const read = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/activity${query}`), {
      headers: auth(token),
      signal: limit,
    })
    if (!res.ok) throw await toError(res)
    return readBody(res, parseActivityPage, 'safe_read')
  }
  return inTime(READ_TIMEOUT_MS, read)
}

/** removeMember (A29): admins only, never oneself; idempotent per key, so a retry after an unknown outcome is the same. */
export const removeMember = (token: string, projectId: string, actorId: string, key: string): Promise<MemberRemoved> =>
  postIdempotent(token, `/api/v1/projects/${projectId}/members/${actorId}/removal`, key, {}, parseMemberRemoved)

/** changeMemberRole (A27): admins only; a project keeps an admin; a role already held changes nothing. */
export async function changeMemberRole(
  token: string,
  projectId: string,
  actorId: string,
  role: 'admin' | 'editor' | 'viewer',
): Promise<MemberRoleSet> {
  const send = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/members/${actorId}/role`), {
      method: 'PUT',
      headers: { ...auth(token), 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
      signal: limit,
    })
    if (!res.ok) throw await toError(res)
    return readBody(res, parseMemberRoleSet, 'never')
  }
  return inTime(READ_TIMEOUT_MS, send)
}

/** An admin's act on a member in the call (A24): mute their microphone, or take them out. No key: twice is once. */
export async function actInCall(
  token: string,
  projectId: string,
  identity: string,
  what: 'mute' | 'remove' | 'stop-camera' | 'stop-screen',
): Promise<void> {
  const send = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/room/people/${identity}/${what}`), {
      method: 'POST',
      headers: auth(token),
      signal: limit,
    })
    if (!res.ok) throw await toError(res)
  }
  return inTime(WRITE_TIMEOUT_MS, send)
}

/** An admin mutes everyone else in the call (A31): members and guests. No key: twice is once. */
export async function muteEveryoneInCall(token: string, projectId: string): Promise<void> {
  const send = async (limit: AbortSignal) => {
    const res = await fetch(apiUrl(`/api/v1/projects/${projectId}/room/mute-all`), {
      method: 'POST',
      headers: auth(token),
      signal: limit,
    })
    if (!res.ok) throw await toError(res)
  }
  return inTime(WRITE_TIMEOUT_MS, send)
}

/**
 * One idempotent write: POST with the caller's Idempotency-Key, the reply validated as `parse`. No reply
 * at all, or none in time, is outcome_unknown (the write may have committed), so the caller retries with the same
 * key.
 */
function postIdempotent<T>(
  token: string,
  path: `/api/${string}`,
  idempotencyKey: string,
  body: unknown,
  parse: (value: unknown) => T,
): Promise<T> {
  return inTime(WRITE_TIMEOUT_MS, async (signal) => {
    let res: Response
    try {
      res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { ...auth(token), 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify(body),
        signal,
      })
    } catch {
      throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')
    }
    if (!res.ok) throw await toError(res)
    return readBody(res, parse, 'same_admission_key')
  })
}

interface CallInit {
  /** Null for a public call (an invitation preview). */
  token: string | null
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH'
  body?: unknown
  /** An Idempotency-Key: the call is an admission, retried with the same key after no reply. */
  key?: string
  /** Headers the route asks for besides the key (the epoch a personal write is made against). */
  headers?: Readonly<Record<string, string>>
  /** The caller's own signal: once it aborts, the call stops (as one past its time does). */
  signal?: AbortSignal
  /**
   * A protected read (a project's conversations, a conversation's messages): its 403 is the refusal, known from the
   * status alone, so it is raised at once as `forbidden`, never after (or according to) an error body that may be slow,
   * endless or malformed (R-REFUSAL-CLIENT-01). The view fences on that refusal.
   */
  protectedRead?: true
}

/**
 * One call with an optional bearer, body and key; the reply validated as `parse`, never cast. A GET waits as a
 * read does; anything else, as a write.
 */
export function callApi<T>(path: `/api/${string}`, init: CallInit, parse: (value: unknown) => T): Promise<T> {
  const method = init.method ?? 'POST'
  // What a failure allows: an admission is retried with its key, a read is asked again, and a write without a key
  // (a lobby decision, cancelling a session) that got no answer may have happened, so it is never repeated as if not.
  const retry = init.key ? 'same_admission_key' : method === 'GET' ? 'safe_read' : 'never'
  const call = async (signal: AbortSignal) => {
    let res: Response
    try {
      res = await fetch(apiUrl(path), {
        method,
        headers: {
          ...(init.token ? auth(init.token) : {}),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.key ? { 'idempotency-key': init.key } : {}),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal,
      })
    } catch {
      throw new ApiError(0, 'outcome_unknown', 'No reply from Sophia', retry)
    }
    if (!res.ok && res.status === 403 && init.protectedRead) {
      void res.body?.cancel().catch(() => undefined)
      throw new ApiError(403, 'forbidden', unreadRefusal(403), retry)
    }
    if (!res.ok) throw await toError(res)
    return readBody(res, parse, retry)
  }
  return inTime(method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS, call, init.signal)
}

export const admitGoalCommand = (token: string, projectId: string, key: string, cmd: GoalCommand): Promise<Receipt> =>
  postIdempotent(token, `/api/v1/projects/${projectId}/commands`, key, cmd, parseReceipt)

/** createProject: idempotent per person and key; reuse the key when retrying an unknown outcome. */
export const createProject = (token: string, key: string, title: string): Promise<ProjectCreated> =>
  postIdempotent(token, '/api/v1/projects', key, { title }, parseProjectCreated)

/** renameProject (A21): an admin only, idempotent per person and key; reuse the key when retrying an unknown outcome. */
export const renameProject = (token: string, projectId: string, key: string, title: string): Promise<ProjectRenamed> =>
  postIdempotent(token, `/api/v1/projects/${projectId}/title`, key, { title }, parseProjectRenamed)

/** archiveProject (A30): an admin archives a project or brings it back, idempotent per person and key. */
export const archiveProject = (
  token: string,
  projectId: string,
  key: string,
  archived: boolean,
): Promise<ProjectArchived> =>
  postIdempotent(token, `/api/v1/projects/${projectId}/archive`, key, { archived }, parseProjectArchived)

/** leaveProject (A22): any member but the only admin, idempotent per person and key. */
export const leaveProject = (token: string, projectId: string, key: string): Promise<ProjectLeft> =>
  postIdempotent(token, `/api/v1/projects/${projectId}/leave`, key, {}, parseProjectLeft)

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
