// A turn shown in the personal space (Conversation.tsx marks each `.msg` with its turn's id): resolves true when the
// named turn is in the document, drawn (not under a hidden place) and in sight (within its log's scrollport and the
// window: a turn below the fold is brought into sight first), watching it come for a bounded while, false when it does
// not (the space failed to read, or the turn is not in it). Home marks a reply seen only then (useNeeds, Codex on #245).
export const TURN_WAIT_MS = 20_000

/** The turn, in the document and drawn: a space kept mounted under a hidden place (PersonalSpace) has it and shows nothing. */
const drawnTurn = (turnId: string): HTMLElement | null => {
  const turn = document.querySelector<HTMLElement>(`.msg[data-turn="${CSS.escape(turnId)}"]`)
  return turn !== null && turn.getClientRects().length > 0 ? turn : null
}

/** In sight: its box meets its log's (`.msgs`, the scrollport) and the window's. */
function inSight(turn: HTMLElement): boolean {
  const r = turn.getBoundingClientRect()
  const log = turn.closest('.msgs')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
  return Math.min(r.bottom, log.bottom, window.innerHeight) > Math.max(r.top, log.top, 0)
}

/**
 * Drawn and in sight. A drawn turn below the fold (a scroll position kept above it, a reply left under «Sophia
 * answered») is brought into sight at once (no smooth scroll: the measure follows): seen means seen (Codex on #245).
 */
export const turnIsShown = (turnId: string): boolean => {
  const turn = drawnTurn(turnId)
  if (!turn) return false
  if (!inSight(turn)) turn.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  return inSight(turn)
}

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
