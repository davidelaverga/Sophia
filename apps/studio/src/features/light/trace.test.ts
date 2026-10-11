import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { drawWorkLine, inksFor, PAPER_INKS, perimeter, ROOM_INKS } from './trace.ts'

/** A canvas that only counts what is drawn on it. */
function recorder() {
  const calls = { stroke: 0, fill: 0, arc: 0 }
  const ctx = {
    lineCap: '',
    lineWidth: 0,
    strokeStyle: '',
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke: () => void calls.stroke++,
    fill: () => void calls.fill++,
    arc: () => void calls.arc++,
  }
  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D, style: () => ctx.strokeStyle }
}

describe('the room edge while work runs', () => {
  const edge = perimeter(1440, 852, 12, 12)

  it('is one still line: no head, no tail, nothing that moves', () => {
    const { calls, ctx, style } = recorder()
    drawWorkLine(ctx, edge, 1)
    assert.deepEqual(calls, { stroke: 1, fill: 0, arc: 0 })
    assert.equal(style(), 'rgba(156, 130, 245, 0.07)')
  })

  it('fades with the work and draws nothing once it is gone', () => {
    const half = recorder()
    drawWorkLine(half.ctx, edge, 0.5)
    assert.equal(half.style(), 'rgba(156, 130, 245, 0.035)')
    const none = recorder()
    drawWorkLine(none.ctx, edge, 0)
    assert.equal(none.calls.stroke, 0)
  })
})

describe('the trace’s inks, in the room and on paper', () => {
  it('on paper writes in the theme’s violet and warm, laid on the page; in the room it adds light over the void', () => {
    assert.equal(inksFor(false), ROOM_INKS)
    assert.equal(inksFor(true), PAPER_INKS)
    assert.equal(PAPER_INKS.line, '109, 91, 208')
    assert.ok(PAPER_INKS.lineAlpha > ROOM_INKS.lineAlpha, 'a page needs more than the void’s 0.07')
    assert.deepEqual(PAPER_INKS.sophia, [85, 70, 184])
    assert.deepEqual(PAPER_INKS.people, [150, 83, 40])
    assert.equal(PAPER_INKS.composite, 'source-over')
    assert.equal(ROOM_INKS.composite, 'lighter')
  })
  it('strokes the room’s edge in the inks it is given', () => {
    const { ctx, style } = recorder()
    drawWorkLine(ctx, perimeter(100, 60, 4, 8), 1, PAPER_INKS)
    assert.equal(style(), 'rgba(109, 91, 208, 0.22)')
  })
})
