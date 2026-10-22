// A new version, heard from the first moment (docs/plans/new-version.md, Codex P2 on #415). Vite says a part of the
// Studio is gone (`vite:preloadError`) as soon as App's eager imports ask for one, which can be before React draws the
// notice, so the word is kept: `heard()` says it came, `onHeard` hears each one after. A listener that comes after a
// word is told of it as it starts listening, once: the notice reads `heard()` as it is drawn and listens only from its
// effect, and a word between the two would reach no one (Codex P2 on #432). A tab that asks the host for its version
// says the same word (`tell`, version-probe.md), held while a call is on and said once it ends (`holdWhile`; Luis
// 2026-10-22, «Esperar a que termine»): that news can wait, a press that failed can't. Pure over its target, so tested.

export type NewVersionSignal = ReturnType<typeof newVersionSignal>

export function newVersionSignal(target: EventTarget) {
  let heard = false
  const listeners = new Set<() => void>()
  const say = () => {
    heard = true
    for (const listener of listeners) listener()
  }
  const held = { calls: 0, waiting: false }
  target.addEventListener('vite:preloadError', say)
  return {
    heard: () => heard,
    /** The probe's word: said now, or once no call holds it. */
    tell: () => {
      if (held.calls > 0) held.waiting = true
      else say()
    },
    /** A call on holds the probe's word until it ends; returns its end, which counts once. */
    holdWhile: () => {
      held.calls += 1
      let over = false
      return () => {
        if (over) return
        over = true
        held.calls -= 1
        if (held.calls > 0 || !held.waiting) return
        held.waiting = false
        say()
      }
    },
    onHeard: (listener: () => void) => {
      listeners.add(listener)
      if (heard) listener()
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
