// A word between the notice's drawing and its listening (e2e/new-version.spec.ts; Codex P2 on #432): the notice over
// its own ear, and after it in the tree a part whose word that it is gone comes as React commits. The notice has read
// the signal by then, and its effect has not listened yet, as an eager import's failed preload can fall in the app's
// first render. Nothing loads; the word is synthetic.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { NewVersion } from '../src/app/NewVersion.tsx'
import { newVersionSignal } from '../src/app/new-version-signal.ts'
import '../src/app/theme.css'

const ear = new EventTarget()
const signal = newVersionSignal(ear)

/** Layout effects run before any passive one, so this word falls after the notice's render and before it listens. */
function GoneAsCommitted() {
  useLayoutEffect(() => {
    ear.dispatchEvent(new Event('vite:preloadError'))
  }, [])
  return null
}

const root = document.getElementById('root')
if (!root) throw new Error('new-version.html must contain #root')

// No StrictMode, as a build runs: its second run of the effects would say the word again around the notice's listening.
createRoot(root).render(
  <>
    <p className="fixture-label" role="note">
      Simulated — a part gone as the page is first drawn, nothing loads
    </p>
    <NewVersion signal={signal} />
    <GoneAsCommitted />
  </>,
)
