import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BEHIND, condensedRadius, lightBehind, markSize, shapedTarget, UMBRAL } from './threshold.ts'

const base = { x: 640, y: 336, radius: 272 }
const offset = (p: { x: number; y: number }) => ({ x: p.x - BEHIND.x, y: p.y - BEHIND.y })
const round = (n: number) => Math.round(n * 1000) / 1000

describe('the threshold’s numbers', () => {
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
