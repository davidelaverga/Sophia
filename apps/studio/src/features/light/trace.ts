// Crisp strokes over the light: the room's edge, faintly lit while work runs, and the floor's path from one
// person, through Sophia, to the next. Canvas 2D, in CSS pixels.
import { bezier, type HandoffFrame, type Point } from './motion.ts'

/** The trace's inks: light added over the void in the room, or ink laid on the page on paper (docs/plans/light-breath.md). */
export interface TraceInks {
  /** The room's edge: an rgb triplet and its strength at full. */
  line: string
  lineAlpha: number
  /** The floor's thread, at the people and where it passes through Sophia. */
  people: readonly [number, number, number]
  sophia: readonly [number, number, number]
  /** The thread's head: a glow, and how it meets what is under it. */
  head: ReadonlyArray<readonly [number, string]>
  composite: GlobalCompositeOperation
}

export const ROOM_INKS: TraceInks = {
  line: '156, 130, 245',
  lineAlpha: 0.07,
  people: [243, 220, 200],
  sophia: [196, 180, 255],
  head: [
    [0, 'rgba(255, 250, 244, 0.95)'],
    [0.25, 'rgba(243, 220, 200, 0.35)'],
    [1, 'rgba(243, 220, 200, 0)'],
  ],
  composite: 'lighter',
}

/** On paper: the theme's halo for the edge (a page needs more than the void's 0.07), its warm and its violet for the thread. */
export const PAPER_INKS: TraceInks = {
  line: '109, 91, 208',
  lineAlpha: 0.22,
  people: [150, 83, 40],
  sophia: [85, 70, 184],
  head: [
    [0, 'rgba(85, 70, 184, 0.6)'],
    [0.3, 'rgba(85, 70, 184, 0.22)'],
    [1, 'rgba(85, 70, 184, 0)'],
  ],
  composite: 'source-over',
}

export const inksFor = (paper: boolean): TraceInks => (paper ? PAPER_INKS : ROOM_INKS)

/** Points every ~6 px along a rounded rectangle inset from the box, clockwise from the top left. */
export function perimeter(width: number, height: number, inset: number, radius: number): Point[] {
  const pts: Point[] = []
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6))
    for (let i = 0; i < n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n })
  }
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i < 12; i++) {
      const a = from + (i / 12) * (Math.PI / 2)
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
    }
  }
  const [l, t, r, b] = [inset, inset, width - inset, height - inset]
  line(l + radius, t, r - radius, t)
  corner(r - radius, t + radius, -Math.PI / 2)
  line(r, t + radius, r, b - radius)
  corner(r - radius, b - radius, 0)
  line(r - radius, b, l + radius, b)
  corner(l + radius, b - radius, Math.PI / 2)
  line(l, b - radius, l, t + radius)
  corner(l + radius, t + radius, Math.PI)
  return pts
}

function glow(
  ctx: CanvasRenderingContext2D,
  at: Point,
  radius: number,
  stops: ReadonlyArray<readonly [number, string]>,
): void {
  const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius)
  for (const [offset, color] of stops) g.addColorStop(offset, color)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * The room's edge, faintly lit while work runs: one still line, strength 0…1. Nothing travels along it. A bright
 * head circling the room pulled the eye from the people in it, and the room's line already says work is running.
 */
export function drawWorkLine(ctx: CanvasRenderingContext2D, pts: Point[], strength: number, inks = ROOM_INKS) {
  if (strength <= 0.01 || pts.length < 2) return
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(${inks.line}, ${inks.lineAlpha * strength})`
  ctx.lineWidth = 1
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.stroke()
}

/** The floor's thread: warm at the people, violet where it passes through Sophia, brightest at its head. */
export function drawHandoff(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  frame: HandoffFrame,
  inks = ROOM_INKS,
): void {
  const n = 56
  const from = Math.max(0, frame.eased - 0.36)
  ctx.lineCap = 'round'
  ctx.lineWidth = 1.6
  for (let i = 0; i < n; i++) {
    const u0 = from + ((frame.eased - from) * i) / n
    const u1 = from + ((frame.eased - from) * (i + 1)) / n
    const p0 = bezier(a, frame.control, b, u0)
    const p1 = bezier(a, frame.control, b, u1)
    const f = (i + 1) / n
    const mid = 1 - Math.min(1, Math.abs(u1 - 0.5) * 2.4)
    const between = (at: number, to: number) => Math.round(at + (to - at) * mid)
    const color = [
      between(inks.people[0], inks.sophia[0]),
      between(inks.people[1], inks.sophia[1]),
      between(inks.people[2], inks.sophia[2]),
    ]
    ctx.strokeStyle = `rgba(${color.join(', ')}, ${0.85 * f * f})`
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = inks.composite
  glow(ctx, frame.head, 22, inks.head)
  ctx.globalCompositeOperation = 'source-over'
}
