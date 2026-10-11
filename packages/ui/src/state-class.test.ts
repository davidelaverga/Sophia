import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyClass, skeletonClass, STATES } from './state-class.ts'

describe('skeletonClass', () => {
  it('is `skeleton`, its kind when not loose bars, then its host’s classes', () => {
    assert.equal(skeletonClass(), 'skeleton')
    assert.equal(skeletonClass('bars', ' goal-skeleton '), 'skeleton goal-skeleton')
    assert.equal(skeletonClass('card', 'resource-grid'), 'skeleton skeleton-card resource-grid')
    assert.equal(skeletonClass('row'), 'skeleton skeleton-row')
  })

  it('a skeleton’s light passes once per 1.6 s, each shape 80 ms after the last', () => {
    assert.equal(STATES.skeleton.light, 1600)
    assert.equal(STATES.skeleton.stagger, 80)
    assert.deepEqual([STATES.skeleton.bar, STATES.skeleton.title], [10, 14])
  })
})

describe('emptyClass', () => {
  it('is `empty`, a slot when said, then the state’s own classes', () => {
    assert.equal(emptyClass(), 'empty')
    assert.equal(emptyClass(true, 'lane-empty'), 'empty empty-slot lane-empty')
    assert.equal(emptyClass(false, 'ps-empty'), 'empty ps-empty')
  })

  it('an empty state’s sentence starts 18 px under the rule, where the first row would', () => {
    assert.deepEqual(STATES.empty.pad, [18, 24])
    assert.equal(STATES.empty.gap, 14)
    assert.equal(STATES.empty.slot, 56)
  })
})
