// The personal space (contract amendment A10): the person's own conversation with Sophia, their notes and the notes
// they carried, and the projects of their Work side. Reads are owner-only on the server; every write is idempotent
// per person and key: after no reply, retry with the SAME key. Every write but erasure names the epoch of the space it
// is made against: one from before an erasure is refused (request_erased). Receipts carry ids; read the space again
// for words.
//
// A space with controlled answers (A54/A55, INC03-DES-001) is refused by the old reads (C5: 503
// projection_unavailable, retry never) and read whole through the versioned one instead: the space is read the old way
// first, and only that refusal moves its reading to A55, never another failure (readPersonalSpace).
import type {
  PersonalAnswerControlView,
  PersonalControlledExport,
  PersonalControlledSpace,
  PersonalControlledTurn,
  PersonalControlledTurnPage,
  PersonalEarlierTurns,
  PersonalExport,
  PersonalNoteRequest,
  PersonalReceipt,
  PersonalSpace,
  PersonalTurn,
  PersonalTurnPage,
  ProjectList,
} from '@sophia/contracts'
import {
  parsePersonalAnswerControlView,
  parsePersonalControlledExport,
  parsePersonalControlledSpace,
  parsePersonalControlledTurnPage,
  parsePersonalEarlierTurns,
  parsePersonalExport,
  parsePersonalReceipt,
  parsePersonalSpace,
  parsePersonalTurnPage,
  parseProjectList,
} from '@sophia/contracts/validate'
import type { QueryClient } from '@tanstack/react-query'
import { ApiError, callApi } from './client.ts'

/** A read; `signal` (the caller's) stops it: the padlock shut, nothing personal is fetched any more. */
const read = <T>(token: string, path: `/api/${string}`, parse: (value: unknown) => T, signal?: AbortSignal) =>
  callApi(path, { token, method: 'GET', ...(signal ? { signal } : {}) }, parse)

const write = (
  token: string,
  path: `/api/${string}`,
  key: string,
  epoch: number | null,
  body?: unknown,
): Promise<PersonalReceipt> =>
  callApi(
    path,
    {
      token,
      key,
      ...(epoch === null ? {} : { headers: { 'x-sophia-personal-epoch': String(epoch) } }),
      ...(body === undefined ? {} : { body }),
    },
    parsePersonalReceipt,
  )

/** The space, its `days` counted in `timeZone` (an IANA name; UTC without one). */
export const getPersonalSpace = (
  token: string,
  timeZone: string | null,
  signal?: AbortSignal,
): Promise<PersonalSpace> =>
  read(
    token,
    timeZone ? `/api/v1/personal?timeZone=${encodeURIComponent(timeZone)}` : '/api/v1/personal',
    parsePersonalSpace,
    signal,
  )

/** A long conversation read back: the page of turns before `before` (a seq), and whether earlier ones exist. */
export const getEarlierPersonalTurns = (
  token: string,
  before: number,
  signal?: AbortSignal,
): Promise<PersonalEarlierTurns> =>
  read(token, `/api/v1/personal/turns/earlier?before=${String(before)}`, parsePersonalEarlierTurns, signal)

/** What a client waiting for Sophia polls: turns after `after`, and whether a reply is still pending. */
export const getPersonalTurns = (token: string, after: number, signal?: AbortSignal): Promise<PersonalTurnPage> =>
  read(token, `/api/v1/personal/turns?after=${after}`, parsePersonalTurnPage, signal)

/**
 * One page of the export: the turns after `after` (a seq), and `next` where the following page starts, read against
 * `epoch` (one asked for after an erasure is refused, request_erased). Once `signal` aborts, the page on its way stops
 * and fails with its reason, as does one that arrives after it.
 */
async function exportPage(token: string, epoch: number, after: number, signal: AbortSignal): Promise<PersonalExport> {
  const path = `/api/v1/personal/export?after=${String(after)}` as const
  const headers = { 'x-sophia-personal-epoch': String(epoch) }
  const page = await callApi(path, { token, method: 'GET', headers, signal }, parsePersonalExport).catch(
    (err: unknown) => {
      signal.throwIfAborted()
      throw err
    },
  )
  signal.throwIfAborted()
  return page
}

/**
 * Everything the personal space keeps, read a page at a time (A10 bounds each): the first page's date, notes and carried
 * notes, with every page's turns, in order, all read against `epoch`, the space's as the copy began. Called off
 * (`signal`: the padlock shut, the sheet went, an erasure), it stops at once, asks for no page more and lets what came
 * go.
 */
export async function exportPersonalSpace(token: string, epoch: number, signal: AbortSignal): Promise<PersonalExport> {
  const first = await exportPage(token, epoch, 0, signal)
  const turns = [...first.turns]
  let next = first.next
  while (next !== null) {
    const page = await exportPage(token, epoch, next, signal)
    turns.push(...page.turns)
    next = page.next
  }
  return { ...first, turns, next: null }
}

/** A turn as either read gives it: A10's, or A54's with its input, prompt and activity. Told apart by its shape. */
export type ShownTurn = PersonalTurn | PersonalControlledTurn

/** A54's turn, as the controlled read gives it (it carries `input`, null or not); never one cast from A10's. */
export const isControlledTurn = (turn: ShownTurn): turn is PersonalControlledTurn => 'input' in turn

/** A window of a controlled space read back before the newest one: A54's page, as parsed, and when it was read. */
export interface ControlledWindow {
  /** The seq it was asked before. */
  before: number
  page: PersonalControlledTurnPage
  /** When its answer came (this device's clock): the page is as of then, not as of the round. */
  at: string
}

/**
 * A controlled space as one round read it: A55 as parsed (its database fields one read snapshot; its companion, as the
 * old space's, from the runtime after it), the earlier windows read back in the same round, each input's view on them
 * all, and when each of those reads answered. Each is its own reading: equal revisions keep them coherent, they don't
 * make them one snapshot, and nothing in it is one snapshot across requests.
 */
export interface ControlledRead extends PersonalControlledSpace {
  readonly back: readonly ControlledWindow[]
  readonly views: ReadonlyMap<string, PersonalAnswerControlView>
  /** When A55's answer came: the newest window, its inputs' views, notes and days are as of then. */
  readonly readAt: string
  /** When each input's view was read, by input id: A55's time for the window's, else its own read's. */
  readonly viewAt: ReadonlyMap<string, string>
  /** When the round ended (the refresh's completion): no fact in it is said to be current as of then. */
  readonly asOf: string
}

/** The space as read: the old way (A10), or whole through the versioned controlled read. */
export type SpaceRead = PersonalSpace | ControlledRead

export const isControlled = (space: SpaceRead): space is ControlledRead => 'spaceContract' in space

/**
 * The old reads' refusal of a controlled space (C5), and nothing else: 503 projection_unavailable, never to be asked
 * again. The old reads never give it otherwise (they don't depend on 0103); a read error there is 503 unavailable.
 */
export const refusedAsControlled = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 503 && err.code === 'projection_unavailable' && err.retry === 'never'

/**
 * A controlled read that isn't whole: its pages read at different revisions or epochs, or a view that isn't of its
 * page's input as the page has it (R01). Read again once; then what was read last stays, said as stale.
 */
export class NotCoherent extends Error {
  override name = 'NotCoherent'
  /** Not asked again by the query (retryRead): the round already was; the next refresh reads it again. Bounded. */
  readonly retry = 'never'
}

/**
 * A read-back page that breaks its own progress (a turn not before its cursor, out of order, or none while more are said
 * to be earlier): an honest failure, not read again here. What was read last stays, said as stale.
 */
export class ReadBackMalformed extends Error {
  override name = 'ReadBackMalformed'
  /** Not asked again by the query (retryRead): no retry loop on a page that breaks its own order. */
  readonly retry = 'never'
}

const ROUNDS = 2

/**
 * Where an account's cache keeps that its space reads through the controlled read (C5 said so): under the space's own
 * reads, so it goes when they go, and only then: the padlock removes every personal read (forgetPersonalReads), an
 * erasure resets them (readAfresh), and another account has another cache (cacheFor).
 */
export const protocolKey = (account: string) => ['personal', account, 'protocol'] as const

/**
 * Pins the controlled read for `account` in its cache. Never collected on its own (gcTime Infinity, for this key's
 * query, and so for one made again after a reset): an unobserved query's data would go after five minutes.
 */
export function pinControlled(client: QueryClient, account: string): void {
  client.setQueryDefaults(protocolKey(account), { gcTime: Number.POSITIVE_INFINITY })
  client.setQueryData(protocolKey(account), 'controlled')
}

/** Whether `account`'s space is pinned to the controlled read in this cache. */
export const controlledPinned = (client: QueryClient, account: string): boolean =>
  client.getQueryData(protocolKey(account)) === 'controlled'

/** How a space is read now: pinned to the controlled read, and from which seq the earlier windows go (null: none). */
export interface ReadPlan {
  pinned: boolean
  from: number | null
}

const controlledSpacePath = (timeZone: string | null) =>
  timeZone
    ? (`/api/v1/personal/answer-controls/space?timeZone=${encodeURIComponent(timeZone)}` as const)
    : ('/api/v1/personal/answer-controls/space' as const)

/** The turns before `before` (a seq), A54's page of up to 100. */
export const getControlledTurnsBefore = (token: string, before: number, signal?: AbortSignal) =>
  read(
    token,
    `/api/v1/personal/answer-controls/turns?before=${String(before)}`,
    parsePersonalControlledTurnPage,
    signal,
  )

/** One input as it stands now (A54's closed view): its control, decisions, calls and what was kept of them. */
export const getControlView = (token: string, inputId: string, signal?: AbortSignal) =>
  read(token, `/api/v1/personal/answers/${encodeURIComponent(inputId)}/control`, parsePersonalAnswerControlView, signal)

const nowIso = () => new Date().toISOString()

/** An id as A54 compares it: its last 36 characters (no `urn:uuid:`), lower case. */
const canonical = (id: string) => id.slice(-36).toLowerCase()

/**
 * Whether `view` is the view of `turn`'s input as the page has it: the same input, turn and seq, at the same control
 * revision and state (R01). What may change at the same control revision (its calls, their money, what was kept, a
 * wait that lapsed) isn't compared: it is read as it stands. There is no per-view epoch or space revision to compare.
 */
export function viewHolds(view: PersonalAnswerControlView, turn: PersonalControlledTurn): boolean {
  const { input } = turn
  return (
    input !== null &&
    canonical(view.inputId) === canonical(input.inputId) &&
    canonical(view.turnId) === canonical(turn.id) &&
    view.seq === turn.seq &&
    view.control.revision === input.revision &&
    view.control.state === input.control
  )
}

/** A55's own inputs, one snapshot with its window: each turn's input has its view, and each view holds (R01). */
function windowHolds(space: PersonalControlledSpace): boolean {
  const views = new Map(space.inputs.map((v) => [canonical(v.inputId), v]))
  const turns = space.turns.filter((t) => t.input !== null)
  return (
    views.size === turns.length &&
    turns.every((t) => {
      const view = t.input ? views.get(canonical(t.input.inputId)) : undefined
      return view !== undefined && viewHolds(view, t)
    })
  )
}

/** Views read, by input id, each with when its read answered. */
export interface ViewsRead {
  views: Map<string, PersonalAnswerControlView>
  at: Map<string, string>
}

/**
 * The views of the inputs on `turns` that `viewed` doesn't have yet, read one after another, each with its time and
 * bound to its turn (viewHolds). False at the first that doesn't hold: the read isn't whole.
 */
export async function viewsOf(
  token: string,
  turns: readonly PersonalControlledTurn[],
  viewed: ViewsRead,
  signal?: AbortSignal,
): Promise<boolean> {
  for (const turn of turns) {
    if (!turn.input || viewed.views.has(turn.input.inputId)) continue
    const view = await getControlView(token, turn.input.inputId, signal)
    if (!viewHolds(view, turn)) return false
    viewed.views.set(turn.input.inputId, view)
    viewed.at.set(turn.input.inputId, nowIso())
  }
  return true
}

/** A read-back page keeps its own progress: every turn before `before`, ascending, and some while more are earlier. */
function progresses(page: PersonalControlledTurnPage, before: number): boolean {
  const seqs = page.turns.map((t) => t.seq)
  const ordered = seqs.every((s, i) => s < before && (i === 0 || s > (seqs[i - 1] ?? s)))
  return ordered && (seqs.length > 0 || !page.earlier)
}

/**
 * The window before `before`, read back with its inputs' views, each bound to its turn, and when it answered. Null when
 * it isn't whole with what it joins (`expected`: its revision and epoch, R01). Throws ReadBackMalformed when it breaks its
 * own progress.
 */
export async function readControlledWindow(
  token: string,
  before: number,
  expected: { revision: number; epoch: number },
  viewed: ViewsRead,
  signal?: AbortSignal,
): Promise<ControlledWindow | null> {
  const page = await getControlledTurnsBefore(token, before, signal)
  if (!progresses(page, before)) throw new ReadBackMalformed('A page read back broke its own order')
  if (page.revision !== expected.revision || page.epoch !== expected.epoch) return null
  const at = nowIso()
  return (await viewsOf(token, page.turns, viewed, signal)) ? { before, page, at } : null
}

/**
 * One round: A55, then every window before it back to `from` (all that was read back, also once the newest window
 * has moved on), with their inputs' views (R02). Each window strictly progresses below the last, so the round reads at
 * most as many windows as there are seqs between its first and `from`: finite, from the range actually loaded, never
 * a cap that would leave part of it out. Null when it isn't whole (R01).
 */
async function controlledRound(
  token: string,
  timeZone: string | null,
  from: number | null,
  signal?: AbortSignal,
): Promise<ControlledRead | null> {
  const space = await read(token, controlledSpacePath(timeZone), parsePersonalControlledSpace, signal)
  const readAt = nowIso()
  if (!windowHolds(space)) return null
  const viewed: ViewsRead = {
    views: new Map(space.inputs.map((v) => [v.inputId, v])),
    at: new Map(space.inputs.map((v) => [v.inputId, readAt])),
  }
  const back: ControlledWindow[] = []
  const reaches = (before: number | undefined, earlier: boolean): before is number =>
    from !== null && before !== undefined && earlier && before > from
  let at = { before: space.turns[0]?.seq, earlier: space.earlier }
  for (const most = Math.max(0, (at.before ?? 0) - (from ?? 0)); reaches(at.before, at.earlier);) {
    if (back.length >= most) throw new ReadBackMalformed('Reading back made no progress')
    const window = await readControlledWindow(token, at.before, space, viewed, signal)
    if (!window) return null
    back.unshift(window)
    at = { before: window.page.turns[0]?.seq, earlier: window.page.earlier }
  }
  return { ...space, back, views: viewed.views, readAt, viewAt: viewed.at, asOf: nowIso() }
}

/**
 * The controlled space read whole, in a round whose windows keep to its revision and epoch and whose views are their
 * inputs' (asked twice at most, then NotCoherent). A page breaking its own progress fails at once (ReadBackMalformed).
 */
export async function readControlledSpace(
  token: string,
  timeZone: string | null,
  from: number | null,
  signal?: AbortSignal,
): Promise<ControlledRead> {
  for (let round = 1; ; round += 1) {
    const whole = await controlledRound(token, timeZone, from, signal)
    if (whole) return whole
    if (round >= ROUNDS) throw new NotCoherent('The conversation changed while it was read')
  }
}

/**
 * The space, read the old way first: its answer is the space, unless it is C5's refusal of a controlled space; then
 * (`onControlled`: the caller pins it) and from then on (`plan.pinned`) it is read whole through A55. Any other failure,
 * of either read, is the read's: never one read in place of the other, never an empty or default space.
 */
export async function readPersonalSpace(
  token: string,
  timeZone: string | null,
  plan: ReadPlan,
  onControlled: () => void,
  signal?: AbortSignal,
): Promise<SpaceRead> {
  if (!plan.pinned) {
    try {
      return await getPersonalSpace(token, timeZone, signal)
    } catch (err: unknown) {
      if (!refusedAsControlled(err)) throw err
      onControlled()
    }
  }
  return readControlledSpace(token, timeZone, plan.from, signal)
}

async function controlledExportPage(
  token: string,
  epoch: number,
  after: number,
  signal: AbortSignal,
): Promise<PersonalControlledExport> {
  const path = `/api/v1/personal/answer-controls/export?after=${String(after)}` as const
  const headers = { 'x-sophia-personal-epoch': String(epoch) }
  const page = await callApi(path, { token, method: 'GET', headers, signal }, parsePersonalControlledExport).catch(
    (err: unknown) => {
      signal.throwIfAborted()
      throw err
    },
  )
  signal.throwIfAborted()
  return page
}

/** A controlled export read whole: its pages joined, and when each page was made (each its own reading). */
export interface ControlledExport extends PersonalControlledExport {
  /** Each page's own `exportedAt`, from the seq its turns start at (the first page's is the export's). */
  readonly pages: readonly { from: number | null; exportedAt: string }[]
}

/**
 * Everything a controlled space keeps (A54's export), a page at a time against `epoch`, as exportPersonalSpace reads
 * the old one: every page's turns and their inputs' views, in order, with the first page's notes and carried notes,
 * and when each page was made.
 */
export async function exportControlledSpace(
  token: string,
  epoch: number,
  signal: AbortSignal,
): Promise<ControlledExport> {
  const first = await controlledExportPage(token, epoch, 0, signal)
  const turns = [...first.turns]
  const inputs = [...first.inputs]
  const pages = [{ from: first.turns[0]?.seq ?? null, exportedAt: first.exportedAt }]
  let next = first.next
  while (next !== null) {
    const page = await controlledExportPage(token, epoch, next, signal)
    turns.push(...page.turns)
    inputs.push(...page.inputs)
    pages.push({ from: page.turns[0]?.seq ?? null, exportedAt: page.exportedAt })
    next = page.next
  }
  return { ...first, turns, inputs, next: null, pages }
}

export const listProjects = (token: string, signal?: AbortSignal): Promise<ProjectList> =>
  read(token, '/api/v1/projects', parseProjectList, signal)

/** The person's archived projects (A30): out of the list above, here instead. */
export const listArchivedProjects = (token: string, signal?: AbortSignal): Promise<ProjectList> =>
  read(token, '/api/v1/projects/archived', parseProjectList, signal)

export const sendPersonalTurn = (token: string, key: string, epoch: number, text: string) =>
  write(token, '/api/v1/personal/turns', key, epoch, { text })

/** Back after a quiet spell: Sophia welcomes the person by `name`, if a welcome is due (turnId null if not). */
export const resumePersonalSpace = (token: string, key: string, epoch: number, name: string | null) =>
  write(token, '/api/v1/personal/resume', key, epoch, name ? { name } : {})

export const retryPersonalTurn = (token: string, key: string, epoch: number, turnId: string) =>
  write(token, `/api/v1/personal/turns/${turnId}/retry`, key, epoch)

export const decidePersonalSuggestion = (
  token: string,
  key: string,
  epoch: number,
  suggestionId: string,
  decision: 'keep' | 'dismiss',
) => write(token, `/api/v1/personal/suggestions/${suggestionId}/decision`, key, epoch, { decision })

export const keepPersonalNote = (token: string, key: string, epoch: number, note: PersonalNoteRequest) =>
  write(token, '/api/v1/personal/notes', key, epoch, note)

export const forgetPersonalNote = (token: string, key: string, epoch: number, noteId: string) =>
  write(token, `/api/v1/personal/notes/${noteId}/forget`, key, epoch)

export const carryPersonalNote = (token: string, key: string, epoch: number, noteId: string, projectId: string) =>
  write(token, `/api/v1/personal/notes/${noteId}/carry`, key, epoch, { projectId })

export const takeBackPersonalRelease = (token: string, key: string, epoch: number, releaseId: string) =>
  write(token, `/api/v1/personal/releases/${releaseId}/take-back`, key, epoch)

/** Never fenced: erasing writes nothing back, and its retry gets its receipt after the epoch moved. */
export const erasePersonalSpace = (token: string, key: string) =>
  write(token, '/api/v1/personal/erasure', key, null, { confirm: 'delete' })
