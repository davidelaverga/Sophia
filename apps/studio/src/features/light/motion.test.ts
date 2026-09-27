import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bezier, controlThrough, easeInOut, handoffFrame, spring, stepSpring } from './motion.ts'

describe('light motion', () => {
  it('settles a spring on its target without overshoot', () => {
    const s = spring(0, 6)
    s.target = 1
    let max = 0
    for (let i = 0; i < 240; i++) {
      stepSpring(s, 1 / 60)
      max = Math.max(max, s.value)
    }
    assert.ok(Math.abs(s.value - 1) < 1e-4)
    assert.ok(max <= 1 + 1e-9)
  })

  it('gives the same result for one long step and many short ones', () => {
    const a = spring(0, 3)
    const b = spring(0, 3)
    a.target = b.target = 1
    stepSpring(a, 0.5)
    for (let i = 0; i < 50; i++) stepSpring(b, 0.01)
    assert.ok(Math.abs(a.value - b.value) < 1e-9)
  })

  it('passes the floor exactly through Sophia at the midpoint', () => {
    const a = { x: 40, y: 300 }
    const via = { x: 500, y: 260 }
    const b = { x: 960, y: 310 }
    const mid = bezier(a, controlThrough(a, via, b), b, 0.5)
    assert.ok(Math.abs(mid.x - via.x) < 1e-9 && Math.abs(mid.y - via.y) < 1e-9)
  })

  it('eases from start to end and swells while passing through Sophia', () => {
    assert.deepEqual([easeInOut(0), easeInOut(0.5), easeInOut(1)], [0, 0.5, 1])
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const via = { x: 50, y: -20 }
    assert.ok(handoffFrame(a, via, b, 0.8, 1.6).swell > 0.99)
    assert.ok(handoffFrame(a, via, b, 0, 1.6).swell < 0.01)
    assert.equal(handoffFrame(a, via, b, 5, 1.6).progress, 1)
  })
})
