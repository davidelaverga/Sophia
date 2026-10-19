import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ATTACK_S,
  bezier,
  controlThrough,
  easeInOut,
  envelope,
  handoffFrame,
  HEAR_ATTACK_S,
  HEAR_RELEASE_S,
  RELEASE_S,
  settle,
  spring,
  stepSpring,
} from './motion.ts'

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

  it('settles at once on its target and stays there, however it was moving', () => {
    const s = spring(0, 3.2)
    s.target = 190
    stepSpring(s, 0.1)
    assert.ok(s.value > 0 && s.value < 190 && s.velocity > 0, 'mid-flight, as after a layout change')
    settle(s)
    assert.deepEqual([s.value, s.velocity], [190, 0])
    stepSpring(s, 1 / 60)
    assert.ok(Math.abs(s.value - 190) < 1e-9, 'no drift once settled')
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

describe('her voice’s envelope (docs/plans/voice-amplitude.md)', () => {
  it('rises fast: a time constant of 30 ms, all but there by 150 ms', () => {
    assert.equal(ATTACK_S, 0.03)
    assert.ok(Math.abs(envelope(0, 1, 0.03) - (1 - Math.exp(-1))) < 1e-9)
    assert.ok(envelope(0, 1, 0.15) >= 0.993)
  })
  it('falls slower: a time constant of 180 ms, all but quiet by 0.83 s', () => {
    assert.equal(RELEASE_S, 0.18)
    assert.ok(Math.abs(envelope(1, 0, 0.18) - Math.exp(-1)) < 1e-9)
    assert.ok(envelope(1, 0, 0.83) < 0.01)
    assert.ok(1 - envelope(1, 0, 0.05) < envelope(0, 1, 0.05))
  })
  it('is the same at any frame rate, and still when no time passed', () => {
    let fine = 0
    for (let i = 0; i < 6; i++) fine = envelope(fine, 0.8, 0.005)
    assert.ok(Math.abs(envelope(0, 0.8, 0.03) - fine) < 1e-12)
    assert.equal(envelope(0.4, 1, 0), 0.4)
  })
})

describe('what she hears, by its own slower envelope (docs/plans/orb-hears.md)', () => {
  it('rises over 120 ms and falls over 450 ms: receiving reads calmer than her own voice', () => {
    assert.deepEqual([HEAR_ATTACK_S, HEAR_RELEASE_S], [0.12, 0.45])
    assert.ok(Math.abs(envelope(0, 1, 0.12, HEAR_ATTACK_S, HEAR_RELEASE_S) - (1 - Math.exp(-1))) < 1e-9)
    assert.ok(Math.abs(envelope(1, 0, 0.45, HEAR_ATTACK_S, HEAR_RELEASE_S) - Math.exp(-1)) < 1e-9)
    assert.ok(envelope(0, 1, 0.05, HEAR_ATTACK_S, HEAR_RELEASE_S) < envelope(0, 1, 0.05))
  })
})
