// A new version is said, with Reload (docs/plans/new-version.md): after a deploy a tab left open asks for parts that are
// gone, and Vite says so (`vite:preloadError`, from its preload helper in a build). The notice stays until answered. The
// event is not prevented, so the load that failed still fails as itself, and Reload never runs by itself: that would
// drop a call in progress.
import { useEffect, useState } from 'react'

export function NewVersion() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const said = () => setShown(true)
    window.addEventListener('vite:preloadError', said)
    return () => window.removeEventListener('vite:preloadError', said)
  }, [])
  if (!shown) return null
  return (
    <div className="new-version" role="status">
      <span>Sophia was updated. Reload to keep going.</span>
      <button type="button" className="text-button" onClick={() => window.location.reload()}>
        Reload
      </button>
      <button type="button" className="text-button" onClick={() => setShown(false)}>
        Not now
      </button>
    </div>
  )
}
