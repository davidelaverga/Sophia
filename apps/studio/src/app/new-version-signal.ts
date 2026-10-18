// A new version, heard from the first moment (docs/plans/new-version.md, Codex P2 on #415). Vite says a part of the
// Studio is gone (`vite:preloadError`) as soon as App's eager imports ask for one, which can be before React draws the
// notice, so the word is kept: `heard()` says it came, `onHeard` hears each one after. Pure over its target, so tested.

export type NewVersionSignal = ReturnType<typeof newVersionSignal>

export function newVersionSignal(target: EventTarget) {
  let heard = false
  const listeners = new Set<() => void>()
  target.addEventListener('vite:preloadError', () => {
    heard = true
    for (const listener of listeners) listener()
  })
  return {
    heard: () => heard,
    onHeard: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
