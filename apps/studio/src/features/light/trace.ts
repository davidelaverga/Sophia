// Crisp strokes over the light: the line that travels the room's edge while work runs, and the floor's
// path from one person, through Sophia, to the next. Canvas 2D, in CSS pixels.
import { bezier, type HandoffFrame, type Point } from './motion.ts'

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

function glow(ctx: CanvasRenderingContext2D, at: Point, radius: number, stops: Array<[number, string]>): void {
  const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius)
  for (const [offset, color] of stops) g.addColorStop(offset, color)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/** A faint track and a travelling head, strength 0…1. Reduced motion keeps only the still track. */
export function drawWorkLine(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  time: number,
  strength: number,
  still: boolean,
) {
  if (strength <= 0.01 || pts.length < 2) return
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(156, 130, 245, ${0.07 * strength})`
  ctx.lineWidth = 1
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.stroke()
  if (still) return
  const total = pts.length
  const head = Math.floor((time * 60) % total)
  const len = Math.floor(total * 0.16)
  ctx.lineWidth = 1.4
  for (let i = 1; i < len; i++) {
    const a = pts[(head - i + total) % total]
    const b = pts[(head - i + 1 + total) % total]
    if (!a || !b) continue
    const f = 1 - i / len
    ctx.strokeStyle = `rgba(196, 180, 255, ${0.75 * f * f * strength})`
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  const at = pts[head]
  if (at)
    glow(ctx, at, 16, [
      [0, `rgba(244, 240, 255, ${0.55 * strength})`],
      [1, 'rgba(244, 240, 255, 0)'],
    ])
}

/** The floor's thread: warm at the people, violet where it passes through Sophia, brightest at its head. */
export function drawHandoff(ctx: CanvasRenderingContext2D, a: Point, b: Point, frame: HandoffFrame): void {
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
    const color = [243 + (196 - 243) * mid, 220 + (180 - 220) * mid, 200 + (255 - 200) * mid].map(Math.round)
    ctx.strokeStyle = `rgba(${color.join(', ')}, ${0.85 * f * f})`
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, frame.head, 22, [
    [0, 'rgba(255, 250, 244, 0.95)'],
    [0.25, 'rgba(243, 220, 200, 0.35)'],
    [1, 'rgba(243, 220, 200, 0)'],
  ])
  ctx.globalCompositeOperation = 'source-over'
}
