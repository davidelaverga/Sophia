// Requests to APIs proposed in issue #105 and not built yet: each shape is the proposal's, checked at runtime as the
// contract's parsers check theirs, so a different answer is an error, never a cast. Called only under the vision flag
// (app/vision.ts); the fixture pages answer them.
import { ApiError, callApi } from './client.ts'

/** A14: what showing (or stopping) answers once the room's focus is committed. */
export interface FocusReceipt {
  revision: number
  artifactVersionId: string | null
  anchor: string | null
  cursor: string
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function parseFocusReceipt(value: unknown): FocusReceipt {
  if (
    isObject(value) &&
    typeof value.revision === 'number' &&
    (typeof value.artifactVersionId === 'string' || value.artifactVersionId === null) &&
    (typeof value.anchor === 'string' || value.anchor === null) &&
    typeof value.cursor === 'string'
  ) {
    return {
      revision: value.revision,
      artifactVersionId: value.artifactVersionId,
      anchor: value.anchor,
      cursor: value.cursor,
    }
  }
  throw new ApiError(200, 'contract_violation', 'The focus receipt is not one', 'same_admission_key')
}

/** A14: show a report version to the room, or stop showing (null), against the room's revision. */
export const setRoomFocus = (
  token: string,
  roomId: string,
  key: string,
  body: { artifactVersionId: string | null; expectedRoomRevision: number },
): Promise<FocusReceipt> =>
  callApi(`/api/v1/rooms/${roomId}/focus`, { token, method: 'PUT', body, key }, parseFocusReceipt)

// A12: the meeting, closed and recapped from committed records (issue #105). Two additions this Studio proposes: the
// recap's `noted` items carry the actor who kept them (`actorId`), so a member's own note is named; and `names` gives
// the display name of every actor it names, since the API has no read of a project's members and the room only knows
// who it saw this visit.

export interface MeetingSummary {
  id: string
  startedAt: string
  endedAt: string | null
}

export interface MeetingRecap {
  meetingId: string
  startedAt: string
  endedAt: string | null
  minutes: number
  people: readonly { actorId: string }[]
  guests: number
  decided: readonly {
    decisionId: string
    statement: string
    proposedBy: string
    decidedBy: string
    at: string
    undoable: boolean
  }[]
  made: readonly {
    artifactId: string
    artifactVersionId: string
    title: string
    versionNumber: number
    askedBy: string
  }[]
  noted: readonly {
    entryId: string
    kind: string
    text: string
    authoredBy: 'member' | 'sophia'
    actorId: string
    at: string
  }[]
  open: readonly { proposalId: string; statement: string }[]
  work: readonly { taskId: string; kind: string; state: string }[]
  /** Each named actor's display name, by actor id. */
  names: Readonly<Record<string, string>>
}

/**
 * A13: what changed in a range, built as A12's recap is. `fromSequence` is the viewer's attention (null: never
 * looked); `toSequence` is what «Mark as seen» writes. A shape this Studio proposes: #105 names the route only.
 */
export interface Digest extends Pick<MeetingRecap, 'decided' | 'made' | 'noted' | 'open' | 'work' | 'names'> {
  fromSequence: string | null
  toSequence: string
}

export interface MeetingReceipt {
  meetingId: string
  revision: number
  cursor: string
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number'
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v)
const isNames = (v: unknown): boolean => isObject(v) && Object.values(v).every(isStr)
/** Every listed field present with its kind: the answer is the proposal's shape, or an error. */
const fields = (value: unknown, kinds: Record<string, (v: unknown) => boolean>): value is Record<string, unknown> =>
  isObject(value) && Object.entries(kinds).every(([k, ok]) => ok(value[k]))
const listOf =
  (kinds: Record<string, (v: unknown) => boolean>) =>
  (v: unknown): boolean =>
    Array.isArray(v) && v.every((item) => fields(item, kinds))

const RECAP = {
  meetingId: isStr,
  startedAt: isStr,
  endedAt: isStrOrNull,
  minutes: isNum,
  guests: isNum,
  people: listOf({ actorId: isStr }),
  decided: listOf({
    decisionId: isStr,
    statement: isStr,
    proposedBy: isStr,
    decidedBy: isStr,
    at: isStr,
    undoable: (v) => typeof v === 'boolean',
  }),
  made: listOf({ artifactId: isStr, artifactVersionId: isStr, title: isStr, versionNumber: isNum, askedBy: isStr }),
  noted: listOf({
    entryId: isStr,
    kind: isStr,
    text: isStr,
    authoredBy: (v) => v === 'member' || v === 'sophia',
    actorId: isStr,
    at: isStr,
  }),
  open: listOf({ proposalId: isStr, statement: isStr }),
  work: listOf({ taskId: isStr, kind: isStr, state: isStr }),
  names: isNames,
}

/** A checked answer, typed: the checks above stand for the proposal's shape. */
const checked =
  <T>(kinds: Record<string, (v: unknown) => boolean>, what: string) =>
  (value: unknown): T => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every field was checked against the proposal's shape
    if (fields(value, kinds)) return value as unknown as T
    throw new ApiError(200, 'contract_violation', `The ${what} is not one`, 'safe_read')
  }

const parseMeetings = checked<{ meetings: readonly MeetingSummary[] }>(
  { meetings: listOf({ id: isStr, startedAt: isStr, endedAt: isStrOrNull }) },
  'meeting list',
)
const parseRecap = checked<MeetingRecap>(RECAP, 'recap')
const { decided, made, noted, open, work, names } = RECAP
const parseDigest = checked<Digest>(
  { fromSequence: isStrOrNull, toSequence: isStr, decided, made, noted, open, work, names },
  'digest',
)
const nothing = (value: unknown): undefined => {
  if (value === null) return undefined
  throw new ApiError(200, 'contract_violation', 'A seen write answers nothing', 'never')
}
const parseMeetingReceipt = checked<MeetingReceipt>({ meetingId: isStr, revision: isNum, cursor: isStr }, 'receipt')

/** A12: the project's meetings, newest first. */
export const listMeetings = (token: string, projectId: string, limit: number, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/meetings?limit=${String(limit)}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseMeetings,
  )

/** A12: a meeting's recap, built from the records of its range. */
export const getRecap = (token: string, projectId: string, meetingId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/meetings/${meetingId}/recap`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseRecap,
  )

/** A12: close the meeting for everyone (editors and admins), idempotent per key. */
export const closeMeeting = (token: string, roomId: string, meetingId: string, key: string): Promise<MeetingReceipt> =>
  callApi(`/api/v1/rooms/${roomId}/meetings/${meetingId}/close`, { token, method: 'POST', key }, parseMeetingReceipt)

/** A13: what changed since this viewer last looked (their own attention, kept by the API). */
export const getSince = (token: string, projectId: string, signal?: AbortSignal): Promise<Digest> =>
  callApi(`/api/v1/projects/${projectId}/since`, { token, method: 'GET', ...(signal ? { signal } : {}) }, parseDigest)

/** A13: this viewer has seen up to `sequence`; the API never lowers it, so a second write is harmless. */
export const markSeen = (token: string, projectId: string, sequence: string): Promise<undefined> =>
  callApi(`/api/v1/projects/${projectId}/seen`, { token, method: 'PUT', body: { sequence } }, nothing)

/** A13: the running meeting until now, built as its recap is, for whoever joins late. */
export const getSoFar = (token: string, projectId: string, meetingId: string, signal?: AbortSignal): Promise<Digest> =>
  callApi(
    `/api/v1/projects/${projectId}/meetings/${meetingId}/so-far`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseDigest,
  )
