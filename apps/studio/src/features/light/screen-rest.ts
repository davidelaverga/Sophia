// Where Sophia's light rests on a screen without a room (sign-in, the home, an invitation), and so where the
// words under it start. Usually it sits in the upper part of the screen (the engine's default). When the words
// would not fit under it there, it rests higher and smaller: a phone held upright, or a home that lists
// projects on a laptop. theme.css starts `.screen-body` with the same numbers (`.screen[data-rest-high]`).
import { defaultTarget, type LightTarget } from './engine.ts'

/** The high rest: a quarter of the way down and a little smaller. */
export function highRest(width: number, height: number): LightTarget {
  return { x: width / 2, y: height * 0.26, radius: Math.min(Math.min(width, height) * 0.3, 320) }
}

/** The least air under the last line for the words to count as fitting. */
const AIR = 16

/** The words start where the light's glow ends: half a radius under its center. */
export function wordsTop(rest: LightTarget): number {
  return rest.y + rest.radius / 2
}

/**
 * Whether the light rests high in a box: when the box is at least half again as tall as it is wide, or when
 * `words` (the height of the words, in pixels) would end too close to the bottom, or past it, under the usual rest.
 */
export function restsHigh(width: number, height: number, words: number): boolean {
  return height >= width * 1.5 || wordsTop(defaultTarget(width, height)) + words + AIR > height
}

/** The same place, so a measurement that changes nothing does not set the light moving again. */
export function sameRest(a: LightTarget | null, b: LightTarget | null): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.y === b.y && a.radius === b.radius
}
