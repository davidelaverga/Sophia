// The resource panel's fixture page (e2e/resources.spec.ts): the real ResourcePanel over labelled simulated data. It
// has no port that acts, and any request it makes is recorded as unexpected: showing resources calls nothing. The query
// string picks who is looking: `viewer=davide` (default: Luis).
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ResourcePanel } from '../src/features/resources/ResourcePanel.tsx'
import '../src/app/theme.css'
import { actions, NOW, observations, people, resources } from './resources-data.ts'

declare global {
  interface Window {
    resourcesFixture?: { unexpected: readonly string[] }
  }
}

const unexpected: string[] = []
window.resourcesFixture = { unexpected }
window.fetch = (input: RequestInfo | URL) => {
  unexpected.push(input instanceof Request ? input.url : input instanceof URL ? input.href : input)
  return Promise.reject(new Error('the resource panel calls nothing'))
}

const viewer = new URLSearchParams(window.location.search).get('viewer') === 'davide' ? people.davide : people.luis

const root = document.getElementById('root')
if (!root) throw new Error('resources.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no tool, host or account read · viewing as {viewer.name}
    </p>
    <main className="fixture-resources">
      <ResourcePanel
        resources={resources}
        observations={observations}
        actions={actions}
        viewerId={viewer.id}
        now={NOW}
      />
    </main>
  </StrictMode>,
)
