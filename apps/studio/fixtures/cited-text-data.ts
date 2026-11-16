// A project input the fixture report cites, and its text as getCitedReportText answers it (A11, 0090), on the fixture
// page only (`cites=input`). Labelled synthetic data: markup and a remote address inside the text, so a check can tell
// that it is shown as text, runs nothing and loads nothing. `cites=inputs` lists a second, titled input, also uncited.
// `cited=refused` answers the one refusal (not_found); `cited=tamper` answers bytes its record does not name;
// `hold=cited` holds each read until the page lets it through.
import type { ReportSourceList, SourceContent } from '@sophia/contracts'

export const CITED_INPUT = '00000000-0000-4000-8000-0000000000ce'

export const CITED_TEXT =
  'A labelled synthetic note — café ☕.\nOption A: 90 credits; Option B: 60 credits.\n<img src="https://tracker.invalid/pixel.png" onerror="window.citedRan=1"> <script>window.citedRan=1</script> **not bold** [not a link](https://example.org)'
const CITED_SHA256 = '99cac9c8caff24fdc5a709f8f6bc29c56e7f1cb30678b9385ce02370a8732066'
const CITED_BYTES = 240

/** Where the app's own page keeps the options it was opened with, since its routes move the address on. */
export const CITED_OPTIONS_KEY = 'sophia.fixture.cited-text'

const params = () => new URLSearchParams(window.location.search)
const kept = (): URLSearchParams => new URLSearchParams(sessionStorage.getItem(CITED_OPTIONS_KEY) ?? '')
const asked = (name: string, value: string) => (params().get(name) ?? kept().get(name)) === value
const held = (): boolean => asked('hold', 'cited')

/** A second project text the fixture report lists and never cites (`cites=inputs`): two uncited rows to tell apart. */
export const SECOND_INPUT_TITLE = 'Supplier call notes · labelled fixture'

/** The version's sources, with the project input after the fixture's own when the page cites one, and a second one. */
export function withCitedInput(list: ReportSourceList): ReportSourceList {
  const two = asked('cites', 'inputs')
  if (!asked('cites', 'input') && !two) return list
  const input = {
    sourceId: CITED_INPUT,
    kind: 'input' as const,
    provider: null,
    title: null,
    url: null,
    coverage: null,
    originHttpStatus: null,
    limitations: [],
    mime: 'text/plain; charset=utf-8',
    retrievedAt: null,
  }
  const second = { ...input, sourceId: '00000000-0000-4000-8000-0000000000cf', title: SECOND_INPUT_TITLE }
  return { sources: [...list.sources, input, ...(two ? [second] : [])] }
}

const reads: (() => void)[] = []
let releasedAll = false

/** Lets every held read of the cited text through, and every later one. */
export function releaseCited(): void {
  releasedAll = true
  for (const release of reads.splice(0)) release()
}

/** How many reads of the cited text the page has set out (each opening is one). */
export const citedReads = { count: 0 }

const NOT_FOUND = { code: 'not_found', message: 'Source not found', retry: 'never' }

function answer(): Response {
  if (asked('cited', 'refused')) {
    return new Response(JSON.stringify(NOT_FOUND), { status: 422, headers: { 'content-type': 'application/json' } })
  }
  const content: SourceContent = {
    sourceId: CITED_INPUT,
    sha256: CITED_SHA256,
    mime: 'text/plain; charset=utf-8',
    byteLength: CITED_BYTES,
    filename: 'source-00000000.txt',
    disposition: 'inline',
    text: asked('cited', 'tamper') ? `${CITED_TEXT} ` : CITED_TEXT,
    downloadUrl: null,
    expiresAt: null,
  }
  return new Response(JSON.stringify(content), { headers: { 'content-type': 'application/json' } })
}

/** The answer to a read of a cited text of `report`'s versions, or null when `path` is not one. */
export function citedTextRead(report: string, path: string): Response | Promise<Response> | null {
  const m = new RegExp(`^/api/v1/artifacts/${report}/versions/[0-9a-f-]{36}/sources/([0-9a-f-]{36})/content$`).exec(
    path,
  )
  if (!m) return null
  citedReads.count += 1
  if (m[1] !== CITED_INPUT) {
    return new Response(JSON.stringify(NOT_FOUND), { status: 422, headers: { 'content-type': 'application/json' } })
  }
  if (!held() || releasedAll) return answer()
  return new Promise((resolve) => reads.push(() => resolve(answer())))
}
