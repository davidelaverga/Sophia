// A new version, heard from the first moment (docs/plans/new-version.md, Codex P2 on #415). Vite says a part of the
// Studio is gone (`vite:preloadError`) as soon as App's eager imports ask for one, which can be before React draws the
// notice, so the word is kept: `heard()` says it came, `onHeard` hears each one after. A listener that comes after a
// word is told of it as it starts listening, once: the notice reads `heard()` as it is drawn and listens only from its
// effect, and a word between the two would reach no one (Codex P2 on #432). Pure over its target, so tested.

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
      if (heard) listener()
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
