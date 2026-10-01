import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { drawWorkLine, perimeter } from './trace.ts'

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
