import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FRAGMENT_SHADER } from './shader.ts'
import { paperHalo, shapeOf, WORK } from './shape.ts'

// Her light's shape (docs/plans/light-room-paper.md; informe-25 X1, X2): busy, never out; the canvas and the paper halo
// read the same springs.

const still = { work: 0, think: 0, speak: 0, amp: 0, swell: 0, ignite: 1, dirX: 0, dirY: 0, lean: 0 }
const at = { x: 266.4, y: 325.6, radius: 155.7 }

describe('her light’s shape', () => {
  it('stays lit while work runs: a little narrower, three quarters as strong', () => {
    const busy = shapeOf({ ...still, work: 1 })
    assert.ok(busy.strength >= 0.75, String(busy.strength))
    assert.ok(busy.size >= 0.85, String(busy.size))
  })

  it('is what the canvas draws: the shader carries the same numbers', () => {
    assert.ok(FRAGMENT_SHADER.includes(`mix(1.0, ${WORK.size.toFixed(2)}, u_work)`))
    assert.ok(FRAGMENT_SHADER.includes(`(1.0 - ${(1 - WORK.energy).toFixed(2)} * u_work)`))
    assert.ok(FRAGMENT_SHADER.includes(`u_work * ${WORK.ember.toFixed(2)})`))
    assert.doesNotMatch(FRAGMENT_SHADER, /mix\(1\.0, 0\.6, u_work\)|0\.7 \* u_work/)
  })

  it('gives the paper halo where she is, her radius, how large and how strong', () => {
    assert.deepEqual(paperHalo({ ...still, ...at }), {
      '--lx': '266px',
      '--ly': '326px',
      '--lr': '156px',
      '--ls': '1',
      '--le': '1',
      '--ldx': '0',
      '--ldy': '0',
    })
    const of = (over: Partial<typeof still>) => paperHalo({ ...still, ...at, ...over })
    assert.deepEqual([of({ work: 1 })['--ls'], of({ work: 1 })['--le']], ['0.9', '0.75'])
    assert.equal(of({ think: 1 })['--le'], '0.78')
    // Never brighter than its ink: paper can't be lighter than white.
    assert.deepEqual([of({ swell: 1 })['--ls'], of({ swell: 1 })['--le']], ['1.16', '1'])
    assert.equal(of({ ignite: 0.42 })['--ls'], '0.42')
  })

  it('gives the paper orb whom she attends to: her direction times how far she leans (docs/plans/paper-orb.md)', () => {
    const of = (over: Partial<typeof still>) => paperHalo({ ...still, ...at, ...over })
    assert.deepEqual(
      [of({ dirX: -0.8, dirY: 0.25, lean: 1 })['--ldx'], of({ dirX: -0.8, dirY: 0.25, lean: 1 })['--ldy']],
      ['-0.8', '0.25'],
    )
    // At rest she leans a fifth as far; not leaning, no direction.
    assert.equal(of({ dirX: -0.8, lean: 0.2 })['--ldx'], '-0.16')
    assert.deepEqual([of({ dirX: 0.9, lean: 0 })['--ldx'], of({ dirY: -0.5, lean: 0 })['--ldy']], ['0', '0'])
  })
})
