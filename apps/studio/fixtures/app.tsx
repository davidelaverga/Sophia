// The Studio app's fixture page (e2e/app-auth.spec.ts), served from the Studio's own index.html by its own server
// (vite.app.config.ts), whose Supabase Auth is a synthetic one the checks answer in the page. Only the entry is this
// file, as src/main.tsx is: App, its sign-in (auth.ts) and the Supabase client are the Studio's own, unchanged.
// `work=lost` (kept in the tab, as the app moves to its own addresses): the API is the fixture's, in the page
// (fixture-api.ts), with one project whose goal offers Review sources, and the first proposal's reply lost after it
// arrives (the next is answered). `appFixture.proposals` lists each one sent, with its key and its body, across a reload.
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
    appFixture?: { proposals: readonly { key: string; body: unknown }[]; unexpected: readonly string[] }
  }
}

const WORK_KEY = 'fixture.app.work'
const SENT_KEY = 'fixture.app.proposals'

/** The proposals the fixture's service was sent before a reload of the tab: it remembers what it was sent. */
function sentBefore(): { key: string; body: unknown }[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? '[]')
    return Array.isArray(kept)
      ? kept.flatMap((p: unknown) =>
          typeof p === 'object' && p !== null && typeof Reflect.get(p, 'key') === 'string'
            ? [{ key: String(Reflect.get(p, 'key')), body: Reflect.get(p, 'body') as unknown }]
            : [],
        )
      : []
  } catch {
    return []
  }
}

if (new URLSearchParams(window.location.search).get('work') === 'lost') sessionStorage.setItem(WORK_KEY, 'lost')
if (sessionStorage.getItem(WORK_KEY) === 'lost') {
  const proposals = { lose: 1, how: 'lost' as const, sent: sentBefore(), held: [] }
  addEventListener('pagehide', () => sessionStorage.setItem(SENT_KEY, JSON.stringify(proposals.sent)))
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
  window.appFixture = { proposals: proposals.sent, unexpected }
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
