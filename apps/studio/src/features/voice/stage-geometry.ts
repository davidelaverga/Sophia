// Where things are on the room stage, read from the DOM: Sophia's tile (in a video layout the light
// moves into it) and the anchor of the person who holds the floor (she leans toward them). Coordinates
// are CSS pixels relative to the stage.
import type { LightTarget } from '../light/engine.ts'
import type { Point } from '../light/motion.ts'
import type { StageMode } from './room-view.ts'

export interface StageGeometry {
  /** Null: the light takes its default place in the room. */
  target: LightTarget | null
  attention: Point | null
}

interface Box extends Point {
  size: number
}

function boxOf(el: Element | null, stage: DOMRect): Box | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    x: r.left - stage.left + r.width / 2,
    y: r.top - stage.top + r.height / 2,
    size: Math.min(r.width, r.height),
  }
}

/** The point a person is drawn from: their orbit around the light, or their name in a video tile. */
export function anchorOf(stage: HTMLElement, actorId: string): Point | null {
  const box = boxOf(
    stage.querySelector(`[data-actor="${CSS.escape(actorId)}"] [data-anchor]`),
    stage.getBoundingClientRect(),
  )
  return box ? { x: box.x, y: box.y } : null
}

export function measureStage(stage: HTMLElement, holder: string | null, mode: StageMode): StageGeometry {
  const tile = mode === 'light' ? null : boxOf(stage.querySelector('[data-sophia-tile]'), stage.getBoundingClientRect())
  return {
    target: tile ? { x: tile.x, y: tile.y, radius: tile.size * 0.56 } : null,
    attention: holder ? anchorOf(stage, holder) : null,
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5
const samePoint = (a: Point | null, b: Point | null) => (a && b ? near(a.x, b.x) && near(a.y, b.y) : a === b)

export function sameGeometry(a: StageGeometry, b: StageGeometry): boolean {
  const targets =
    a.target && b.target
      ? samePoint(a.target, b.target) && near(a.target.radius, b.target.radius)
      : a.target === b.target
  return targets && samePoint(a.attention, b.attention)
}
