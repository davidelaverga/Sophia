// The light's loop, outside React: springs follow what the room says (mode, where she sits, whom she
// attends to, whether work runs), and each frame is drawn by the WebGL renderer and the 2D trace.
// It never decides anything about the room; it only shows it.
import { handoffFrame, spring, stepSpring, type HandoffFrame, type Point, type Spring } from './motion.ts'
import { createLightRenderer, type LightFrame, type LightRenderer } from './renderer.ts'
import { drawHandoff, drawWorkLine, perimeter } from './trace.ts'

/** rest: present but not in a live room. The others are the four states of the prototype. */
export type LightMode = 'rest' | 'listen' | 'think' | 'speak' | 'work'

export interface LightTarget {
  x: number
  y: number
  radius: number
}

export interface LightInput {
  mode: LightMode
  /** Where the light sits, in CSS pixels of its box; null centers it in the upper part of the box. */
  target: LightTarget | null
  /** The person she attends to; null when nobody holds her attention. */
  attention: Point | null
  /** Work is running in the background: a line travels the edge of the box. */
  working: boolean
}

type SpringName =
  | 'listen'
  | 'think'
  | 'speak'
  | 'work'
  | 'x'
  | 'y'
  | 'radius'
  | 'dirX'
  | 'dirY'
  | 'intensity'
  | 'ignite'
  | 'swell'
  | 'amp'
  | 'lean'
  | 'workLine'
type Springs = Record<SpringName, Spring>

function createSprings(reduced: boolean): Springs {
  const slow = reduced ? 12 : 2.6
  const place = reduced ? 14 : 3.2
  const turn = reduced ? 12 : 2.2
  return {
    listen: spring(1, slow),
    think: spring(0, slow),
    speak: spring(0, slow),
    work: spring(0, slow),
    x: spring(0, place),
    y: spring(0, place),
    radius: spring(0, place),
    dirX: spring(0, turn),
    dirY: spring(0, turn),
    // The light ignites on arrival: visible in the first frame, then it opens up.
    intensity: spring(reduced ? 1 : 0.55, 1.2),
    ignite: spring(reduced ? 1 : 0.42, 1.25),
    swell: spring(0, 7),
    amp: spring(0, 18),
    lean: spring(1, 3),
    workLine: spring(0, 1.6),
  }
}

/** Where the light sits when the room gives no target: centered, in the upper part of the box. */
export function defaultTarget(width: number, height: number): LightTarget {
  return { x: width / 2, y: height * 0.42, radius: Math.min(Math.min(width, height) * 0.34, 320) }
}

function setTargets(s: Springs, input: LightInput, width: number, height: number): void {
  const live = input.mode === 'rest' ? 'listen' : input.mode
  for (const m of ['listen', 'think', 'speak', 'work'] as const) s[m].target = live === m ? 1 : 0
  const at = input.target ?? defaultTarget(width, height)
  s.x.target = at.x
  s.y.target = at.y
  s.radius.target = at.radius
  s.intensity.target = input.mode === 'rest' ? 0.8 : 1
  s.ignite.target = 1
  s.workLine.target = input.working ? 1 : 0
  s.lean.target = input.mode === 'listen' || input.mode === 'speak' ? 1 : 0.2
}

/** A direction toward `look`, up to length 1 at one and a half radii away. */
function aimAt(s: Springs, look: Point | null): void {
  const reach = Math.max(1, s.radius.value * 1.5)
  const dx = look ? (look.x - s.x.value) / reach : 0
  const dy = look ? (look.y - s.y.value) / reach : 0
  const len = Math.hypot(dx, dy)
  s.dirX.target = len > 1 ? dx / len : dx
  s.dirY.target = len > 1 ? dy / len : dy
}

function toFrame(s: Springs, time: number, flow: number): LightFrame {
  const v = (name: SpringName) => s[name].value
  return {
    time,
    flow,
    x: v('x'),
    y: v('y'),
    radius: v('radius'),
    dirX: v('dirX'),
    dirY: v('dirY'),
    intensity: v('intensity'),
    listen: v('listen'),
    think: v('think'),
    speak: v('speak'),
    work: v('work'),
    amp: v('amp'),
    swell: v('swell'),
    lean: v('lean'),
    ignite: v('ignite'),
  }
}

interface Handoff {
  from: Point
  to: Point
  started: number
}

/** One frame of a floor handoff in flight, with its ends. */
interface HandoffStep {
  frame: HandoffFrame
  from: Point
  to: Point
}

export class LightEngine {
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private readonly springs = createSprings(this.reduced)
  private readonly gl: LightRenderer | null
  private readonly traceCanvas: HTMLCanvasElement
  private readonly trace: CanvasRenderingContext2D | null
  private readonly observer: ResizeObserver
  private input: LightInput = { mode: 'rest', target: null, attention: null, working: false }
  private size = { width: 0, height: 0 }
  private edge: Point[] = []
  private handoffState: Handoff | null = null
  private frameId = 0
  private last = performance.now() / 1000
  private slowFor = 0
  private flow = 0
  private snapped = false

  constructor(box: HTMLElement, glCanvas: HTMLCanvasElement, traceCanvas: HTMLCanvasElement) {
    this.gl = createLightRenderer(glCanvas, this.reduced)
    if (!this.gl) box.dataset.fallback = ''
    this.traceCanvas = traceCanvas
    this.trace = traceCanvas.getContext('2d')
    this.observer = new ResizeObserver(([entry]) => {
      if (entry) this.resize(entry.contentRect.width, entry.contentRect.height)
    })
    this.observer.observe(box)
    this.frameId = requestAnimationFrame(this.tick)
  }

  update(input: LightInput): void {
    this.input = input
  }

  /** The floor travels from one person, through Sophia, to the next. */
  handoff(from: Point, to: Point): void {
    this.handoffState = { from, to, started: performance.now() / 1000 }
  }

  stop(): void {
    cancelAnimationFrame(this.frameId)
    this.observer.disconnect()
    this.gl?.dispose()
  }

  private resize(width: number, height: number): void {
    this.size = { width, height }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.gl?.resize(width, height)
    this.traceCanvas.width = Math.round(width * dpr)
    this.traceCanvas.height = Math.round(height * dpr)
    this.trace?.setTransform(dpr, 0, 0, dpr, 0, 0)
    const narrow = width < 760
    this.edge = perimeter(width, height, narrow ? 8 : 12, narrow ? 18 : 24)
  }

  private readonly tick = (): void => {
    this.frameId = requestAnimationFrame(this.tick)
    const t = performance.now() / 1000
    const raw = t - this.last
    this.last = t
    if (this.size.width < 1 || this.size.height < 1) return
    if (!this.snapped) this.snap()
    this.pace(raw)
    this.draw(t, this.step(t, Math.min(0.05, raw)))
  }

  /** The first frame with a size places the light where it belongs instead of flying in from a corner. */
  private snap(): void {
    setTargets(this.springs, this.input, this.size.width, this.size.height)
    for (const k of ['x', 'y', 'radius'] as const) this.springs[k].value = this.springs[k].target
    this.snapped = true
  }

  private step(t: number, dt: number): HandoffStep | null {
    const s = this.springs
    setTargets(s, this.input, this.size.width, this.size.height)
    const h = this.handoffState
    const flight = h
      ? { frame: handoffFrame(h.from, { x: s.x.value, y: s.y.value }, h.to, t - h.started), from: h.from, to: h.to }
      : null
    aimAt(s, flight ? flight.frame.head : this.input.attention)
    s.swell.target = flight && !this.reduced ? flight.frame.swell : 0
    for (const sp of Object.values(s)) stepSpring(sp, dt)
    if (!this.reduced)
      this.flow += dt * (0.34 * s.think.value - 0.9 * s.amp.value * s.speak.value - 0.05 * s.listen.value)
    if (flight && flight.frame.progress >= 1) this.handoffState = null
    return flight
  }

  private draw(t: number, flight: HandoffStep | null): void {
    this.gl?.draw(toFrame(this.springs, t, this.flow))
    if (!this.trace) return
    this.trace.clearRect(0, 0, this.size.width, this.size.height)
    drawWorkLine(this.trace, this.edge, t, this.springs.workLine.value, this.reduced)
    if (flight && !this.reduced) drawHandoff(this.trace, flight.from, flight.to, flight.frame)
  }

  /** Frames slower than ~28 fps for a second step the resolution down; a 30 Hz display is not load. */
  private pace(raw: number): void {
    this.slowFor = raw > 0.036 && raw < 0.25 ? this.slowFor + raw : Math.max(0, this.slowFor - raw * 0.5)
    if (this.slowFor > 1) {
      this.slowFor = 0
      this.gl?.degrade()
    }
  }
}
