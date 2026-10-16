// The project's search (A38, docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md): the served one through the generated
// validator, under the search flag; under the vision flag, the A13 proposal the fixture pages answer (recaps too,
// api/vision.ts). A served hit is the Studio's SearchHit with no meeting: A38 has no recaps.
import type { SearchPage as ServedPage } from '@sophia/contracts'
import { parseSearchPage } from '@sophia/contracts/validate'
import { SEARCH } from '../app/search.ts'
import { VISION } from '../app/vision.ts'
import { callApi } from './client.ts'
import { searchProject as searchProposed, type SearchHit, type SearchPage } from './vision.ts'

/** A38's page as the Studio's: each hit without a meeting. */
export const servedPage = (page: ServedPage): SearchPage => ({
  hits: page.hits.map((h): SearchHit => ({ ...h, meetingId: null })),
  next: page.next,
})

const searchServed = (token: string, projectId: string, q: string, cursor: string | null, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/search?${new URLSearchParams({ q, ...(cursor ? { cursor } : {}) }).toString()}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    (value) => servedPage(parseSearchPage(value)),
  )

/** The project's search: A38's when it is served and the proposal isn't answered instead. */
export const searchProject = SEARCH && !VISION ? searchServed : searchProposed

/** Search is offered: served (A38), or proposed on the fixture pages (A13). */
export const SEARCHABLE = SEARCH || VISION
