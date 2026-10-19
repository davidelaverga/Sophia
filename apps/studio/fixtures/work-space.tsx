// Work's own list (WorkSpace) on its own page (e2e/archive-project.spec.ts): two active projects and, with
// `archived=1`, one archived (archive-project.md), handed as Places hands them: the archived list read and Unarchive
// written by the Studio's own hooks (Archive.tsx), over the API answered here, in the page. What its presses ask is
// recorded in `window.workSpaceFixture`: `opened` and `unarchived` list project ids, `keys` each Unarchive's
// Idempotency-Key. `role=editor`: the archived one is not theirs to bring back. `unarchive=lost`: the first Unarchive
// lands and its reply never comes, as one whose answer is lost on the way back.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ProjectSummary } from '@sophia/contracts'
import { retryRead } from '../src/app/account-cache.ts'
import { useArchivedProjects, useUnarchive } from '../src/features/studio/Archive.tsx'
import { WorkSpace } from '../src/features/personal/WorkSpace.tsx'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'
import { bootTheme } from '../src/app/theme.ts'

declare global {
  interface Window {
    workSpaceFixture?: { opened: string[]; unarchived: string[]; keys: string[] }
  }
}

const query = new URLSearchParams(window.location.search)
bootTheme(query.get('theme'))
const recorded = { opened: [] as string[], unarchived: [] as string[], keys: [] as string[] }
window.workSpaceFixture = recorded
/** Whom the page reads and writes as: an account of the Studio's, its token unsigned. */
const IDENTITY = { name: 'fixture-account', role: 'admin', token: 'fixture' }

const project = (n: number, title: string, role: ProjectSummary['role'] = 'admin'): ProjectSummary => ({
  projectId: `00000000-0000-4000-8000-00000000c00${String(n)}`,
  title,
  role,
  members: 3,
  room: null,
  nextSession: null,
  releases: [],
})
const active = [project(1, 'Launch plan'), project(2, 'Research notes')]
/** The archived list as the API holds it: a project brought back leaves it. */
let archived = query.has('archived')
  ? [project(3, 'Old pilot', query.get('role') === 'editor' ? 'editor' : 'admin')]
  : []

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const ARCHIVE = /^\/api\/v1\/projects\/([^/]+)\/archive$/

/** An Unarchive (A30): recorded with its key, and the project leaves the archived list. */
function unarchived(projectId: string, init: RequestInit | undefined): Promise<Response> {
  recorded.unarchived.push(projectId)
  recorded.keys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
  archived = archived.filter((p) => p.projectId !== projectId)
  if (query.get('unarchive') === 'lost' && recorded.keys.length === 1) {
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  return Promise.resolve(json({ projectId, archived: false, cursor: '1' }))
}

const real = window.fetch.bind(window)
window.fetch = (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const { pathname } = new URL(href, window.location.href)
  if (pathname === '/api/v1/projects/archived') return Promise.resolve(json({ projects: archived, personalEpoch: 1 }))
  const archive = ARCHIVE.exec(pathname)?.[1]
  if (archive && init?.method === 'POST') return unarchived(archive, init)
  return real(input, init)
}

function Page() {
  const projects = useArchivedProjects(IDENTITY)
  const unarchive = useUnarchive(IDENTITY)
  return (
    <div className="places" data-place="work">
      <WorkSpace
        hidden={false}
        token="fixture"
        projects={active}
        // As Places' Work hands it (its failure is a toast there, which this page has not).
        archived={{ projects, onUnarchive: (id) => void unarchive(id).catch(() => undefined) }}
        read={{ state: 'ready', failed: '', retry: () => undefined }}
        fresh={new Set()}
        inCallProject={null}
        personalLock={null}
        newProject={{ open: false, set: () => undefined }}
        actions={{
          open: (id) => recorded.opened.push(id),
          join: () => undefined,
          leaveRoom: () => undefined,
          takeBack: () => undefined,
          takingBack: () => false,
          cross: () => undefined,
        }}
      />
    </div>
  )
}

/** The account's cache, asked again as the app's is (account-cache.ts): a read refused for good isn't asked again. */
const client = new QueryClient({ defaultOptions: { queries: { retry: retryRead } } })

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>
    </StrictMode>,
  )
}
