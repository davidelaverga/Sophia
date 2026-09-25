// The light's motion, as plain math: critically damped springs settle without overshoot at any frame
// rate, and the floor's path is a curve that passes exactly through Sophia on its way to the next person.

export interface Spring {
  value: number
  velocity: number
  target: number
  /** Angular frequency: higher settles faster (about 4.7 / omega seconds to within 1%). */
  omega: number
}

export const spring = (value: number, omega: number): Spring => ({ value, velocity: 0, target: value, omega })

/** Exact step of a critically damped spring toward its target. */
export function stepSpring(s: Spring, dt: number): void {
  const offset = s.value - s.target
  const decay = Math.exp(-s.omega * dt)
  const k = s.velocity + s.omega * offset
  s.value = s.target + (offset + k * dt) * decay
  s.velocity = (s.velocity - s.omega * k * dt) * decay
}

export interface Point {
  x: number
  y: number
}

/** The control point that makes the quadratic curve from `a` to `b` pass through `via` at its midpoint. */
export const controlThrough = (a: Point, via: Point, b: Point): Point => ({
  x: 2 * via.x - (a.x + b.x) / 2,
  y: 2 * via.y - (a.y + b.y) / 2,
})

export function bezier(a: Point, control: Point, b: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  }
}

export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** How long the floor takes to travel from one person, through Sophia, to the next. */
export const HANDOFF_SECONDS = 1.6

export interface HandoffFrame {
  /** Linear progress 0…1. */
  progress: number
  /** Eased position along the curve 0…1. */
  eased: number
  control: Point
  head: Point
  /** 0…1, largest while the floor passes through Sophia. */
  swell: number
}

export function handoffFrame(
  a: Point,
  via: Point,
  b: Point,
  elapsed: number,
  duration = HANDOFF_SECONDS,
): HandoffFrame {
  const progress = Math.min(1, Math.max(0, elapsed / duration))
  const eased = easeInOut(progress)
  const control = controlThrough(a, via, b)
  return {
    progress,
    eased,
    control,
    head: bezier(a, control, b, eased),
    swell: Math.exp(-Math.pow((eased - 0.5) / 0.13, 2)),
  }
}
