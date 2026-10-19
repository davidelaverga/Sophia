// A new version is said, with Reload (docs/plans/new-version.md): after a deploy a tab left open asks for parts that are
// gone, and Vite says so (`vite:preloadError`, from its preload helper in a build). The notice stays until answered. The
// event is not prevented, so the load that failed still fails as itself, and Reload never runs by itself: that would
// drop a call in progress. The word may come before this is drawn (the signal keeps it), or after it is drawn and
// before its effect listens (the signal tells it as the effect starts listening; #432), and Not now gives the focus
// back to where it was when the notice came, as the toast's acts do (Codex P2s on #415).
import { useEffect, useRef, useState } from 'react'
import type { NewVersionSignal } from './new-version-signal.ts'

export function NewVersion({ signal }: { signal: NewVersionSignal }) {
  const [shown, setShown] = useState(signal.heard)
  const back = useRef<HTMLElement | null>(null)
  useEffect(() => signal.onHeard(() => setShown(true)), [signal])
  useEffect(() => {
    if (shown) back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [shown])
  const notNow = () => {
    if (back.current?.isConnected) back.current.focus()
    setShown(false)
  }
  if (!shown) return null
  return (
    <div className="new-version" role="status">
      <span>Sophia was updated. Reload to keep going.</span>
      <button type="button" className="text-button" onClick={() => window.location.reload()}>
        Reload
      </button>
      <button type="button" className="text-button" onClick={notNow}>
        Not now
      </button>
    </div>
  )
}
