// A51's member-safe catalog of a project's native resources (INC01-DES-002, docs/plans/inc01-resources-service-adapter.md):
// one page, read as a project member read. A final 401, 403 or 404 is refused from its status before the body is read
// (memberRead), after the client's one renewal of a refused token. The reply is read by the reviewed generated parser
// (tolerant: it drops unknown extra properties, and refuses an unknown enum, a wrong type, a bad UUID, time or bound),
// then checked for the relations the schema can't say. A page that breaks either is a contract violation, never a
// row filtered out or an empty page.
import type { ProjectNativeResource, ProjectNativeResourcePage } from '@sophia/contracts'
import { parseProjectNativeResourcePage } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

/** An id as A51 reads it: its last 36 characters (no `urn:uuid:`), lower case, which sorts as the server's UUIDs do. */
export const canonicalId = (id: string): string => id.slice(-36).toLowerCase()

/** What the page broke: said for us (the error's cause), never to the person, who reads that it couldn't be read. */
export class CatalogViolation extends Error {
  override name = 'CatalogViolation'
}

const OPERATION_ORDER = ['create', 'input', 'stop'] as const

/** The recorded operations as A51 gives them: each once, in the fixed order, and none exactly when there is no record. */
function operationsHold(row: ProjectNativeResource): boolean {
  if (row.mine === null) return true
  const { state, operations } = row.mine.recordedQualification
  if ((operations.length === 0) !== (state === 'none')) return false
  const ranks = operations.map((o) => OPERATION_ORDER.indexOf(o))
  return ranks.every((rank, i) => i === 0 || rank > (ranks[i - 1] ?? -1))
}

/** Whose it is agrees with who reads: `isYou` exactly when its owner is the token's subject, and `mine` only then. */
const ownerHolds = (row: ProjectNativeResource, subject: string): boolean =>
  row.owner.isYou === (canonicalId(row.owner.id) === subject) && (row.mine !== null) === row.owner.isYou

/**
 * The relations a page must keep, beyond its schema: complete exactly when no cursor follows; each row its reader's or
 * not, with its private part only then; operations as recorded; ids strictly ascending past the cursor asked with; a
 * next cursor that is the page's own last row, or, on a page with no row, past the cursor asked with. Throws on the
 * first broken one.
 */
export function checkPage(page: ProjectNativeResourcePage, subject: string, after: string | null): void {
  if (page.complete !== (page.nextCursor === null)) throw new CatalogViolation('complete and nextCursor disagree')
  let last = after === null ? null : canonicalId(after)
  for (const row of page.resources) {
    const id = canonicalId(row.id)
    if (last !== null && id <= last) throw new CatalogViolation('row ids are not ascending past the cursor')
    if (!ownerHolds(row, subject)) throw new CatalogViolation('owner and reader disagree')
    if (!operationsHold(row)) throw new CatalogViolation('recorded operations are not a set in order')
    last = id
  }
  checkCursor(page, last, after)
}

/**
 * Where the next page starts. A page with rows goes on from its own last row (0097): a cursor past it would skip the
 * rows between, one behind it would read some again. A page with none has no last row; its cursor need only advance
 * past the one asked with (the catalog then says what was read partial).
 */
function checkCursor(page: ProjectNativeResourcePage, last: string | null, after: string | null): void {
  if (page.nextCursor === null) return
  const next = canonicalId(page.nextCursor)
  if (page.resources.length > 0) {
    if (next !== last) throw new CatalogViolation('the next cursor is not the last row')
  } else if (after !== null && next <= canonicalId(after)) {
    throw new CatalogViolation('the next cursor does not advance')
  }
}

/** The page read, checked for this reader and this cursor: the parser's, then the relations. */
export const readCatalogPage =
  (subject: string, after: string | null) =>
  (value: unknown): ProjectNativeResourcePage => {
    const page = parseProjectNativeResourcePage(value)
    checkPage(page, canonicalId(subject), after)
    return page
  }

/**
 * One page of the project's native resource catalog, as a project member read: after `after` (the previous page's
 * `nextCursor`, sent as it came), or the first. `subject` is the token's own (tokenSubject), the reader `isYou` names.
 */
export function listProjectNativeResources(
  token: string,
  projectId: string,
  subject: string,
  after: string | null,
  signal?: AbortSignal,
): Promise<ProjectNativeResourcePage> {
  const query = after === null ? '' : `?after=${encodeURIComponent(after)}`
  return callApi(
    `/api/v1/projects/${encodeURIComponent(projectId)}/native-resources${query}`,
    { token, method: 'GET', memberRead: true, ...(signal && { signal }) },
    readCatalogPage(subject, after),
  )
}
