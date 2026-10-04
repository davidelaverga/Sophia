import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aimFor,
  APPEAR_AFTER_MS,
  barAt,
  exitFor,
  flight,
  follow,
  laterStage,
  STAGES,
  underWay,
} from './entry-progress.ts'

describe('the opening’s bar', () => {
  it('stands further on with each step done, and full only when all is ready', () => {
    const at = STAGES.map(barAt)
    assert.deepEqual(
      at,
      at.toSorted((a, b) => a - b),
    )
    assert.equal(new Set(at).size, STAGES.length)
    assert.equal(barAt('ready'), 1)
  })

  it('while a step runs, moves on towards the next one, ever slower, never reaching it', () => {
    for (const [i, stage] of STAGES.entries()) {
      if (stage === 'ready') continue
      const next = barAt(STAGES[i + 1] ?? 'ready')
      assert.equal(aimFor(stage, 0), barAt(stage), stage)
      const soon = aimFor(stage, 800)
      const later = aimFor(stage, 1600)
      assert.ok(soon > barAt(stage) && later > soon && aimFor(stage, 60_000) < next, stage)
      assert.ok(later - soon < soon - barAt(stage), `${stage} slows down`)
    }
    assert.equal(aimFor('ready', 500), 1)
  })

  it('follows where it should be smoothly: part of the way each frame, never past it, never back', () => {
    const next = follow(0.2, 0.6, 16)
    assert.ok(next > 0.2 && next < 0.3)
    assert.ok(follow(0.2, 0.6, 1000) < 0.6)
    // A frame the device was late for moves it no further than a short one would: no jump after a hitch.
    assert.equal(follow(0.2, 0.6, 1000), follow(0.2, 0.6, 34))
    assert.equal(follow(0.5, 0.3, 16), 0.5)
  })

  it('never goes back a step: one asked for again, or an earlier one, keeps the later', () => {
    assert.equal(laterStage('session', 'app'), 'session')
    assert.equal(laterStage('app', 'space'), 'space')
    assert.equal(laterStage('ready', 'page'), 'ready')
  })

  it('says the work under way: signing in, then the space, then the projects', () => {
    assert.equal(underWay('app'), 'Signing you in')
    assert.equal(underWay('session'), 'Opening your space')
    assert.equal(underWay('space'), 'Getting your projects ready')
  })
})

describe('how the opening leaves', () => {
  it('a load ready before it showed leaves nothing to see', () => {
    assert.equal(exitFor({ shownFor: APPEAR_AFTER_MS - 1, reduced: false, flyTo: true }), 'none')
  })

  it('flies into the corner lockup when there is one, else dissolves; a fade under less motion', () => {
    assert.equal(exitFor({ shownFor: 900, reduced: false, flyTo: true }), 'fly')
    assert.equal(exitFor({ shownFor: 900, reduced: false, flyTo: false }), 'dissolve')
    assert.equal(exitFor({ shownFor: 900, reduced: true, flyTo: true }), 'fade')
    // Onto anything but the Studio (a link that failed): a quick fade, no arrival held in front of it.
    assert.equal(exitFor({ shownFor: 900, reduced: false, flyTo: true, quick: true }), 'fade')
  })

  it('a flight lands the mark’s centre on the corner mark’s, at its size', () => {
    const from = { x: 592, y: 288, width: 96, height: 96 }
    const to = { x: 20, y: 18, width: 16, height: 16 }
    assert.deepEqual(flight(from, to), { x: 28 - 640, y: 26 - 336, scale: 1 / 6 })
  })
})
