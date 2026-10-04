// The sign-in's threshold (docs/plans/signin-threshold.md), as numbers the light and the mark share: where the light
// goes while someone writes (a little towards them), how it condenses once they are through, and the size and place
// of the mark that forms there. Pure, so the light and its checks read the same answers.
import type { LightTarget } from './engine.ts'
import type { Point } from './motion.ts'

/** How far the light leans towards whoever writes: a share of the way, and never more than this many pixels. */
const PULL_SHARE = 0.14
const PULL_MAX = 40

/** The mark that forms: 96 px (twice its 48 grid, so its gap is two whole pixels) where there is room, else 48. */
export const markSize = (radius: number) => (radius >= 160 ? 96 : 48)

/** The light condensed behind the mark: a glow a little wider than it. */
export const condensedRadius = (radius: number) => (markSize(radius) * 3) / 5

/**
 * Where the light goes, from where it rests: drawn a little towards `pull`, or condensed behind the mark once the
 * email has gone. Without either, it rests where it is.
 */
export function shapedTarget(base: LightTarget, pull: Point | null, condensed: boolean): LightTarget {
  if (condensed) return { ...base, radius: condensedRadius(base.radius) }
  if (!pull) return base
  const dx = pull.x - base.x
  const dy = pull.y - base.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return base
  const step = Math.min(length * PULL_SHARE, PULL_MAX)
  return { ...base, x: base.x + (dx / length) * step, y: base.y + (dy / length) * step }
}

/**
 * Umbral's two halves on its 48 grid, each a disc cut at the line between you: the paths the mark draws and the discs
 * the light's shader blocks with (shader.ts), so the shadows fall exactly where the halves are.
 */
export interface UmbralHalf {
  path: string
  /** The disc's centre and radius, and the line it is cut at, on the 48 grid. */
  x: number
  y: number
  r: number
  cut: number
}

export const UMBRAL: Readonly<Record<'you' | 'her', UmbralHalf>> = {
  you: { path: 'M30 14.83A15.19 15.19 0 1 0 30 37.93Z', x: 20.14, y: 26.38, r: 15.19, cut: 30 },
  her: { path: 'M33 6.65A8.57 8.57 0 1 1 33 23.11Z', x: 35.39, y: 14.88, r: 8.57, cut: 33 },
}

/** Behind the formed mark the light stands on the line between you, between your half and hers (48 grid). */
export const BEHIND: Point = { x: 31.5, y: 22 }
/** Towards a pointer it moves at most this far on the grid, all of it once the pointer is this many pixels away. */
const BEHIND_REACH = 3.5
const BEHIND_FULL_AT = 480

/**
 * Where the light stands behind the mark: leaning towards the pointer, as she leans towards whoever writes, enough
 * for the rays to turn and never to leave the line between you. Both points in pixels of the light's box.
 */
export function lightBehind(mark: Point | null, pointer: Point | null): Point {
  if (!mark || !pointer) return BEHIND
  const dx = pointer.x - mark.x
  const dy = pointer.y - mark.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return BEHIND
  const step = (Math.min(length / BEHIND_FULL_AT, 1) * BEHIND_REACH) / length
  return { x: BEHIND.x + dx * step, y: BEHIND.y + dy * step }
}
