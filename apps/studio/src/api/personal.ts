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

/** The rounds read whose pages kept to different revisions or epochs: what was read last stays, said as stale. */
export class NotCoherent extends Error {
  override name = 'NotCoherent'
}

/** How far back a controlled round reads: at most this many earlier windows of 100 turns (bounded, never all). */
export const BACK_WINDOWS = 20
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

/** Views read, by input id, each with when its read answered. */
export interface ViewsRead {
  views: Map<string, PersonalAnswerControlView>
  at: Map<string, string>
}

/** The views of the inputs on `turns` that `viewed` doesn't have yet, read one after another, each with its time. */
export async function viewsOf(
  token: string,
  turns: readonly PersonalControlledTurn[],
  viewed: ViewsRead,
  signal?: AbortSignal,
): Promise<void> {
  for (const turn of turns) {
    if (!turn.input || viewed.views.has(turn.input.inputId)) continue
    viewed.views.set(turn.input.inputId, await getControlView(token, turn.input.inputId, signal))
    viewed.at.set(turn.input.inputId, nowIso())
  }
}

/**
 * One round: A55, then the windows before it back to `from` (at most BACK_WINDOWS), with their inputs' views. Null when
 * a window was read at another revision or epoch than the space: the round is no whole picture.
 */
async function controlledRound(
  token: string,
  timeZone: string | null,
  from: number | null,
  signal?: AbortSignal,
): Promise<ControlledRead | null> {
  const space = await read(token, controlledSpacePath(timeZone), parsePersonalControlledSpace, signal)
  const readAt = nowIso()
  const viewed: ViewsRead = {
    views: new Map(space.inputs.map((v) => [v.inputId, v])),
    at: new Map(space.inputs.map((v) => [v.inputId, readAt])),
  }
  const back: ControlledWindow[] = []
  // Read back while what was read back before (to `from`) isn't reached, earlier turns exist, and within the bound.
  const reaches = (before: number | undefined, earlier: boolean): before is number =>
    from !== null && before !== undefined && earlier && before > from
  let at = { before: space.turns[0]?.seq, earlier: space.earlier }
  for (let n = 0; n < BACK_WINDOWS && reaches(at.before, at.earlier); n += 1) {
    const before: number = at.before
    const page = await getControlledTurnsBefore(token, before, signal)
    if (page.revision !== space.revision || page.epoch !== space.epoch) return null
    back.unshift({ before, page, at: nowIso() })
    await viewsOf(token, page.turns, viewed, signal)
    at = { before: page.turns[0]?.seq, earlier: page.earlier }
  }
  return { ...space, back, views: viewed.views, readAt, viewAt: viewed.at, asOf: nowIso() }
}

/** The controlled space read whole, in a round whose windows keep to its revision and epoch (asked twice at most). */
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
