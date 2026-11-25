import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  aimOf,
  BEHIND,
  condensedRadius,
  lightBehind,
  markSize,
  paperBehind,
  roomForMark,
  shadowArcs,
  shapedTarget,
  UMBRAL,
} from './threshold.ts'

const base = { x: 640, y: 336, radius: 272 }
const offset = (p: { x: number; y: number }) => ({ x: p.x - BEHIND.x, y: p.y - BEHIND.y })
const round = (n: number) => Math.round(n * 1000) / 1000

describe('the threshold’s numbers', () => {
  it('rests a mark of 96 px in any box with room for it (Home), else of 48', () => {
    const laptop = roomForMark({ x: 212, y: 178, radius: 144 }, 424, 424)
    assert.deepEqual(laptop, { x: 212, y: 178, radius: 160 })
    assert.equal(markSize(laptop.radius), 96)
    assert.equal(markSize(roomForMark({ x: 240, y: 202, radius: 163 }, 480, 480).radius), 96)
    assert.equal(markSize(roomForMark({ x: 110, y: 92, radius: 75 }, 220, 220).radius), 48)
  })

  it('turns the light behind the mark to whom she attends to, else to the pointer', () => {
    const line = { x: 120, y: 400 }
    const pointer = { x: 900, y: 80 }
    assert.deepEqual(aimOf(line, pointer), line)
    assert.deepEqual(aimOf(null, pointer), pointer)
    assert.equal(aimOf(null, null), null)
  })

  it('rests where it is with no one writing', () => {
    assert.deepEqual(shapedTarget(base, null, false), base)
  })

  it('leans a little towards whoever writes, never past 40 px, its size kept', () => {
    const near = shapedTarget(base, { x: 640, y: 436 }, false)
    assert.equal(near.x, 640)
    assert.equal(Math.round(near.y), 350) // 14 % of 100 px
    const far = shapedTarget(base, { x: 640, y: 936 }, false)
    assert.equal(Math.round(far.y), 376) // capped at 40 px
    assert.equal(far.radius, 272)
  })

  it('condenses behind the mark once through, in place', () => {
    const condensed = shapedTarget(base, { x: 640, y: 621 }, true)
    assert.deepEqual([condensed.x, condensed.y], [640, 336])
    assert.equal(condensed.radius, condensedRadius(272))
  })

  it('forms a mark of twice its grid where there is room, else its grid', () => {
    assert.equal(markSize(272), 96)
    assert.equal(markSize(117), 48)
    assert.equal(condensedRadius(272), 57.6)
  })
})

describe('the light behind the mark', () => {
  const mark = { x: 640, y: 200 }

  it('stands on the line between the halves, with no pointer or no mark', () => {
    assert.deepEqual(lightBehind(mark, null), BEHIND)
    assert.deepEqual(lightBehind(null, { x: 0, y: 0 }), BEHIND)
    assert.ok(BEHIND.x > UMBRAL.you.cut && BEHIND.x < UMBRAL.her.cut)
  })

  it('leans towards the pointer, in proportion near the mark and 3.5 grid units at most', () => {
    const near = offset(lightBehind(mark, { x: 640 + 240, y: 200 }))
    assert.deepEqual([round(near.x), near.y], [1.75, 0]) // half of 480 px: half the reach
    const far = offset(lightBehind(mark, { x: 640 - 3000, y: 200 - 4000 }))
    assert.equal(round(Math.hypot(far.x, far.y)), 3.5)
    assert.deepEqual([Math.sign(far.x), Math.sign(far.y)], [-1, -1])
    assert.deepEqual(lightBehind(mark, mark), BEHIND) // on the mark: nowhere to lean
  })
})

// The halves as the SVG draws them must be the discs the shader blocks with: each path is a chord on the cut line
// whose ends lie on its disc, bulging away from the line between you.
describe('Umbral’s halves, drawn and blocked alike', () => {
  for (const [name, half] of Object.entries(UMBRAL)) {
    it(`${name}: the path’s ends sit on the cut and on the disc`, () => {
      const numbers = half.path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const [x0, y0, rx, , , , , x1, y1] = numbers
      assert.equal(rx, half.r)
      for (const [x, y] of [
        [x0, y0],
        [x1, y1],
      ]) {
        assert.equal(x, half.cut)
        assert.ok(Math.abs(Math.hypot((x ?? 0) - half.x, (y ?? 0) - half.y) - half.r) < 0.02, `${name} ${String(y)}`)
      }
    })
  }

  it('your half lies left of the line between you, hers right of it', () => {
    assert.ok(UMBRAL.you.x < UMBRAL.you.cut && UMBRAL.her.x > UMBRAL.her.cut)
  })
})

describe('the light behind the mark, on paper (paper-light-rays.md)', () => {
  const mark = { markSize: 96, sourceX: BEHIND.x, sourceY: BEHIND.y }
  it('stands on the line between the halves at rest: no lean', () => {
    assert.deepEqual(paperBehind(mark), { '--bx': '0px', '--by': '0px' })
  })
  it('leans in the mark’s pixels: 3.5 on the grid of a 96 px mark is 7 px', () => {
    assert.deepEqual(paperBehind({ ...mark, sourceX: BEHIND.x + 3.5, sourceY: BEHIND.y - 1 }), {
      '--bx': '7px',
      '--by': '-2px',
    })
    assert.deepEqual(paperBehind({ ...mark, markSize: 48, sourceX: BEHIND.x + 3.5 }), {
      '--bx': '3.5px',
      '--by': '0px',
    })
  })
  it('with no mark, no lean', () => {
    assert.deepEqual(paperBehind({ markSize: 0, sourceX: BEHIND.x + 3, sourceY: BEHIND.y }), {
      '--bx': '0px',
      '--by': '0px',
    })
  })
  it('your half shades the left and hers the right; the light pours up and down the line and out on her side', () => {
    assert.deepEqual(shadowArcs(BEHIND), { you: { from: 185.4, to: 348.2 }, her: { from: 5.6, to: 126.5 } })
  })
  it('draws its shadows and its light where the halves block it, not in an even fan', () => {
    const css = readFileSync(new URL('../../app/theme.css', import.meta.url), 'utf8')
    const conics = [...css.matchAll(/\.threshold-light::(?:before|after) \{[^}]*?conic-gradient\(([^;]*?)\);/g)]
    assert.equal(conics.length, 2, 'the shadows (::before) and the light (::after)')
    const arcs = shadowArcs(BEHIND)
    for (const [, stops] of conics) {
      const at = [...(stops ?? '').matchAll(/(\d+(?:\.\d+)?)deg/g)].map((m) => Number(m[1]))
      assert.equal(at.length, 9, stops)
      // Each edge is a soft step: its middle stands within a degree of where the half's straight edge ends.
      const middles = [1, 3, 5, 7].map((i) => ((at[i] ?? 0) + (at[i + 1] ?? 0)) / 2)
      const edges = [arcs.her.from, arcs.her.to, arcs.you.from, arcs.you.to]
      middles.forEach((middle, i) =>
        assert.ok(Math.abs(middle - (edges[i] ?? 0)) <= 1, `${String(middle)} ≈ ${String(edges[i])}`),
      )
    }
  })
})
