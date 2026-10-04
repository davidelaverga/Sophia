// The opening's fixture page (e2e/opening.spec.ts), served from the Studio's own index.html (vite.fixtures.config.ts),
// so the checks see the real markup, public/entry.css and public/entry.js. The app's part is played here, over ports
// answered in the page: `?code=…` is a sign-in's return (signed in, the opening shows from the first frame);
// without it, a sign-in screen whose button signs in from the page itself; `?code=expired`, a link that fails (back to
// the sign-in). `reads=ms`: Home's own reads take that long. The likeliest projects' reads go to
// /api/v1/projects/:id/…, for the checks to answer and count. `window.openingFixture` keeps when the app began and the
// keys that reached it.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { ProjectList, ProjectSummary } from '@sophia/contracts'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Identity } from '../src/app/dev-identity.ts'
import { begin } from '../src/app/entry.ts'
import { Mark } from '../src/app/Mark.tsx'
import { OpeningPrepares, useOpening } from '../src/app/useOpening.ts'
import '../src/app/theme.css'

declare global {
  interface Window {
    openingFixture?: { startedAt: number; keys: string[] }
  }
}

begin()
const seen = { startedAt: performance.now(), keys: [] as string[] }
window.openingFixture = seen
window.addEventListener('keydown', (event) => seen.keys.push(event.key))

const query = new URLSearchParams(window.location.search)
const READS_MS = Number(query.get('reads') ?? 300)
const identity: Identity = { name: 'fixture@sophia.test', role: 'member', token: 'fixture-token' }
const client = new QueryClient()

const project = (projectId: string, title: string, startsIn: number | null = null): ProjectSummary => ({
  projectId,
  title,
  role: 'editor',
  members: 2,
  room: null,
  nextSession:
    startsIn === null
      ? null
      : {
          id: `session-${projectId}`,
          title: 'Standup',
          startsAt: new Date(Date.now() + startsIn * 60_000).toISOString(),
          endsAt: new Date(Date.now() + (startsIn + 30) * 60_000).toISOString(),
          timeZone: 'UTC',
        },
  releases: [],
})
const PROJECTS: ProjectList = {
  personalEpoch: 0,
  projects: [
    project('00000000-0000-4000-8000-000000000001', 'Launch plan'),
    project('00000000-0000-4000-8000-000000000002', 'Research notes'),
    project('00000000-0000-4000-8000-000000000003', 'Design review'),
    // Its session starts in ten minutes: Work shows it first, so it is warmed first.
    project('00000000-0000-4000-8000-000000000004', 'Weekly standup', 10),
  ],
}

const later = <T,>(value: T) => new Promise<T>((done) => setTimeout(() => done(value), READS_MS))

/** Home, as far as the opening knows it: its two own reads and the bar's corner lockup it lands in. */
function Home() {
  useQuery({ queryKey: ['personal', identity.name], queryFn: () => later({}) })
  useQuery({ queryKey: ['projects', identity.name], queryFn: () => later(PROJECTS) })
  return (
    <header className="topbar">
      <span className="mark">
        <Mark />
        <span className="mark-word">Sophia</span>
      </span>
      <h1>Home</h1>
      <button type="button" onClick={() => seen.keys.push('pressed Account')}>
        Account
      </button>
    </header>
  )
}

function App() {
  const [signedIn, setSignedIn] = useState(query.has('code') && query.get('code') !== 'expired')
  const status = signedIn ? 'signed_in' : 'signed_out'
  useOpening(status, signedIn)
  if (!signedIn) {
    return (
      <main>
        <h1>Sign in to Sophia</h1>
        <button type="button" onClick={() => setSignedIn(true)}>
          Sign in here
        </button>
      </main>
    )
  }
  return (
    <QueryClientProvider client={client}>
      <OpeningPrepares identity={identity} />
      <Home />
    </QueryClientProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('index.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — the opening, no account
    </p>
    <App />
  </StrictMode>,
)
