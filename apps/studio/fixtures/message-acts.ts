// A member corrects or withdraws their own message in the room's chat, as the API answers it (A36,
// docs/plans/message-acts.md): the discussion read with or without revisions=1, the act's preview and its proof, and the
// act itself, idempotent per key. `acts=1` gives the viewer's messages their kind, so the chat offers the acts; the
// controls (`window.fixture.staleNextAct`, `loseNextActReply`, `failNextAct`, `reachNextPreview`) make the API's
// refusals, a lost reply and a preview that reaches running work. Every word is synthetic.
import type {
  ContributionActPreview,
  ContributionActReceipt,
  DiscussionEntry,
  DiscussionPage,
  WithdrawnEntry,
} from '@sophia/contracts'
import { authorOf, idOf, ME, PROJECT, said, type Said } from './data.ts'

export interface MessageActs {
  /** The viewer's messages carry their kind, so the chat offers the acts (`acts=1`). */
  offered: boolean
  /** Each act by its Idempotency-Key: the same key again answers the same receipt. */
  keys: Map<string, { body: string; receipt: ContributionActReceipt }>
  /** The next act is refused as stale, the message corrected elsewhere first (`staleNextAct`). */
  staleNext?: boolean
  /** The next act lands, but its reply is lost on the way (`loseNextActReply`). */
  loseNextReply?: boolean
  /** The next act fails as an unavailable API's, nothing done (`failNextAct`). */
  failNext?: boolean
  /** How many running research tasks the next previews list as reading the words (`reachNextPreview`). */
  reach: number
  /** While set, acts land but their replies wait for `releaseActs` (`holdActs`). */
  held?: (() => void)[] | null
}

export const messageActsOf = (query: URLSearchParams): MessageActs => ({
  offered: query.get('acts') === '1',
  keys: new Map(),
  reach: 0,
})

interface Discussing {
  messages: (string | Said)[]
  messageActs?: MessageActs
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const problem = (status: number, code: string, message: string) =>
  json({ code, message, requestId: '00000000-0000-4000-8000-0000000000d1', retry: 'never' }, status)

const isWithdrawn = (m: string | Said): m is Said => typeof m !== 'string' && m.withdrawnAt !== undefined

/** An entry as read with revisions=1: its revision, when corrected, and (with `acts=1`) what it is made of. */
function revised(m: string | Said, n: number, offered: boolean): DiscussionEntry {
  const s = typeof m === 'string' ? { text: m } : m
  return {
    ...said(m, n),
    revision: s.revision ?? 1,
    correctedAt: s.correctedAt ?? null,
    ...(offered ? { kind: s.kind ?? 'text' } : {}),
    mentions: s.mentions ?? [],
  }
}

const tombstone = (m: Said, n: number): WithdrawnEntry => ({
  id: idOf(m, n),
  actorId: authorOf(m),
  authorName: null,
  createdAt: said(m, n).createdAt,
  withdrawnAt: m.withdrawnAt ?? said(m, n).createdAt,
})

/**
 * The discussion's `limit` newest before `end` (an index into the messages), as the API reads it: without revisions,
 * withdrawn messages left out; with them, counted as their places.
 */
function windowOf(project: Discussing, end: number, revisions: boolean, limit = 50) {
  const placed = project.messages
    .slice(0, end)
    .map((m, n) => ({ m, n }))
    .filter(({ m }) => revisions || !isWithdrawn(m))
  const page = placed.slice(-limit)
  const offered = project.messageActs?.offered ?? false
  return {
    more: placed.length > limit,
    entries: page
      .filter(({ m }) => !isWithdrawn(m))
      .map(({ m, n }) => (revisions ? revised(m, n, offered) : said(m, n))),
    withdrawn: page.flatMap(({ m, n }) => (isWithdrawn(m) ? [tombstone(m, n)] : [])),
    oldest: page[0] ? idOf(page[0].m, page[0].n) : null,
  }
}

/** The snapshot's discussion, as the API serves it with or without revisions=1. */
export function snapshotDiscussion(project: Discussing, revisions: boolean) {
  const w = windowOf(project, project.messages.length, revisions)
  return revisions ? { discussion: w.entries, discussionWithdrawn: w.withdrawn } : { discussion: w.entries }
}

/** A page of the discussion before the message at `end` (A23), as the API serves it with or without revisions=1. */
export function discussionPageOf(project: Discussing, end: number, revisions: boolean): DiscussionPage {
  const w = windowOf(project, end, revisions)
  const page = { entries: w.entries, before: w.more ? w.oldest : null }
  return revisions ? { ...page, withdrawn: w.withdrawn } : page
}

const ACT = /^\/api\/v1\/projects\/[0-9a-f-]+\/contributions\/([0-9a-f-]+)\/(preview|correction|withdrawal)$/

/** Where the fixture answers: what it records as served, and the project moving on. */
export interface Answering {
  served: string[]
  publish: () => void
}

/** The message a request names, if it is the viewer's own; otherwise the API's refusal. */
function ownMessage(project: Discussing, id: string | undefined): { n: number; own: Said } | Response {
  const n = project.messages.findIndex((m, i) => idOf(m, i) === id)
  const message = project.messages[n]
  if (message === undefined) return problem(422, 'not_found', 'Message not found')
  if (authorOf(message) !== ME) return problem(403, 'forbidden', 'Not permitted')
  return { n, own: typeof message === 'string' ? { text: message } : message }
}

/** What the act would do, and its proof: `reachNextPreview` research tasks reading a written message's words. */
function previewOf(acts: MessageActs, at: { n: number; own: Said }, url: URL, served: string[]): Response {
  const { own } = at
  const action = url.searchParams.get('action') === 'withdraw' ? 'withdraw' : 'correct'
  served.push(`act-preview:${action}`)
  if (own.withdrawnAt) return problem(409, 'stale_revision', 'Stale message: it has been withdrawn')
  const shared = own.kind === 'reference'
  if (action === 'correct' && shared)
    return problem(422, 'invalid_request', 'A message that shares a report or file can’t be corrected')
  const preview: ContributionActPreview = {
    contributionId: idOf(own, at.n),
    action,
    revision: own.revision ?? 1,
    erases: !shared,
    reach: Array.from({ length: shared ? 0 : acts.reach }, (_, i) => ({
      taskId: `00000000-0000-4000-8000-0000000007${String(i).padStart(2, '0')}`,
      kind: 'research' as const,
      restarts: true,
    })),
    previewToken: `v2.${Math.floor(Date.now() / 1000) + 900}.${'a'.repeat(64)}`,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  }
  return json(preview)
}

/** The preview, correction or withdrawal of a message; undefined for any other request. */
export function messageActAnswer(
  project: Discussing,
  method: string,
  url: URL,
  init: RequestInit | undefined,
  { served, publish }: Answering,
): Response | Promise<Response> | undefined {
  const match = ACT.exec(url.pathname)
  const acts = project.messageActs
  if (!match || !acts) return undefined
  const [, id, what] = match
  const preview = method === 'GET' && what === 'preview'
  if (!preview && (method !== 'POST' || what === 'preview')) return undefined
  const at = ownMessage(project, id)
  if (at instanceof Response) return at
  if (preview) return previewOf(acts, at, url, served)
  const operation = what === 'correction' ? 'correct' : 'withdraw'
  return acted({ project, acts, at: { ...at, operation }, served, publish }, init)
}

/** The act's body as the page sent it: its words and the revision it was shown. */
function requestOf(body: string): { text?: string; expectedRevision?: number; reach?: number } {
  const value: unknown = JSON.parse(body)
  if (typeof value !== 'object' || value === null) return {}
  const text = 'text' in value && typeof value.text === 'string' ? value.text : undefined
  const revision =
    'expectedRevision' in value && typeof value.expectedRevision === 'number' ? value.expectedRevision : undefined
  const reach = 'reach' in value && Array.isArray(value.reach) ? value.reach.length : undefined
  return {
    ...(text === undefined ? {} : { text }),
    ...(revision === undefined ? {} : { expectedRevision: revision }),
    ...(reach === undefined ? {} : { reach }),
  }
}

/** An act as the API takes it: the message it names, and where the fixture answers. */
interface Acting {
  project: Discussing
  acts: MessageActs
  at: { n: number; own: Said; operation: ContributionActReceipt['operation'] }
  served: string[]
  publish: () => void
}

/** Someone else's tab corrected the message first: the revision shown is no longer the message's. */
function correctedElsewhere({ project, at, served, publish }: Acting, id: string): Response {
  project.messages[at.n] = {
    ...at.own,
    id,
    text: `${at.own.text} (corrected elsewhere)`,
    revision: (at.own.revision ?? 1) + 1,
    correctedAt: new Date().toISOString(),
  }
  publish()
  served.push(`act-stale:${at.operation}`)
  return problem(409, 'stale_revision', 'Stale message: it changed since it was shown')
}

/** The act done: the message corrected or withdrawn (identical words change nothing), and its receipt. */
function applied({ project, at, publish }: Acting, id: string, text: string | undefined): ContributionActReceipt {
  const revision = (at.own.revision ?? 1) + 1
  const now = new Date().toISOString()
  const changed = at.operation === 'withdraw' || text !== at.own.text
  if (changed) {
    project.messages[at.n] =
      at.operation === 'withdraw'
        ? { ...at.own, id, revision, withdrawnAt: now }
        : { ...at.own, id, text: text ?? at.own.text, revision, correctedAt: now }
    publish()
  }
  return {
    contributionId: id,
    projectId: PROJECT,
    operation: at.operation,
    revision: changed ? revision : (at.own.revision ?? 1),
    state: at.operation === 'withdraw' ? 'withdrawn' : 'current',
    changed,
    cursor: changed ? '1' : null,
  }
}

/** The same key again answers its receipt (another body, a conflict); `failNextAct` fails before anything is done. */
function replayedOrFailed({ acts, at, served }: Acting, key: string, body: string): Response | undefined {
  const replayed = acts.keys.get(key)
  if (replayed) {
    served.push(`act-replayed:${at.operation}`)
    return replayed.body === body ? json(replayed.receipt) : problem(409, 'idempotency_conflict', 'Key reused')
  }
  if (!acts.failNext) return undefined
  acts.failNext = false
  served.push(`act-failed:${at.operation}`)
  return problem(503, 'unavailable', 'The records can’t be written right now')
}

/** Stale as the API is: withdrawn, a moved revision, or work that read the words started or ended since the preview. */
function staleFor({ acts, at }: Acting, request: { expectedRevision?: number; reach?: number }): boolean {
  const reach = at.own.kind === 'reference' ? 0 : acts.reach
  return !!at.own.withdrawnAt || request.expectedRevision !== (at.own.revision ?? 1) || request.reach !== reach
}

function acted(acting: Acting, init: RequestInit | undefined): Response | Promise<Response> {
  const { project, acts, at, served } = acting
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const body = typeof init?.body === 'string' ? init.body : '{}'
  const early = replayedOrFailed(acting, key, body)
  if (early) return early
  const request = requestOf(body)
  const id = idOf(project.messages[at.n] ?? at.own, at.n)
  if (acts.staleNext) {
    acts.staleNext = false
    return correctedElsewhere(acting, id)
  }
  if (staleFor(acting, request)) {
    served.push(`act-stale:${at.operation}`)
    return problem(409, 'stale_revision', 'Stale message: it changed since it was shown')
  }
  const receipt = applied(acting, id, request.text)
  acts.keys.set(key, { body, receipt })
  served.push(`act:${at.operation}`)
  if (acts.loseNextReply) {
    acts.loseNextReply = false
    return Promise.reject(new TypeError('Failed to fetch')) // it landed; the page never hears so
  }
  const held = acts.held
  if (held) return new Promise((resolve) => held.push(() => resolve(json(receipt))))
  return json(receipt)
}
