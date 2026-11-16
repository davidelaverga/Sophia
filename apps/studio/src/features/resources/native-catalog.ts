// A51's catalog in the Resources view (INC01-DES-002, docs/plans/inc01-resources-service-adapter.md), pure: each row as
// the view's Resource, its pages merged, and one read's state, fenced by its generation.
//
// A row says what A51 records and nothing more. Its tool is the Studio's (claude is Claude Code). Its owner's name is the
// label, or "Unknown name" with a neutral mark, never an id; a former owner is said so. Its sessions, account and
// controls aren't reported, so they are null: never an empty list, an account made up from an id, or a control said
// unsupported. Its host for the view is unknown; what is recorded of it, its connection and its qualification, are its
// owner's alone (`catalog.mine`), each judged by the server at its page's time and kept with that time.
//
// Pages are independent observations, not one snapshot. They merge in order while each follows the last: a row seen
// before, a cursor seen before or not past the last, an empty page that isn't the last, or a failure after the first
// page leaves what was read as partial, never complete or empty. A final 401, 403 or 404, on any page, clears everything
// read and moves the generation on, so nothing answered for an earlier one is taken: only a new read starts again.
import type { ProjectNativeResource, ProjectNativeResourcePage } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { canonicalId } from '../../api/native-resources.ts'
import type { Resource } from './resource.ts'

/** The name said for an owner the catalog gives none for (a null or empty label). */
export const UNKNOWN_NAME = 'Unknown name'

/** One catalog row as the view's resource, judged at its page's `observedAt`. */
export function toResource(row: ProjectNativeResource, observedAt: string): Resource {
  const label = row.owner.label?.trim() ?? ''
  const mine = row.mine
  return {
    id: canonicalId(row.id),
    owner: {
      id: canonicalId(row.owner.id),
      name: label === '' ? UNKNOWN_NAME : label,
      named: label !== '',
      former: !row.owner.isMember,
    },
    tool: row.tool === 'claude' ? 'claude-code' : 'codex',
    entitlementId: null,
    host: { state: 'unknown', observedAt: null },
    sessions: null,
    controls: null,
    reservePercent: null,
    readiness: null,
    catalog: {
      state: row.state,
      observedAt,
      mine:
        mine === null
          ? null
          : {
              connection: mine.connection === null ? null : { ...mine.connection },
              host: mine.host === null ? null : { ...mine.host },
              qualification: {
                state: mine.recordedQualification.state,
                operations: [...mine.recordedQualification.operations],
                qualifiedAt: mine.recordedQualification.qualifiedAt,
                expiresAt: mine.recordedQualification.expiresAt,
              },
            },
    },
  }
}

export type CatalogStatus = 'loading' | 'complete' | 'more' | 'partial' | 'failed' | 'unavailable' | 'refused'

/** Why what was read is partial: a later page failed, or didn't follow the last. */
export type PartialWhy = 'failed' | 'inconsistent'

export interface CatalogState {
  /** The read's generation: an answer for another is never taken. */
  gen: number
  status: CatalogStatus
  rows: Resource[]
  /** Every cursor asked with, canonical: one seen again is a cycle. */
  asked: string[]
  /** The cursor the next page is asked with, as the server sent it; null when none follows. */
  next: string | null
  /** The last page's observation time, said with a partial read. */
  lastObservedAt: string | null
  /** A More read is under way. */
  reading: boolean
  partial: PartialWhy | null
  /** The refusal's status, when refused. */
  refusal: 401 | 403 | 404 | null
}

export const initialCatalog = (gen = 1): CatalogState => ({
  gen,
  status: 'loading',
  rows: [],
  asked: [],
  next: null,
  lastObservedAt: null,
  reading: false,
  partial: null,
  refusal: null,
})

export type CatalogEvent =
  /** A new read, from the start: everything read before goes, in a new generation. */
  | { type: 'read' }
  /** The next page is asked for (More). */
  | { type: 'more'; gen: number }
  /** A page came, for the read of `gen`, asked with `after`. */
  | { type: 'page'; gen: number; after: string | null; page: ProjectNativeResourcePage }
  /** The read of `gen` failed or was refused. */
  | { type: 'failed'; gen: number; error: unknown }

/** A member read's refusal, from its status alone (memberRead): no session, no access, or no such project for them. */
function refusalOf(error: unknown): 401 | 403 | 404 | null {
  if (!(error instanceof ApiError)) return null
  const { status } = error
  return status === 401 || status === 403 || status === 404 ? status : null
}

/** The catalog isn't installed where the read went (A51's 503 projection_unavailable): never an empty catalog. */
const unavailable = (error: unknown) =>
  error instanceof ApiError && error.status === 503 && error.code === 'projection_unavailable'

const partial = (state: CatalogState, why: PartialWhy): CatalogState => ({
  ...state,
  status: 'partial',
  partial: why,
  reading: false,
})

/** The first page: what it holds, complete, more to come, or, empty and not the last, partial. */
function firstPage(state: CatalogState, page: ProjectNativeResourcePage): CatalogState {
  const rows = page.resources.map((r) => toResource(r, page.observedAt))
  const read = { ...state, rows, lastObservedAt: page.observedAt, asked: [], next: page.nextCursor }
  if (page.complete) return { ...read, status: 'complete' }
  if (rows.length === 0) return partial(read, 'inconsistent')
  return { ...read, status: 'more' }
}

/** A later page, asked with `after`: merged only when it follows what was read; else what was read is partial. */
function laterPage(state: CatalogState, after: string, page: ProjectNativeResourcePage): CatalogState {
  const known = new Set(state.rows.map((r) => r.id))
  const asked = [...state.asked, canonicalId(after)]
  const rows = page.resources.map((r) => toResource(r, page.observedAt))
  const repeated = rows.some((r) => known.has(r.id))
  const cursor = page.nextCursor === null ? null : canonicalId(page.nextCursor)
  const cycles = cursor !== null && (asked.includes(cursor) || cursor <= canonicalId(after))
  if (repeated || cycles || (rows.length === 0 && !page.complete)) return partial({ ...state, asked }, 'inconsistent')
  return {
    ...state,
    rows: [...state.rows, ...rows],
    asked,
    next: page.nextCursor,
    lastObservedAt: page.observedAt,
    status: page.complete ? 'complete' : 'more',
    reading: false,
  }
}

/** A page, taken only where it was asked for: the first while loading, a later one by the cursor More sent. */
function onPage(state: CatalogState, after: string | null, page: ProjectNativeResourcePage): CatalogState {
  if (state.status === 'loading' && after === null) return firstPage(state, page)
  const asked = state.status === 'more' && state.reading && after !== null && after === state.next
  return asked ? laterPage(state, after, page) : state
}

/** A failure: refused on any page, everything read goes; else the first page's says why, a later one's is partial. */
function onFailed(state: CatalogState, error: unknown): CatalogState {
  const refusal = refusalOf(error)
  // Refused: everything read goes at once, and nothing answered for this generation is taken after.
  if (refusal !== null) return { ...initialCatalog(state.gen + 1), status: 'refused', refusal }
  if (state.status === 'loading') return { ...state, status: unavailable(error) ? 'unavailable' : 'failed' }
  return state.reading ? partial(state, 'failed') : state
}

/** One read's state, as its events come: each taken only for its own generation. */
export function catalogReducer(state: CatalogState, event: CatalogEvent): CatalogState {
  if (event.type === 'read') return initialCatalog(state.gen + 1)
  if (event.gen !== state.gen) return state
  if (event.type === 'more') return state.status === 'more' && !state.reading ? { ...state, reading: true } : state
  if (event.type === 'page') return onPage(state, event.after, event.page)
  return onFailed(state, event.error)
}
