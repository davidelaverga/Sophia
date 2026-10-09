// The Studio app's fixture page (e2e/app-auth.spec.ts), served from the Studio's own index.html by its own server
// (vite.app.config.ts), whose Supabase Auth is a synthetic one the checks answer in the page. Only the entry is this
// file, as src/main.tsx is: App, its sign-in (auth.ts) and the Supabase client are the Studio's own, unchanged.
// `work=lost` (kept in the tab, as the app moves to its own addresses): the API is the fixture's, in the page
// (fixture-api.ts), with one project whose goal offers Review sources, and the first proposal's reply lost after it
// arrives (the next is answered). The synthetic Auth service's requests still leave the page, to the checks' answers.
// `appFixture` says what the API was asked, across a reload too: each proposal sent (its key and its body), each
// request with the account its token names, and any request the fixture did not expect.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../src/app/App.tsx'
import { begin } from '../src/app/entry.ts'
import '../src/app/theme.css'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import { SOPHIAS_DESCRIPTION, TITLE } from './report-data.ts'
import { SOURCE_REVIEW } from './source-review-data.ts'
import { goal } from './work-data.ts'

declare global {
  interface Window {
    appFixture?: {
      proposals: readonly { key: string; body: unknown }[]
      /** Each API request, as `METHOD /path by <the subject its token names, or nobody>`. */
      asked: readonly string[]
      unexpected: readonly string[]
    }
  }
}

const WORK_KEY = 'fixture.app.work'
const SENT_KEY = 'fixture.app.proposals'
const ASKED_KEY = 'fixture.app.asked'
const UNEXPECTED_KEY = 'fixture.app.unexpected'

/** What the fixture's service was told before a reload of the tab, under `key`: it remembers. */
function before(key: string): unknown[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(kept) ? kept : []
  } catch {
    return []
  }
}

/** The account a request's bearer token names (its `sub`), unverified: the fixture signs nothing. */
function subjectOf(headers: Headers): string {
  const payload = headers.get('authorization')?.split('.')[1]
  try {
    const claims: unknown = payload ? JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) : null
    const sub: unknown = typeof claims === 'object' && claims !== null ? Reflect.get(claims, 'sub') : null
    return typeof sub === 'string' ? sub : 'nobody'
  } catch {
    return 'nobody'
  }
}

/** The proposals the fixture's service was sent before a reload of the tab. */
const sentBefore = (): { key: string; body: unknown }[] =>
  before(SENT_KEY).flatMap((p: unknown) =>
    typeof p === 'object' && p !== null && typeof Reflect.get(p, 'key') === 'string'
      ? [{ key: String(Reflect.get(p, 'key')), body: Reflect.get(p, 'body') as unknown }]
      : [],
  )

// This page's browser recognises no speech on the device, as the other fixture pages give theirs a labelled one: the
// headless shell CI runs has none, and asked (Home's dictation, signed in) it ends the page's renderer.
Reflect.set(globalThis, 'SpeechRecognition', undefined)

if (new URLSearchParams(window.location.search).get('work') === 'lost') sessionStorage.setItem(WORK_KEY, 'lost')
if (sessionStorage.getItem(WORK_KEY) === 'lost') {
  const proposals = { lose: 1, how: 'lost' as const, sent: sentBefore(), held: [] }
  const asked = before(ASKED_KEY).map(String)
  const unexpectedBefore = before(UNEXPECTED_KEY).map(String)
  addEventListener('pagehide', () => {
    sessionStorage.setItem(SENT_KEY, JSON.stringify(proposals.sent))
    sessionStorage.setItem(ASKED_KEY, JSON.stringify(asked))
    sessionStorage.setItem(UNEXPECTED_KEY, JSON.stringify([...unexpectedBefore, ...unexpected]))
  })
  const network = window.fetch.bind(window)
  installFixtureApi({
    revision: 1,
    exchange: false,
    messages: [],
    goals: [goal],
    reportVersions: 1,
    reportTitle: TITLE,
    waiting: false,
    description: SOPHIAS_DESCRIPTION,
    versionsFail: false,
    sourcesHeld: false,
    textHeld: false,
    textTampered: false,
    work: false,
    review: SOURCE_REVIEW,
    proposals,
  })
  const fixture = window.fetch
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const given = input instanceof Request ? input : null
    const href = input instanceof Request ? input.url : input instanceof URL ? input.href : input
    const { pathname } = new URL(href, window.location.href)
    if (pathname.startsWith('/synthetic-auth/')) return network(input, init)
    const method = (init?.method ?? given?.method ?? 'GET').toUpperCase()
    asked.push(`${method} ${pathname} by ${subjectOf(new Headers(init?.headers ?? given?.headers))}`)
    return fixture(input, init)
  }
  window.appFixture = {
    proposals: proposals.sent,
    asked,
    get unexpected() {
      return [...unexpectedBefore, ...unexpected]
    },
  }
}

begin()

const root = document.getElementById('root')
if (!root) throw new Error('index.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — the Studio app, signed in by a synthetic Auth service, no account
    </p>
    <App />
  </StrictMode>,
)
