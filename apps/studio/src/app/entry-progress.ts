// The opening's numbers (docs/plans/entry-opening.md): its steps, each real work, where its bar stands at each, how
// the bar moves between them, and how the opening leaves. Pure, so the opening and its checks read the same answers.

/**
 * The steps, in order, each one done: the page is here, the app runs, the session is known, Home's own reads have
 * settled, the person's likeliest projects are warm, and all is ready.
 */
export const STAGES = ['page', 'app', 'session', 'space', 'warm', 'ready'] as const
export type EntryStage = (typeof STAGES)[number]

const AT: Record<EntryStage, number> = { page: 0.06, app: 0.18, session: 0.38, space: 0.64, warm: 0.9, ready: 1 }

/** What is under way once a step is done, said under the bar: the work, as it happens. */
const UNDER_WAY: Record<EntryStage, string> = {
  page: 'Signing you in',
  app: 'Signing you in',
  session: 'Opening your space',
  space: 'Getting your projects ready',
  warm: 'Ready',
  ready: 'Ready',
}

/** Each step's words stay at least this long: work done faster still reads, one line after another. */
export const SAY_AT_LEAST_MS = 480
/** The bar and its words come in this long after the page (public/entry.css): the first words count from then. */
export const SAID_FROM_MS = 700
/** The opening shows only after this long: a load ready sooner never flashes it. */
export const APPEAR_AFTER_MS = 120
/** The lockup's arrival (public/entry.css): the halves meet, the dot leaps to the i and lands. Seen whole, once. */
export const INTRO_MS = 2200
/** Everything it prepares holds the opening this long at most; then the screens' own notes take over. */
export const PREPARE_AT_MOST_MS = 5000
/** Warming the likeliest projects holds it this long at most once Home is ready. */
export const WARM_AT_MOST_MS = 1500

/** While a step runs, the bar moves this share of the way to the next one, ever slower: working, never done. */
const RUNNING_SHARE = 0.8
const RUNNING_MS = 1600
/** The bar follows where it should be with this lag: no step is ever a jump. */
const FOLLOW_MS = 300

export const barAt = (stage: EntryStage) => AT[stage]

export const underWay = (stage: EntryStage) => UNDER_WAY[stage]

const after = (stage: EntryStage): EntryStage => STAGES[STAGES.indexOf(stage) + 1] ?? 'ready'

/** Where the bar should be `since` ms after `stage` was done: on from it towards the next step, never reaching it. */
export function aimFor(stage: EntryStage, since: number): number {
  const from = AT[stage]
  const share = RUNNING_SHARE * (1 - Math.exp(-Math.max(0, since) / RUNNING_MS))
  return from + (AT[after(stage)] - from) * share
}

/** The bar a frame later: `dt` ms closer to `aim`, smoothly, and never back. */
export function follow(shown: number, aim: number, dt: number, lag = FOLLOW_MS): number {
  if (aim <= shown) return shown
  return shown + (aim - shown) * (1 - Math.exp(-Math.max(0, dt) / lag))
}

/** The later of two steps: the bar never goes back. */
export const laterStage = (a: EntryStage, b: EntryStage): EntryStage => (STAGES.indexOf(b) > STAGES.indexOf(a) ? b : a)

export type Exit = 'none' | 'fade' | 'fly' | 'dissolve'

interface Leaving {
  shownFor: number
  reduced: boolean
  flyTo: boolean
  /** It opens on something other than the Studio (a link that failed, a link's question): no arrival, no "Ready". */
  quick?: boolean
}

/**
 * How the opening leaves: not at all if it never showed; a quick fade under less motion, or onto anything but the
 * Studio; otherwise the lockup flies into the corner lockup of the screen it opens on, or, without one, dissolves.
 */
export function exitFor({ shownFor, reduced, flyTo, quick = false }: Leaving): Exit {
  if (shownFor < APPEAR_AFTER_MS) return 'none'
  if (reduced || quick) return 'fade'
  return flyTo ? 'fly' : 'dissolve'
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The move that lands `from`'s centre on `to`'s, at `to`'s size: a translation, then a scale about the centre. */
export function flight(from: Box, to: Box): { x: number; y: number; scale: number } {
  return {
    x: to.x + to.width / 2 - (from.x + from.width / 2),
    y: to.y + to.height / 2 - (from.y + from.height / 2),
    scale: to.width / from.width,
  }
}
