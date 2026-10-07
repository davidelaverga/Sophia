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

/** A13: one hit of a project search; its snippet is from the record itself, and `cite` names the record. */
export interface SearchHit {
  kind: 'decision' | 'note' | 'report' | 'report_section' | 'recap'
  /** The record; a report's (and a report section's) is the artifact, its version in `cite.recordId`. */
  id: string
  title: string
  snippet: string
  meetingId: string | null
  at: string
  cite: { recordId: string; sha256?: string; anchor?: string }
}

export interface SearchPage {
  hits: readonly SearchHit[]
  /** The next page's cursor, or null when this is the last. */
  next: string | null
}

const HIT_KINDS = new Set(['decision', 'note', 'report', 'report_section', 'recap'])
const isCite = (v: unknown) =>
  fields(v, { recordId: isStr }) && ['sha256', 'anchor'].every((k) => !(k in v) || isStr(v[k]))
const parseSearchPage = checked<SearchPage>(
  {
    hits: listOf({
      kind: (v) => isStr(v) && HIT_KINDS.has(v),
      id: isStr,
      title: isStr,
      snippet: isStr,
      meetingId: isStrOrNull,
      at: isStr,
      cite: isCite,
    }),
    next: isStrOrNull,
  },
  'search page',
)

/** A13: the project's decisions, notes, reports and recaps that match `q`, a page from `cursor`. */
export const searchProject = (
  token: string,
  projectId: string,
  q: string,
  cursor: string | null,
  signal?: AbortSignal,
) =>
  callApi(
    `/api/v1/projects/${projectId}/search?${new URLSearchParams({ q, ...(cursor ? { cursor } : {}) }).toString()}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseSearchPage,
  )

/**
 * A14: the room's focus as it stands, with the section it is at and who put it there. The snapshot's `sharedFocus`
 * will carry `anchor` and `by` (amendment A14); until then this read, the PUT's receipt plus `by`, is where they are.
 */
export interface RoomFocus {
  revision: number
  artifactVersionId: string | null
  /** A heading's anchor, `#n` for its n-th repeat; null at the report's top. */
  anchor: string | null
  by: 'member' | 'sophia'
  /** The revision the current showing began at (its member's show); Sophia's walks don't move it. */
  shownAt: number
}

const parseRoomFocus = checked<RoomFocus>(
  {
    revision: isNum,
    artifactVersionId: isStrOrNull,
    anchor: isStrOrNull,
    by: (v) => v === 'member' || v === 'sophia',
    shownAt: isNum,
  },
  'room focus',
)

/** A14: where the room's focus is now (proposed read; see RoomFocus). */
export const getRoomFocus = (token: string, roomId: string, signal?: AbortSignal): Promise<RoomFocus> =>
  callApi(`/api/v1/rooms/${roomId}/focus`, { token, method: 'GET', ...(signal ? { signal } : {}) }, parseRoomFocus)

/** A16 (proposed): a version's review, approved or with the changes asked for. */
export interface VersionReview {
  reviewId: string
  verdict: 'approved' | 'changes_requested'
  note: string | null
  by: string
  at: string
}

export interface ReviewAsk {
  verdict: VersionReview['verdict']
  note?: string
}

const REVIEW = {
  reviewId: isStr,
  verdict: (v: unknown) => v === 'approved' || v === 'changes_requested',
  note: isStrOrNull,
  by: isStr,
  at: isStr,
}
const parseReview = checked<VersionReview>(REVIEW, 'review')
const parseReviews = checked<{ reviews: readonly VersionReview[] }>({ reviews: listOf(REVIEW) }, 'review list')

/** A16: a version's reviews, newest first. */
export const listReviews = (token: string, artifactId: string, versionId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/artifacts/${artifactId}/versions/${versionId}/reviews`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseReviews,
  )

/** A16: review a version (editors and admins), once per key; asking for changes admits Sophia's revision. */
export const reviewVersion = (token: string, artifactId: string, versionId: string, key: string, body: ReviewAsk) =>
  callApi(`/api/v1/artifacts/${artifactId}/versions/${versionId}/reviews`, { token, key, body }, parseReview)

/** A17 (proposed): a task made from a passage of a report, for a member or for anyone. */
export interface ProjectTask {
  taskId: string
  text: string
  /** The member it is for (an actor id), or null: anyone. */
  owner: string | null
  ownerName: string | null
  /** The passage it came from: its version, its place there (passage-link.ts) and its words, as selected. */
  from: { versionId: string; versionNumber: number; passage: string; quote: string }
  by: string
  at: string
  doneBy: string | null
  doneAt: string | null
}

export interface TaskAsk {
  text: string
  owner: string | null
  from: { artifactId: string; versionId: string; passage: string; quote: string }
}

const TASK = {
  taskId: isStr,
  text: isStr,
  owner: isStrOrNull,
  ownerName: isStrOrNull,
  from: (v: unknown) => fields(v, { versionId: isStr, versionNumber: isNum, passage: isStr, quote: isStr }),
  by: isStr,
  at: isStr,
  doneBy: isStrOrNull,
  doneAt: isStrOrNull,
}
const parseTask = checked<ProjectTask>(TASK, 'task')
const parseTasks = checked<{ tasks: readonly ProjectTask[] }>({ tasks: listOf(TASK) }, 'task list')

/** A17: a report's tasks, newest first. */
export const listTasks = (token: string, artifactId: string, signal?: AbortSignal) =>
  callApi(`/api/v1/artifacts/${artifactId}/tasks`, { token, method: 'GET', ...(signal ? { signal } : {}) }, parseTasks)

/** A17: a task from a passage (editors and admins), once per key. */
export const createTask = (token: string, projectId: string, key: string, body: TaskAsk) =>
  callApi(`/api/v1/projects/${projectId}/tasks`, { token, key, body }, parseTask)

/** A17: a task done (whoever it is for, an editor or an admin), once per key. */
export const finishTask = (token: string, projectId: string, taskId: string, key: string) =>
  callApi(`/api/v1/projects/${projectId}/tasks/${taskId}/done`, { token, key, body: {} }, parseTask)

/** A12 refinement (proposed): what a closed meeting's work made later, linked to it, never inside its recap. */
export interface AfterUpdate {
  at: string
  kind: 'work_finished' | 'version_made'
  taskId: string | null
  artifactId: string | null
  artifactVersionId: string | null
  versionNumber: number | null
  title: string | null
}

const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v)
const parseAfter = checked<{ updates: readonly AfterUpdate[] }>(
  {
    updates: listOf({
      at: isStr,
      kind: (v) => v === 'work_finished' || v === 'version_made',
      taskId: isStrOrNull,
      artifactId: isStrOrNull,
      artifactVersionId: isStrOrNull,
      versionNumber: isNumOrNull,
      title: isStrOrNull,
    }),
  },
  'after-meeting list',
)

/** A12 refinement: a closed meeting's later outcomes, oldest first. */
export const getAfter = (token: string, projectId: string, meetingId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/meetings/${meetingId}/after`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseAfter,
  )

/** A18 (proposed): one of the project's text conversations, as listed; its own history, the project's context. */
export interface ConversationSummary {
  id: string
  title: string
  /** Sophia's, from this conversation's records only; null when there is none yet. */
  summary: string | null
  lastAt: string
  /** Who wrote there: never everyone who can read it. */
  contributors: readonly { actorId: string; name: string }[]
  /** Sophia answered there. */
  sophia: boolean
  openQuestions: number
  /** The report it made, if any. */
  output: { artifactId: string; versionId: string; versionNumber: number; title: string } | null
  /**
   * A18 (proposed, for Davide): its newest message, a line of it; absent where the API doesn't say it yet, null when
   * there is none. Behind the vision flag, the fixture pages answer it.
   */
  lastMessage?: {
    author: 'member' | 'sophia'
    actorId: string | null
    /** The author's name, as a message carries it: a member no longer listed is still named. */
    name: string | null
    text: string
    at: string
  } | null
}

/** A18: a message in a conversation, a member's or Sophia's. */
export interface ConversationMessage {
  id: string
  author: 'member' | 'sophia'
  actorId: string | null
  name: string | null
  text: string
  at: string
}

/** A18: a page of a conversation's messages, oldest first; `before` reads the page before it. */
export interface MessagePage {
  messages: readonly ConversationMessage[]
  before: string | null
}

const isOutput = (v: unknown) =>
  v === null || fields(v, { artifactId: isStr, versionId: isStr, versionNumber: isNum, title: isStr })
const SUMMARY = {
  id: isStr,
  title: isStr,
  summary: isStrOrNull,
  lastAt: isStr,
  contributors: listOf({ actorId: isStr, name: isStr }),
  sophia: (v: unknown) => typeof v === 'boolean',
  openQuestions: isNum,
  output: isOutput,
  lastMessage: (v: unknown) =>
    v === undefined ||
    v === null ||
    fields(v, {
      author: (a: unknown) => a === 'member' || a === 'sophia',
      actorId: isStrOrNull,
      name: isStrOrNull,
      text: isStr,
      at: isStr,
    }),
}
const MESSAGE = {
  id: isStr,
  author: (v: unknown) => v === 'member' || v === 'sophia',
  actorId: isStrOrNull,
  name: isStrOrNull,
  text: isStr,
  at: isStr,
}
const parseConversations = checked<{ conversations: readonly ConversationSummary[] }>(
  { conversations: (v) => Array.isArray(v) && v.every((c) => fields(c, SUMMARY)) },
  'conversation list',
)
const parseMessages = checked<MessagePage>(
  { messages: (v) => Array.isArray(v) && v.every((m) => fields(m, MESSAGE)), before: isStrOrNull },
  'message page',
)

/** A18: the project's conversations, newest activity first. */
export const listConversations = (token: string, projectId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/conversations`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseConversations,
  )

/** A18: a page of a conversation's messages: the newest, or those before `before`. */
export const getConversationMessages = (
  token: string,
  conversationId: string,
  before: string | null,
  signal?: AbortSignal,
) =>
  callApi(
    `/api/v1/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseMessages,
  )

/** A18 (proposed): a conversation started with its first message; Sophia asked there too, or not. */
export interface ConversationAsk {
  title: string
  text: string
  askSophia: boolean
}

/** A18: a message in a conversation; Sophia asked to answer it, or not. */
export interface MessageAsk {
  text: string
  askSophia: boolean
}

export interface ConversationStarted {
  conversation: ConversationSummary
  message: ConversationMessage
}

export interface MessageSent {
  message: ConversationMessage
  /** Whether Sophia was asked: her answer is a later message, as the feed moves. */
  sophia: 'asked' | 'not_asked'
}

const parseStarted = checked<ConversationStarted>(
  { conversation: (v) => fields(v, SUMMARY), message: (v) => fields(v, MESSAGE) },
  'started conversation',
)
const parseSent = checked<MessageSent>(
  { message: (v) => fields(v, MESSAGE), sophia: (v) => v === 'asked' || v === 'not_asked' },
  'sent message',
)

/** A18: start a conversation (members, not viewers), once per key. */
export const startConversation = (token: string, projectId: string, key: string, body: ConversationAsk) =>
  callApi(`/api/v1/projects/${projectId}/conversations`, { token, key, body }, parseStarted)

/** A18: a message in a conversation (members, not viewers), once per key. */
export const sendConversationMessage = (token: string, conversationId: string, key: string, body: MessageAsk) =>
  callApi(`/api/v1/conversations/${conversationId}/messages`, { token, key, body }, parseSent)

/** A20 (proposed): which entry of the room's discussion a reply answers, with that entry's first words as recorded. */
export interface DiscussionReply {
  entryId: string
  replyTo: { id: string; actorId: string; excerpt: string }
}

const parseReplies = checked<{ replies: readonly DiscussionReply[] }>(
  {
    replies: listOf({
      entryId: isStr,
      replyTo: (v: unknown) => fields(v, { id: isStr, actorId: isStr, excerpt: isStr }),
    }),
  },
  'reply list',
)

/** A20: the replies in the room's recent discussion (until `DiscussionEntry` carries `replyTo` itself). */
export const listReplies = (token: string, projectId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/discussion/replies`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseReplies,
  )
