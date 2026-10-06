// Following across calls (e2e/room-following-keys.spec.ts; Codex on #130): the stage's own useFollowing over one
// report shown at one revision, with the call it belongs to switched by the page's buttons, as leaving and joining
// again switches it. What each call followed, and whether a Stop following there is still owed its focus, is shown as
// words for the checks to read. Every word is synthetic.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Shown } from '../src/features/voice/present-view.ts'
import { useFollowing } from '../src/features/voice/StagePresent.tsx'
import '../src/app/theme.css'
import { PROJECT } from './data.ts'
import { versions } from './report-data.ts'

const SHOWN: Shown = { version: versions(1)[0] ?? null, guideId: 'fixture-teammate', revision: 7, mine: false }
const CALLS = ['A', 'B', 'C'] as const

function Calls() {
  const [call, setCall] = useState<(typeof CALLS)[number]>('A')
  const followed = useFollowing(SHOWN, `${PROJECT} fixture-viewer ${call}`)
  return (
    <main>
      <p role="status" aria-label="This call">
        {`Call ${call} · ${followed.following ? 'following' : 'not following'}${followed.stopped ? ' · focus owed to Follow' : ''}`}
      </p>
      <button type="button" onClick={followed.follow}>
        Follow
      </button>
      <button type="button" onClick={followed.unfollow}>
        Stop following
      </button>
      {CALLS.map((c) => (
        <button key={c} type="button" onClick={() => setCall(c)}>
          {`Call ${c}`}
        </button>
      ))}
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('following-keys.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no call, no API
    </p>
    <Calls />
  </StrictMode>,
)
