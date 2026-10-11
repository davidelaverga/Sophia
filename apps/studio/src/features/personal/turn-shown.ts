// A turn shown in the personal space (Conversation.tsx marks each `.msg` with its turn's id): resolves true when the
// named turn is in the document, watching it come for a bounded while, false when it does not (the space failed to
// read, or the turn is not in it). Home marks a reply seen only then (useNeeds, Codex on #245).
export const TURN_WAIT_MS = 20_000

export const turnIsShown = (turnId: string): boolean =>
  document.querySelector(`.msg[data-turn="${CSS.escape(turnId)}"]`) !== null

export function turnShown(turnId: string, within = TURN_WAIT_MS): Promise<boolean> {
  if (turnIsShown(turnId)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (shown: boolean) => {
      watcher.disconnect()
      clearTimeout(timer)
      resolve(shown)
    }
    const watcher = new MutationObserver(() => {
      if (turnIsShown(turnId)) done(true)
    })
    const timer = setTimeout(() => done(false), within)
    watcher.observe(document.body, { childList: true, subtree: true })
  })
}
