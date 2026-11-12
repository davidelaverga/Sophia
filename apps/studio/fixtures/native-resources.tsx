// A51's native resource catalog in the Resources view (INC01-DES-002, e2e/native-resources.spec.ts): the Studio's own
// ProjectShell and ProjectResources over synthetic catalog pages answered in this page. Nothing leaves it: the shell's
// reads are the fixture API's (fixture-api.ts), and the catalog's are answered here, as `case=` says.
// `viewer=luis`: read as Luis, a teammate, not as Davide, who owns three of the six resources.
// `case=`: `complete` (default: six rows, one page), `more` (three, then three more), `empty` (an observed empty
// catalog), `loading` (the first page never answers), `failed` (no reply), `unavailable` (503 projection_unavailable),
// `refused` (`status=401|403|404`, its body never ending), `partial` (the second page fails), `inconsistent` (the second
// page repeats a row), `refused2` (the second page is refused, 404), `renew` (the first token is refused, renewed once,
// then read), `bad` (a row whose owner and reader disagree), `emptyfirst` (a first page with no row that says more
// follows: never an empty catalog), `known-empty` (the incumbent panel with no rows and no catalog, as known data).
// `signin=app`: the app's way to sign in again is given, as SignedIn gives it, and only counted here (`signIns`).
// `window.nativeFixture`: `requests` (each catalog read: its cursor, its token's subject, its project), `hold()` (the
// next read waits) and `release(kind)` (`page1`, `page2`, `all`, `404`), `switchProject()`, `switchAccount()`,
// `signIns` (each press of Sign in again, where `signin=app` gives it).
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { ProjectNativeResource, ProjectNativeResourcePage } from '@sophia/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renewTokensWith } from '../src/api/renew.ts'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectResources } from '../src/features/resources/ProjectResources.tsx'
import { ResourcePanel } from '../src/features/resources/ResourcePanel.tsx'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi } from './fixture-api.ts'
import { SOPHIAS_DESCRIPTION, TITLE } from './report-data.ts'

declare global {
  interface Window {
    nativeFixture?: {
      requests: { after: string | null; subject: string | null; project: string }[]
      hold: () => void
      release: (kind: Release) => void
      switchProject: () => void
      switchAccount: () => void
      signIns: number
    }
  }
}

type Release = 'page1' | 'page2' | 'all' | '404'

installFixtureApi({
  revision: 1,
  exchange: false,
  messages: [],
  reportVersions: 1,
  reportTitle: TITLE,
  waiting: false,
  description: SOPHIAS_DESCRIPTION,
  versionsFail: false,
  sourcesHeld: false,
  textHeld: false,
  textTampered: false,
  work: false,
})

const query = new URLSearchParams(window.location.search)
const CASE = query.get('case') ?? 'complete'
const DAVIDE = '00000000-0000-4000-8000-00000000d001'
const LUIS = '00000000-0000-4000-8000-00000000e001'
const ANA = '00000000-0000-4000-8000-00000000f001'
const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000bb'
const OBSERVED = '2026-11-12T14:00:00.000Z'
const LATER = '2026-11-12T14:01:30.000Z'
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const b64 = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
/** A synthetic token: unsigned, only its subject is read (tokenSubject); no service ever sees it. */
const tokenFor = (sub: string, n = 1) => `${b64({ alg: 'none' })}.${b64({ sub, n })}.synthetic`
const subjectOf = (token: string | null) => {
  try {
    const claims: unknown = JSON.parse(
      atob((token ?? '').split('.')[1]?.replaceAll('-', '+').replaceAll('_', '/') ?? ''),
    )
    const sub: unknown = typeof claims === 'object' && claims !== null ? Reflect.get(claims, 'sub') : null
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}

/** One synthetic row: its owner, and the owner's own recorded facts, given to the reader only when it is theirs. */
interface Row {
  n: number
  tool: 'codex' | 'claude'
  state: ProjectNativeResource['state']
  owner: string
  label: string | null
  member: boolean
  mine: NonNullable<ProjectNativeResource['mine']>
}

const ROWS: Row[] = [
  {
    n: 1,
    tool: 'codex',
    state: 'active',
    owner: DAVIDE,
    label: 'Davide',
    member: true,
    mine: {
      connection: { state: 'linked', expired: false },
      host: {
        state: 'active',
        helloOk: true,
        helloConflict: false,
        lastSeenAt: '2026-11-12T13:56:00.000Z',
        secondsSinceSeen: 240,
      },
      recordedQualification: {
        state: 'current',
        operations: ['create', 'input', 'stop'],
        qualifiedAt: '2026-11-10T09:00:00.000Z',
        expiresAt: null,
      },
    },
  },
  {
    n: 2,
    tool: 'claude',
    state: 'needs_connection',
    owner: DAVIDE,
    label: 'Davide',
    member: true,
    mine: {
      connection: { state: 'linked', expired: true },
      host: null,
      recordedQualification: {
        state: 'stale',
        operations: ['stop'],
        qualifiedAt: '2026-11-01T09:00:00.000Z',
        expiresAt: '2026-12-01T09:00:00.000Z',
      },
    },
  },
  {
    n: 3,
    tool: 'codex',
    state: 'active',
    owner: LUIS,
    label: 'Luis',
    member: true,
    mine: {
      connection: { state: 'linked', expired: false },
      host: { state: 'bound', helloOk: false, helloConflict: true, lastSeenAt: null, secondsSinceSeen: null },
      recordedQualification: { state: 'none', operations: [], qualifiedAt: null, expiresAt: null },
    },
  },
  {
    n: 4,
    tool: 'claude',
    state: 'active',
    owner: ANA,
    label: null,
    member: false,
    mine: {
      connection: null,
      host: null,
      recordedQualification: { state: 'none', operations: [], qualifiedAt: null, expiresAt: null },
    },
  },
  {
    n: 5,
    tool: 'codex',
    state: 'revoked',
    owner: DAVIDE,
    label: 'Davide',
    member: true,
    mine: {
      connection: { state: 'revoked', expired: false },
      host: {
        state: 'bound',
        helloOk: true,
        helloConflict: false,
        lastSeenAt: '2026-11-12T11:00:00.000Z',
        secondsSinceSeen: 10800,
      },
      recordedQualification: {
        state: 'not_applicable',
        operations: ['create', 'stop'],
        qualifiedAt: null,
        expiresAt: null,
      },
    },
  },
  {
    n: 6,
    tool: 'claude',
    state: 'active',
    owner: LUIS,
    label: 'Luis',
    member: true,
    mine: {
      connection: { state: 'pending', expired: false },
      host: null,
      recordedQualification: {
        state: 'expired',
        operations: ['input'],
        qualifiedAt: '2026-10-01T09:00:00.000Z',
        expiresAt: '2026-11-01T09:00:00.000Z',
      },
    },
  },
]

/** A row as the reader may see it: its owner's facts only when the reader is its owner. */
const rowFor = (row: Row, reader: string): ProjectNativeResource => ({
  id: id(row.n),
  tool: row.tool,
  state: row.state,
  owner: { id: row.owner, label: row.label, isYou: row.owner === reader, isMember: row.member },
  mine: row.owner === reader ? row.mine : null,
})

const NOT_REPORTED: ProjectNativeResourcePage['notReported'] = [
  'sessions',
  'assignments',
  'models',
  'efforts',
  'capacity',
  'readiness',
  'signIn',
  'accounts',
]
const pageOf = (rows: Row[], reader: string, next: string | null, at = OBSERVED): ProjectNativeResourcePage => ({
  observedAt: at,
  resources: rows.map((r) => rowFor(r, reader)),
  nextCursor: next,
  complete: next === null,
  notReported: NOT_REPORTED,
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
/** A refusal whose body never ends: the client must refuse it from its status alone. */
const endless = (status: number) => new Response(new ReadableStream({ start() {} }), { status })

/** One catalog read, as a case answers it. */
interface Asked {
  later: boolean
  reader: string
  token: string
  first: ProjectNativeResourcePage
  second: ProjectNativeResourcePage
}

const ok = (page: unknown) => Promise.resolve(json(200, page))

/** Each case's answer to a read: the first page (`later` false) or the next. */
const CASES: Record<string, (a: Asked) => Promise<Response>> = {
  complete: (a) => ok(pageOf(ROWS, a.reader, null)),
  more: (a) => ok(a.later ? a.second : a.first),
  empty: (a) => ok(pageOf([], a.reader, null)),
  emptyfirst: (a) => ok({ ...pageOf([], a.reader, id(9)), complete: false }),
  loading: () => new Promise<Response>(() => undefined),
  failed: () => Promise.reject(new TypeError('Failed to fetch')),
  unavailable: () =>
    Promise.resolve(
      json(503, { code: 'projection_unavailable', message: 'not installed', requestId: id(99), retry: 'never' }),
    ),
  refused: () => Promise.resolve(endless(Number(query.get('status') ?? '404'))),
  partial: (a) => (a.later ? Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })) : ok(a.first)),
  // The second page holds nothing, yet says more follows: a page that doesn't follow (a row past the cursor again, or a
  // cursor not past it, the reader refuses first, as a contract violation).
  inconsistent: (a) => ok(a.later ? { ...pageOf([], a.reader, id(9), LATER), complete: false } : a.first),
  refused2: (a) => (a.later ? Promise.resolve(endless(404)) : ok(a.first)),
  // The first token is refused (401); the one its renewal gives is answered.
  renew: (a) => (renewed.has(a.token) ? ok(pageOf(ROWS, a.reader, null)) : Promise.resolve(endless(401))),
  bad: (a) => ok({ ...a.first, resources: a.first.resources.map((r) => ({ ...r, mine: ROWS[0]?.mine ?? null })) }),
}

/** What a held read is released with. */
const RELEASED: Record<Release, (a: Asked) => Promise<Response>> = {
  page1: (a) => ok(a.first),
  page2: (a) => ok(a.second),
  all: (a) => ok(pageOf(ROWS, a.reader, null)),
  404: () => Promise.resolve(endless(404)),
}

/** What a catalog read is answered with, by the case (or a release), the cursor, the reader and the project. */
function answer(kind: Release | 'case', after: string | null, reader: string, project: string, token: string) {
  if (project === OTHER_PROJECT) return ok(pageOf(ROWS.slice(5, 6), reader, null))
  const asked: Asked = {
    later: after !== null,
    reader,
    token,
    first: pageOf(ROWS.slice(0, 3), reader, id(3)),
    second: pageOf(ROWS.slice(3), reader, null, LATER),
  }
  if (kind !== 'case') return RELEASED[kind](asked)
  return (CASES[CASE] ?? CASES['complete'] ?? (() => ok(pageOf(ROWS, reader, null))))(asked)
}

/** Tokens given by the renewal: answered, where the first was refused (`case=renew`). */
const renewed = new Set<string>()
if (CASE === 'renew') {
  renewTokensWith((stale) => {
    const sub = subjectOf(stale)
    if (!sub) return Promise.resolve(null)
    const fresh = tokenFor(sub, 2)
    renewed.add(fresh)
    return Promise.resolve(fresh)
  })
}

const requests: NonNullable<Window['nativeFixture']>['requests'] = []
let held: ((kind: Release) => void) | null = null
let holdNext = false
const shell = window.fetch
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
  const match = /^\/api\/v1\/projects\/([^/]+)\/native-resources$/.exec(url.pathname)
  if (!match?.[1]) return shell(input, init)
  const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '') ?? ''
  const after = url.searchParams.get('after')
  const reader = subjectOf(token) ?? ''
  const project = decodeURIComponent(match[1])
  requests.push({ after, subject: reader || null, project })
  if (holdNext) {
    holdNext = false
    return new Promise<Response>((resolve) => {
      held = (kind) => void answer(kind, after, reader, project, token).then(resolve)
    })
  }
  return answer('case', after, reader, project, token)
}

const nothing = () => undefined
/** Each press of Sign in again (`signin=app`): counted, as the app's own sign-out would be started. */
let signIns = 0
const signIn =
  query.get('signin') === 'app'
    ? () => {
        signIns += 1
      }
    : undefined
const viewerOf = (luis: boolean) => (luis ? { name: 'Luis', sub: LUIS } : { name: 'Davide', sub: DAVIDE })

function Catalog() {
  const [luis, setLuis] = useState(query.get('viewer') === 'luis')
  const [project, setProject] = useState(PROJECT)
  const viewer = viewerOf(luis)
  useEffect(() => {
    window.nativeFixture = {
      requests,
      hold: () => {
        holdNext = true
      },
      release: (kind) => {
        held?.(kind)
        held = null
      },
      switchProject: () => setProject((p) => (p === PROJECT ? OTHER_PROJECT : PROJECT)),
      switchAccount: () => setLuis((l) => !l),
      get signIns() {
        return signIns
      },
    }
  }, [])
  return (
    <ProjectShell
      projectId={PROJECT}
      view="resources"
      identity={identity}
      account={null}
      onShow={nothing}
      onLeave={nothing}
      onWork={nothing}
      onSignOut={nothing}
      resources={
        CASE === 'known-empty' ? (
          <ResourcePanel resources={[]} observations={[]} actions={[]} viewerId={viewer.sub} now={new Date(OBSERVED)} />
        ) : (
          <ProjectResources
            key={`${viewer.sub}:${project}`}
            projectId={project}
            identity={{ token: tokenFor(viewer.sub) }}
            now={new Date(OBSERVED)}
            onSignIn={signIn}
          />
        )
      }
    />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('native-resources.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — A51 catalog pages answered in this page; no account, host, tool or service read
    </p>
    <QueryClientProvider client={new QueryClient()}>
      <ShortcutScope.Provider value>
        <Catalog />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
