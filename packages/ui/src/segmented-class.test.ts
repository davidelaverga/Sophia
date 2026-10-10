import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextInRow } from './roving.ts'
import { itemClass, itemRole, itemState, roves, SEGMENTED_HEIGHT, segmentedClass } from './segmented-class.ts'

describe('segmentedClass', () => {
  it('is `segmented` at its own size, `sz-sm` for the small one, then its own classes', () => {
    assert.equal(segmentedClass({}), 'segmented')
    assert.equal(segmentedClass({ size: 'md' }), 'segmented')
    assert.equal(segmentedClass({ size: 'sm' }), 'segmented sz-sm')
    assert.equal(segmentedClass({ size: 'sm', className: ' report-format ' }), 'segmented sz-sm report-format')
    assert.equal(segmentedClass({ className: '' }), 'segmented')
  })

  it('stands on the field scale: 36 with 28, or 32 with 24', () => {
    assert.deepEqual(SEGMENTED_HEIGHT.md, { box: 36, press: 28 })
    assert.deepEqual(SEGMENTED_HEIGHT.sm, { box: 32, press: 24 })
  })
})

describe('a press in a segmented box', () => {
  it('is a tab, a radio or a plain pressed button, by the box’s role', () => {
    assert.equal(itemRole('tablist'), 'tab')
    assert.equal(itemRole('radiogroup'), 'radio')
    assert.equal(itemRole('group'), undefined)
  })

  it('says it is on with the attribute of its role', () => {
    assert.deepEqual(itemState('tablist', true), { 'aria-selected': true })
    assert.deepEqual(itemState('radiogroup', false), { 'aria-checked': false })
    assert.deepEqual(itemState('group', true), { 'aria-pressed': true })
  })

  it('moves with the arrows as a tab or a radio, never as a pressed button', () => {
    assert.equal(roves('tablist'), true)
    assert.equal(roves('radiogroup'), true)
    assert.equal(roves('group'), false)
  })

  it('carries `has-tip` with a tip, then its own classes, or nothing', () => {
    assert.equal(itemClass(false), undefined)
    assert.equal(itemClass(true), 'has-tip')
    assert.equal(itemClass(true, 'locked'), 'has-tip locked')
    assert.equal(itemClass(false, ' locked '), 'locked')
  })
})

describe('nextInRow', () => {
  const row = ['a', 'b', 'c'] as const
  it('moves along the row and wraps at the ends', () => {
    assert.equal(nextInRow(row, 'a', 'ArrowRight'), 'b')
    assert.equal(nextInRow(row, 'c', 'ArrowRight'), 'a')
    assert.equal(nextInRow(row, 'a', 'ArrowLeft'), 'c')
    assert.equal(nextInRow(row, 'b', 'Home'), 'a')
    assert.equal(nextInRow(row, 'b', 'End'), 'c')
  })
  it('answers nothing to another key', () => {
    assert.equal(nextInRow(row, 'a', 'Enter'), null)
    assert.equal(nextInRow(row, 'a', 'ArrowDown'), null)
  })
})
