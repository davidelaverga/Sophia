// The Studio app's fixture page (e2e/app-auth.spec.ts), served from the Studio's own index.html by its own server
// (vite.app.config.ts), whose Supabase Auth is a synthetic one the checks answer in the page. Only the entry is this
// file, as src/main.tsx is: App, its sign-in (auth.ts) and the Supabase client are the Studio's own, unchanged.
// `work=lost` (kept in the tab, as the app moves to its own addresses): the API is the fixture's, in the page
// (fixture-api.ts), with one project whose goal offers Review sources, and the first proposal's reply lost after it
// arrives (the next is answered). The synthetic Auth service's requests still leave the page, to the checks' answers.
// `appFixture` says what the API was asked, across a reload too: each proposal sent (its key and its body), each
// request with the account its token names, and any request the fixture did not expect. `appFixture.hold(by, path)`
// holds that account's requests for that path until `release()`, as a slow API's answer is. `attention=a34` (kept in
// the tab too): Updates' «since» and «seen» are A34's, strict and each account's own (attention-data.ts), and
// `appFixture.attention` says what they were asked. `projects=two` (kept in the tab too): Work's list holds Research
// notes after the fixture project, so a call can be left by opening another (call-ends-on-open.md).
// `appFixture.expireToken()`: every token the API has seen is refused from now on, as the API refuses an expired one
// (a 401), until the page sends another; `refuseTokens()` refuses every token, new ones too; `dropStream()` ends the
// feed's stream; `refused` says each request refused so, and `keys` each request's Idempotency-Key
// (auth-session-renewal.md).
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../src/app/App.tsx'
import { SkipLink } from '../src/app/SkipLink.tsx'
import { begin } from '../src/app/entry.ts'
import '../src/app/theme.css'
import { conversations, conversationMission, messagesOf } from './conversation-data.ts'
import { attentionAnswer } from './attention-data.ts'
import { dropStream, installFixtureApi, unexpected } from './fixture-api.ts'
import { SOPHIAS_DESCRIPTION, TITLE } from './report-data.ts'
import { SOURCE_REVIEW } from './source-review-data.ts'
import { goal } from './work-data.ts'
import { bootTheme } from '../src/app/theme.ts'

declare global {
  interface Window {
    appFixture?: {
      proposals: readonly { key: string; body: unknown }[]
      /** Each API request, as `METHOD /path by <the subject its token names, or nobody>`. */
      asked: readonly string[]
      unexpected: readonly string[]
      /** A34's reads and seen marks answered (`attention=a34`), as `since by <subject>` and `seen <sequence> by …`. */
      attention: readonly string[]
      hold: (by: string, path: string, method?: string) => void
      release: () => void
      expireToken: () => void
      refuseTokens: () => void
      dropStream: () => void
      /**
       * The call's connection is lost, as LiveKit reports it (fake-livekit.ts, loaded only now: a page at rest loads no
       * LiveKit, fake or not).
       */
      drop: () => void
      /** Each request refused for its token (`expireToken`, `refuseTokens`), as `METHOD /path`. */
      refused: readonly string[]
      /** Each request with an Idempotency-Key, refused or not, as `METHOD /path key`. */
      keys: readonly string[]
    }
  }
}

const WORK_KEY = 'fixture.app.work'
const ATTENTION_KEY = 'fixture.app.attention'
const SENT_KEY = 'fixture.app.proposals'
const ASKED_KEY = 'fixture.app.asked'
const UNEXPECTED_KEY = 'fixture.app.unexpected'
const PROJECTS_KEY = 'fixture.app.projects'
/** The project the fixture serves (data.ts's PROJECT), and `projects=two`'s second, which reads as it does. */
const FIRST_BASE = '/api/v1/projects/00000000-0000-4000-8000-0000000000aa'
const SECOND = { projectId: '00000000-0000-4000-8000-00000000009a', title: 'Research notes' }
const SECOND_BASE = `/api/v1/projects/${SECOND.projectId}`

/** What the fixture's service was told before a reload of the tab, under `key`: it remembers. */
function before(key: string): unknown[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(kept) ? kept : []
  } catch {
    return []
  }
}

/**
 * What leaves the page for the host itself, as the checks answer it: the synthetic Auth service, and the version a tab
 * asks for (version-probe.md), which is the host's, not the API's.
 */
const leavesThePage = (pathname: string) => pathname.startsWith('/synthetic-auth/') || pathname === '/version.json'

/** A request's bearer token, as the API reads it. */
const tokenOf = (headers: Headers) => /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1] ?? null

/** The account a request's bearer token names (its `sub`), unverified: the fixture signs nothing. */
function subjectOf(headers: Headers): string {
  const payload = tokenOf(headers)?.split('.')[1]
  try {
    const claims: unknown = payload ? JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) : null
    const sub: unknown = typeof claims === 'object' && claims !== null ? Reflect.get(claims, 'sub') : null
    return typeof sub === 'string' ? sub : 'nobody'
  } catch {
    return 'nobody'
  }
}

/** A request's address and path, its method and the account its token names, whatever form fetch was called with. */
function described(input: RequestInfo | URL, init?: RequestInit) {
  const given = input instanceof Request ? input : null
  const href = input instanceof Request ? input.url : input instanceof URL ? input.href : input
  const url = new URL(href, window.location.href)
  const headers = new Headers(init?.headers ?? given?.headers)
  return {
    url,
    pathname: url.pathname,
    method: (init?.method ?? given?.method ?? 'GET').toUpperCase(),
    by: subjectOf(headers),
    token: tokenOf(headers),
    key: headers.get('idempotency-key'),
  }
}

/** The API's answer to a token it no longer takes: expired, or never valid (actor_context_required). */
const tokenRefused = () =>
  new Response(
    JSON.stringify({
      code: 'actor_context_required',
      message: 'Invalid or expired token',
      requestId: '00000000-0000-4000-8000-0000000000bd',
      retry: 'reauthorize',
    }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

/** The proposals the fixture's service was sent before a reload of the tab. */
const sentBefore = (): { key: string; body: unknown }[] =>
  before(SENT_KEY).flatMap((p: unknown) =>
    typeof p === 'object' && p !== null && typeof Reflect.get(p, 'key') === 'string'
      ? [{ key: String(Reflect.get(p, 'key')), body: Reflect.get(p, 'body') as unknown }]
      : [],
  )

const jsonOf = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** The contracts' validators, imported only once `projects=two` reads: a page at rest never asks for them. */
const validators = () => import('@sophia/contracts/validate')

/** The fixture's list with Research notes after its project, shaped as the project is. */
async function listedWithSecond(answer: Response): Promise<Response> {
  if (!answer.ok) return answer
  const { parseProjectList } = await validators()
  const list = parseProjectList(await answer.json())
  const first = list.projects[0]
  return jsonOf({
    ...list,
    projects: first ? [...list.projects, { ...first, ...SECOND, releases: [] }] : list.projects,
  })
}

/**
 * `projects=two`: the fixture serves one project, so the second's reads are answered as the first's, its snapshot under
 * its own id and title. Under the page's own fetch, so what the page asked names the second project.
 */
function withSecondProject(): void {
  const fixture = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, pathname, method } = described(input, init)
    if (method === 'GET' && pathname === '/api/v1/projects') return listedWithSecond(await fixture(input, init))
    if (!pathname.startsWith(`${SECOND_BASE}/`)) return fixture(input, init)
    url.pathname = pathname.replace(SECOND_BASE, FIRST_BASE)
    const answer = await fixture(input instanceof Request ? new Request(url, input) : url.href, init)
    if (!pathname.endsWith('/snapshot') || !answer.ok) return answer
    const { parseSnapshot } = await validators()
    return jsonOf({ ...parseSnapshot(await answer.json()), ...SECOND })
  }
}

// This page's browser recognises no speech on the device, as the other fixture pages give theirs a labelled one: the
// headless shell CI runs has none, and asked (Home's dictation, signed in) it ends the page's renderer.
Reflect.set(globalThis, 'SpeechRecognition', undefined)

bootTheme(new URLSearchParams(window.location.search).get('theme'))
if (new URLSearchParams(window.location.search).get('work') === 'lost') sessionStorage.setItem(WORK_KEY, 'lost')
if (new URLSearchParams(window.location.search).get('attention') === 'a34') sessionStorage.setItem(ATTENTION_KEY, 'a34')
if (new URLSearchParams(window.location.search).get('projects') === 'two') sessionStorage.setItem(PROJECTS_KEY, 'two')
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
  if (sessionStorage.getItem(PROJECTS_KEY) === 'two') withSecondProject()
  const fixture = window.fetch
  const a34 = sessionStorage.getItem(ATTENTION_KEY) === 'a34'
  const marks = new Map<string, string | null>()
  const attention: string[] = []
  let held: { by: string; path: string; method?: string; waiting: (() => void)[] } | null = null
  const tokens = { seen: new Set<string>(), expired: new Set<string>(), refuseAll: false }
  const refused: string[] = []
  const keys: string[] = []
  /** The API's 401 to this request's token once it no longer takes it (`expireToken`, `refuseTokens`), else null. */
  const tokenAnswer = ({ method, pathname, token, key }: ReturnType<typeof described>): Response | null => {
    if (key) keys.push(`${method} ${pathname} ${key}`)
    if (!token) return null
    if (!tokens.refuseAll && !tokens.expired.has(token)) {
      tokens.seen.add(token)
      return null
    }
    refused.push(`${method} ${pathname}`)
    return tokenRefused()
  }
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = described(input, init)
    const { pathname, method, by } = request
    if (leavesThePage(pathname)) return network(input, init)
    asked.push(`${method} ${pathname} by ${by}`)
    const refusal = tokenAnswer(request)
    if (refusal) return Promise.resolve(refusal)
    const body = init?.body ?? null
    const served = a34 ? attentionAnswer(marks, (s) => attention.push(s), { pathname, method, by, body }) : undefined
    if (served) return Promise.resolve(served)
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
    attention,
    hold: (by, path, method?) => {
      held = method ? { by, path, method, waiting: [] } : { by, path, waiting: [] }
    },
    release: () => {
      const waiting = held?.waiting ?? []
      held = null
      for (const go of waiting) go()
    },
    expireToken: () => {
      for (const token of tokens.seen) tokens.expired.add(token)
    },
    refuseTokens: () => {
      tokens.refuseAll = true
    },
    dropStream,
    drop: () => void import('./fake-livekit.ts').then((room) => room.dropCall()),
    refused,
    keys,
  }
}

begin()

const root = document.getElementById('root')
if (!root) throw new Error('index.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <SkipLink />
    <p className="fixture-label" role="note">
      Simulated — the Studio app, signed in by a synthetic Auth service, no account
    </p>
    <App />
  </StrictMode>,
)
