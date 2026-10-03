// Where a thread runs between two tiles: edge to edge, through the board's free space only, never over a tile's words.
// - In one lane: out of the left edge, down the lane's left gutter, into the left edge.
// - Lanes side by side: out of the edge facing the other, down the gap between them, into the facing edge.
// - Lanes apart: out into the gap beside the first, up to the free band over the tiles, across, and down the gap
//   beside the second.
// Its corners are rounded, as a drawn line's would be.

export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}
export type Point = readonly [number, number]

/** The gap between lane `i` and lane `i + 1`, as the x halfway across it. */
const gapAfter = (lanes: readonly Box[], i: number) => {
  const a = lanes[i]
  const b = lanes[i + 1]
  return a && b ? (a.right + b.left) / 2 : (a?.right ?? 0) + 6
}

const laneOf = (lanes: readonly Box[], tile: Box) => {
  const middle = (tile.left + tile.right) / 2
  return Math.max(
    0,
    lanes.findIndex((l) => middle >= l.left && middle <= l.right),
  )
}

/**
 * The thread's corners from the tile waited on (`from`) to the tile waiting (`to`). `band` is the y of the free band
 * between the lanes' heads and their first tiles.
 */
export function route(from: Box, to: Box, lanes: readonly Box[], band: number): Point[] {
  const fy = (from.top + from.bottom) / 2
  const ty = (to.top + to.bottom) / 2
  const fl = laneOf(lanes, from)
  const tl = laneOf(lanes, to)
  if (fl === tl) {
    const gutter = Math.min(from.left, to.left) - 10
    return [
      [from.left, fy],
      [gutter, fy],
      [gutter, ty],
      [to.left, ty],
    ]
  }
  const right = tl > fl
  const out = right ? gapAfter(lanes, fl) : gapAfter(lanes, fl - 1)
  const into = right ? gapAfter(lanes, tl - 1) : gapAfter(lanes, tl)
  const start: Point = [right ? from.right : from.left, fy]
  const end: Point = [right ? to.left : to.right, ty]
  if (Math.abs(out - into) < 1) return [start, [out, fy], [out, ty], end]
  return [start, [out, fy], [out, band], [into, band], [into, ty], end]
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)

/** The point `by` along the way from `a` to `b`. */
const toward = (a: Point, b: Point, by: number): Point => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [a[0] + ((b[0] - a[0]) / len) * by, a[1] + ((b[1] - a[1]) / len) * by]
}

/** An SVG path through the corners, each rounded by up to `r`, as far as its two legs allow. */
export function rounded(points: readonly Point[], r = 8): string {
  const [first, ...rest] = points
  if (!first) return ''
  let d = `M ${fmt(first[0])} ${fmt(first[1])}`
  rest.forEach((p, i) => {
    const prev = points[i] ?? p
    const next = rest[i + 1]
    if (!next) {
      d += ` L ${fmt(p[0])} ${fmt(p[1])}`
      return
    }
    const into = Math.min(r, Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 2)
    const outOf = Math.min(r, Math.hypot(next[0] - p[0], next[1] - p[1]) / 2)
    const a = toward(p, prev, into)
    const b = toward(p, next, outOf)
    d += ` L ${fmt(a[0])} ${fmt(a[1])} Q ${fmt(p[0])} ${fmt(p[1])} ${fmt(b[0])} ${fmt(b[1])}`
  })
  return d
}
