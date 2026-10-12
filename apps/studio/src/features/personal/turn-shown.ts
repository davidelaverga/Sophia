// A turn shown in the personal space (Conversation.tsx marks each `.msg` with its turn's id): resolves true when the
// named turn is in the document, drawn (not under a hidden place) and in sight (within its log's scrollport and the
// window: a turn below the fold is brought into sight first), watching it come for a bounded while, false when it does
// not (the space failed to read, or the turn is not in it). Home marks a reply seen only then (useNeeds, Codex on #245).
import { READ_TIMEOUT_MS } from '../../api/timeouts.ts'

/** As long as the personal space's read may take, and a moment to draw it (Codex on #245). */
export const TURN_WAIT_MS = READ_TIMEOUT_MS + 5_000
/** Once the read the turn waits on is back: the while it has to be drawn before the answer is no. */
export const SETTLE_MS = 1_500

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

interface Wait {
  /** How long to watch at most. */
  within?: number
  /** The read the turn comes with (the space read again): once it is back, a short while to draw it, then the answer. */
  read?: Promise<unknown>
}

/**
 * Watches for the turn: rows arriving, and a place shown (its `hidden` taken away: the space mounted under Home is
 * there already; Codex on #245), for as long as `within`, or until `read` is back and a moment has passed.
 */
export function turnShown(turnId: string, { within = TURN_WAIT_MS, read }: Wait = {}): Promise<boolean> {
  if (turnIsShown(turnId)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const watcher = new MutationObserver(() => {
      if (turnIsShown(turnId)) done(true)
    })
    function done(shown: boolean) {
      watcher.disconnect()
      for (const t of timers) clearTimeout(t)
      resolve(shown)
    }
    timers.push(setTimeout(() => done(false), within))
    watcher.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'inert'],
    })
    const settled = () => timers.push(setTimeout(() => done(turnIsShown(turnId)), SETTLE_MS))
    read?.then(settled, settled)
  })
}
