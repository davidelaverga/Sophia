// The Studio app's fixture page (e2e/app-auth.spec.ts), served from the Studio's own index.html by its own server
// (vite.app.config.ts), whose Supabase Auth is a synthetic one the checks answer in the page. Only the entry is this
// file, as src/main.tsx is: App, its sign-in (auth.ts) and the Supabase client are the Studio's own, unchanged.
// `work=lost` (kept in the tab, as the app moves to its own addresses): the API is the fixture's, in the page
// (fixture-api.ts), with one project whose goal offers Review sources, and the first proposal's reply lost after it
// arrives (the next is answered). The synthetic Auth service's requests still leave the page, to the checks' answers.
// `appFixture` says what the API was asked, across a reload too: each proposal sent (its key and its body), each
// request with the account its token names, and any request the fixture did not expect. `appFixture.hold(by, path)`
// holds that account's requests for that path until `release()`, as a slow API's answer is.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../src/app/App.tsx'
import { begin } from '../src/app/entry.ts'
import '../src/app/theme.css'
import { conversations, conversationMission, messagesOf } from './conversation-data.ts'
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
      hold: (by: string, path: string, method?: string) => void
      release: () => void
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

/** A request's path, its method and the account its token names, whatever form fetch was called with. */
function described(input: RequestInfo | URL, init?: RequestInit) {
  const given = input instanceof Request ? input : null
  const href = input instanceof Request ? input.url : input instanceof URL ? input.href : input
  return {
    pathname: new URL(href, window.location.href).pathname,
    method: (init?.method ?? given?.method ?? 'GET').toUpperCase(),
    by: subjectOf(new Headers(init?.headers ?? given?.headers)),
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
    conversations: {
      list: conversations(),
      messages: messagesOf(),
      failList: false,
      lastShown: false,
      failMessagesOf: null,
      send: null,
      start: null,
      answerMs: 900,
      withdraw: null,
      erase: null,
      receipts: new Map(),
    },
    missionPlus: conversationMission(),
  })
  const fixture = window.fetch
  let held: { by: string; path: string; method?: string; waiting: (() => void)[] } | null = null
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname, method, by } = described(input, init)
    if (pathname.startsWith('/synthetic-auth/')) return network(input, init)
    asked.push(`${method} ${pathname} by ${by}`)
    const holding = held
    if (holding?.by === by && holding.path === pathname && (!holding.method || holding.method === method)) {
      return new Promise<Response>((answer) => holding.waiting.push(() => void fixture(input, init).then(answer)))
    }
    return fixture(input, init)
  }
  window.appFixture = {
    proposals: proposals.sent,
    asked,
    get unexpected() {
      return [...unexpectedBefore, ...unexpected]
    },
    hold: (by, path, method?) => {
      held = method ? { by, path, method, waiting: [] } : { by, path, waiting: [] }
    },
    release: () => {
      const waiting = held?.waiting ?? []
      held = null
      for (const go of waiting) go()
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
