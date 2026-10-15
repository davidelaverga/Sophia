// Work's own list (WorkSpace) on its own page (e2e/archive-project.spec.ts): two active projects and, with
// `archived=1`, one archived (archive-project.md), as Places hands them. What its presses ask is recorded in
// `window.workSpaceFixture`: `opened` and `unarchived` list project ids. `role=editor`: the archived one is not theirs to
// bring back.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ProjectSummary } from '@sophia/contracts'
import { WorkSpace } from '../src/features/personal/WorkSpace.tsx'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'
import { bootTheme } from '../src/app/theme.ts'

declare global {
  interface Window {
    workSpaceFixture?: { opened: string[]; unarchived: string[] }
  }
}

const query = new URLSearchParams(window.location.search)
bootTheme(query.get('theme'))
const recorded = { opened: [] as string[], unarchived: [] as string[] }
window.workSpaceFixture = recorded

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
const archived = query.has('archived')
  ? [project(3, 'Old pilot', query.get('role') === 'editor' ? 'editor' : 'admin')]
  : []

function Page() {
  return (
    <div className="places" data-place="work">
      <WorkSpace
        hidden={false}
        token="fixture"
        projects={active}
        archived={{ projects: archived, onUnarchive: (id) => recorded.unarchived.push(id) }}
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

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  )
}
