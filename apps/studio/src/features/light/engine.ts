// The light's loop, outside React: springs follow what the room says (mode, where she sits, whom she
// attends to, whether work runs), and each frame is drawn by the WebGL renderer and the 2D trace.
// It never decides anything about the room; it only shows it.
import {
  envelope,
  HEAR_ATTACK_S,
  HEAR_RELEASE_S,
  handoffFrame,
  settle,
  spring,
  stepSpring,
  type HandoffFrame,
  type Point,
  type Spring,
} from './motion.ts'
import { createLightRenderer, type LightFrame, type LightRenderer } from './renderer.ts'
import { paperHalo } from './shape.ts'
import { aimOf, BEHIND, lightBehind } from './threshold.ts'
import { drawHandoff, drawWorkLine, inksFor, perimeter } from './trace.ts'

/** rest: present but not in a live room. The others are the four states of the prototype. */
export type LightMode = 'rest' | 'listen' | 'think' | 'speak' | 'work'

export interface LightTarget {
  x: number
  y: number
  radius: number
}

/** The mark formed where the light rests (the sign-in's threshold): centre and size in CSS pixels of the box. */
export interface MarkAt {
  x: number
  y: number
  size: number
}

export interface LightInput {
  mode: LightMode
  /** Where the light sits, in CSS pixels of its box; null centers it in the upper part of the box. */
  target: LightTarget | null
  /** The person she attends to; null when nobody holds her attention. */
  attention: Point | null
  /** Work is running in the background: the edge of the box is faintly lit. */
  working: boolean
  /** A mark formed in front of the light: it blocks her and she pours past its edges. */
  mark?: MarkAt | null
  /** How loud she is now, 0…1, read once a frame while she speaks (voice-levels.ts); absent, her voice moves nothing. */
  voice?: (() => number) | null
  /** How loud the one she listens to is, 0…1, read once a frame while she listens (orb-hears.md); absent, nothing. */
  hearing?: (() => number) | null
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
  | 'lean'
  | 'workLine'
  | 'occlude'
  | 'sourceX'
  | 'sourceY'
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
    lean: spring(1, 3),
    workLine: spring(0, 1.6),
    occlude: spring(0, reduced ? 12 : 1.9),
    sourceX: spring(BEHIND.x, turn),
    sourceY: spring(BEHIND.y, turn),
  }
}

/** The light behind the mark leans towards the pointer, as she leans towards whoever writes (threshold.ts). */
function aimSource(s: Springs, mark: MarkAt | null, pointer: Point | null): void {
  const at = lightBehind(mark, pointer)
  s.sourceX.target = at.x
  s.sourceY.target = at.y
}

/**
 * After its box changes size (a side panel, a rotated phone, a dragged window) the light holds to its place for this
 * long instead of gliding to it: the room around it moved at once, and the room's own targets (Sophia's tile) are
 * measured a frame or two later.
 */
const RELAYOUT_S = 0.25

/** How long a result's bloom lasts, up and down (orb-result.md). */
const BLOOM_S = 0.9

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

function toFrame(s: Springs, time: number, flow: number, mark: MarkAt | null, amp: number): LightFrame {
  const v = (name: SpringName) => s[name].value
  return {
    markX: mark?.x ?? 0,
    markY: mark?.y ?? 0,
    markSize: mark?.size ?? 0,
    occlude: mark ? v('occlude') : 0,
    sourceX: v('sourceX'),
    sourceY: v('sourceY'),
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
    amp,
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

/** A voice's level now, 0…1; one that can't be read is silence. */
function level(read: (() => number) | null | undefined): number {
  try {
    const v = read?.() ?? 0
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
  } catch {
    return 0
  }
}

export class LightEngine {
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private readonly springs = createSprings(this.reduced)
  /** Her light in WebGL, in the room only: on paper the halo is CSS and no context is held (setPaper). */
  private gl: LightRenderer | null = null
  private readonly traceCanvas: HTMLCanvasElement
  private readonly trace: CanvasRenderingContext2D | null
  private readonly observer: ResizeObserver
  private input: LightInput = { mode: 'rest', target: null, attention: null, working: false }
  private size = { width: 0, height: 0 }
  private edge: Point[] = []
  private handoffState: Handoff | null = null
  /** When a result last arrived (`arrive`), for her one soft bloom. */
  private bloomAt = Number.NEGATIVE_INFINITY
  private frameId = 0
  private last = performance.now() / 1000
  private slowFor = 0
  private flow = 0
  private snapped = false
  private relayoutUntil = 0
  /** The pointer on the page while a mark is shown (fine pointers, full motion only); placed in the box per frame. */
  private pointer: Point | null = null
  /** The page on paper: the trace writes in the paper's inks (trace.ts), and the halo reads the springs (paperHalo). */
  private paper = false
  /** The paper halo's properties as last written, so a light at rest writes nothing. */
  private halo = ''
  /** Her voice now, followed by its envelope (motion.ts): 0 unless she speaks, under full motion. */
  private amp = 0
  /** What she hears, by its own slower envelope: 0 unless she listens, under full motion (orb-hears.md). */
  private ear = 0
  /** The levels as last written (`--amp`, `--hear`): a light that never hears a voice writes nothing. */
  private readonly written = { '--amp': '0.00', '--hear': '0.00' }
  private readonly box: HTMLElement

  /** The room's canvas the WebGL light draws on; none on paper, where SophiaLight renders none. */
  private glCanvas: HTMLCanvasElement | null = null

  constructor(box: HTMLElement, traceCanvas: HTMLCanvasElement) {
    this.box = box
    this.traceCanvas = traceCanvas
    this.trace = traceCanvas.getContext('2d')
    this.observer = new ResizeObserver(([entry]) => {
      if (entry) this.resize(entry.contentRect.width, entry.contentRect.height)
    })
    this.observer.observe(box)
    if (!this.reduced && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', this.follow, { passive: true })
      window.addEventListener('pointerout', this.lose, { passive: true })
    }
    this.frameId = requestAnimationFrame(this.tick)
  }

  /**
   * Told by the component as the root's theme changes, with the room's canvas while dark (light-webgl-room.md). Turned
   * paper, the canvas leaves and its context is given back; turned dark, the new canvas gets one, sized now: its box
   * kept its size, so no resize comes for it.
   */
  setPaper(paper: boolean, glCanvas: HTMLCanvasElement | null): void {
    // The paper orb's properties are written afresh on the next frame (publish).
    this.halo = ''
    const canvas = paper ? null : glCanvas
    if (canvas === this.glCanvas) return
    this.gl?.release()
    this.glCanvas = canvas
    this.gl = canvas ? createLightRenderer(canvas, this.reduced) : null
    if (!canvas) return
    // Without WebGL the room keeps a CSS glow (theme.css), until a later canvas has it.
    this.box.toggleAttribute('data-fallback', !this.gl)
    if (this.size.width >= 1 && this.size.height >= 1) this.gl?.resize(this.size.width, this.size.height)
  }

  update(input: LightInput): void {
    this.input = input
    // The mark gone, its shadows go with it, at once: none falls around an empty place.
    if (!input.mark) {
      this.springs.occlude.target = 0
      settle(this.springs.occlude)
    }
  }

  private readonly follow = (event: PointerEvent): void => {
    this.pointer = this.input.mark ? { x: event.clientX, y: event.clientY } : null
  }

  /** The pointer gone from the page: the light behind the mark rests instead of aiming at where it was last. */
  private readonly lose = (event: PointerEvent): void => {
    if (!event.relatedTarget) this.pointer = null
  }

  /** Whom the light behind the mark turns to (aimOf); under less motion, no one: it stays where it stands. */
  private aim(): Point | null {
    return this.reduced ? null : aimOf(this.input.attention, this.pointerInBox())
  }

  /** The pointer in the box's own pixels: the box is measured once a frame, not on every move. */
  private pointerInBox(): Point | null {
    if (!this.pointer || !this.input.mark) return null
    const at = this.box.getBoundingClientRect()
    return { x: this.pointer.x - at.left, y: this.pointer.y - at.top }
  }

  /** The floor travels from one person, through Sophia, to the next. */
  /** A result arrived (orb-result.md): one soft bloom, under full motion only. */
  arrive(): void {
    if (!this.reduced) this.bloomAt = performance.now() / 1000
  }

  /** The bloom's swell now: 0.9 s up and down, none while she speaks (her voice already moves her). */
  private bloom(t: number): number {
    const at = t - this.bloomAt
    if (at < 0 || at > BLOOM_S || this.springs.speak.value > 0.5) return 0
    return 0.6 * Math.sin((Math.PI * at) / BLOOM_S)
  }

  handoff(from: Point, to: Point): void {
    this.handoffState = { from, to, started: performance.now() / 1000 }
  }

  stop(): void {
    cancelAnimationFrame(this.frameId)
    this.observer.disconnect()
    window.removeEventListener('pointermove', this.follow)
    window.removeEventListener('pointerout', this.lose)
    this.gl?.dispose()
  }

  private resize(width: number, height: number): void {
    this.size = { width, height }
    // Shown again: its frames start again, from now (no leap for the time it was away).
    if (!this.frameId && width >= 1 && height >= 1) {
      this.last = performance.now() / 1000
      this.frameId = requestAnimationFrame(this.tick)
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.gl?.resize(width, height)
    this.traceCanvas.width = Math.round(width * dpr)
    this.traceCanvas.height = Math.round(height * dpr)
    this.trace?.setTransform(dpr, 0, 0, dpr, 0, 0)
    const narrow = width < 760
    // The corners match the panels' radii (--r-3 on phones, --r-4 elsewhere).
    this.edge = perimeter(width, height, narrow ? 8 : 12, narrow ? 8 : 12)
    if (!this.snapped) return
    // The room moved at once, so the light moves with it; and a resized canvas is blank until drawn, so draw now.
    const t = performance.now() / 1000
    this.relayoutUntil = t + RELAYOUT_S
    this.draw(t, this.step(t, 0))
  }

  private readonly tick = (): void => {
    // A box with no size (a view hidden, as Home is behind another place) asks for no frames until it has one again.
    if (this.size.width < 1 || this.size.height < 1) {
      this.frameId = 0
      return
    }
    this.frameId = requestAnimationFrame(this.tick)
    const t = performance.now() / 1000
    const raw = t - this.last
    this.last = t
    if (!this.snapped) this.snap()
    this.pace(raw)
    this.draw(t, this.step(t, Math.min(0.05, raw)))
  }

  /** The first frame with a size places the light where it belongs instead of flying in from a corner. */
  private snap(): void {
    setTargets(this.springs, this.input, this.size.width, this.size.height)
    this.place()
    this.snapped = true
  }

  /** The light is where it belongs, at rest: no flight from where it was. */
  private place(): void {
    for (const k of ['x', 'y', 'radius'] as const) settle(this.springs[k])
  }

  private step(t: number, dt: number): HandoffStep | null {
    const s = this.springs
    setTargets(s, this.input, this.size.width, this.size.height)
    if (t < this.relayoutUntil) this.place()
    const h = this.handoffState
    const flight = h
      ? { frame: handoffFrame(h.from, { x: s.x.value, y: s.y.value }, h.to, t - h.started), from: h.from, to: h.to }
      : null
    aimAt(s, flight ? flight.frame.head : this.input.attention)
    s.occlude.target = this.input.mark ? 1 : 0
    aimSource(s, this.input.mark ?? null, this.aim())
    s.swell.target = flight && !this.reduced ? flight.frame.swell : this.bloom(t)
    for (const sp of Object.values(s)) stepSpring(sp, dt)
    this.hear(dt)
    if (!this.reduced) this.flow += dt * (0.34 * s.think.value - 0.9 * this.amp * s.speak.value - 0.05 * s.listen.value)
    if (flight && flight.frame.progress >= 1) this.handoffState = null
    return flight
  }

  /**
   * Her voice while she speaks, and the voice she listens to while she listens, each through its envelope, under full
   * motion only; a reader that fails is silence.
   */
  private hear(dt: number): void {
    const { mode, voice, hearing } = this.input
    this.amp = envelope(this.amp, mode === 'speak' && !this.reduced ? level(voice) : 0, dt)
    const heard = mode === 'listen' && !this.reduced ? level(hearing) : 0
    this.ear = envelope(this.ear, heard, dt, HEAR_ATTACK_S, HEAR_RELEASE_S)
  }

  private draw(t: number, flight: HandoffStep | null): void {
    const frame = toFrame(this.springs, t, this.flow, this.input.mark ?? null, this.amp)
    this.report('--amp', frame.amp)
    this.report('--hear', this.ear)
    // A canvas not displayed, or gone with the room, has no parent box to lay out in: no frame is drawn into it.
    if (this.glCanvas?.offsetParent) this.gl?.draw(frame)
    if (this.paper) this.publish(frame)
    if (!this.trace) return
    this.trace.clearRect(0, 0, this.size.width, this.size.height)
    const inks = inksFor(this.paper)
    drawWorkLine(this.trace, this.edge, this.springs.workLine.value, inks)
    if (flight && !this.reduced) drawHandoff(this.trace, flight.from, flight.to, flight.frame, inks)
  }

  /**
   * On paper the halo is CSS: it reads her place, radius, size and strength from the same springs the canvas draws
   * (light-room-paper.md), written only when they change.
   */
  private publish(frame: LightFrame): void {
    const halo = paperHalo(frame)
    const key = Object.values(halo).join(' ')
    if (key === this.halo) return
    this.halo = key
    for (const [name, value] of Object.entries(halo)) this.box.style.setProperty(name, value)
  }

  /** A level the shader or the paper orb is given (`--amp`, `--hear`), for the checks too, written only when it changes. */
  private report(name: '--amp' | '--hear', value: number): void {
    const said = value.toFixed(2)
    if (said === this.written[name]) return
    this.written[name] = said
    this.box.style.setProperty(name, said)
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
