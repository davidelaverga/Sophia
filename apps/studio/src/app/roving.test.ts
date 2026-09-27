import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextInRow } from './roving.ts'

describe('moving across a row of tabs', () => {
  const row = ['a', 'b', 'c'] as const

  it('steps with the arrows and wraps at the ends', () => {
    assert.equal(nextInRow(row, 'a', 'ArrowRight'), 'b')
    assert.equal(nextInRow(row, 'c', 'ArrowRight'), 'a')
    assert.equal(nextInRow(row, 'a', 'ArrowLeft'), 'c')
  })

  it('jumps to the ends, and ignores every other key', () => {
    assert.equal(nextInRow(row, 'b', 'Home'), 'a')
    assert.equal(nextInRow(row, 'b', 'End'), 'c')
    assert.equal(nextInRow(row, 'b', 'Enter'), null)
  })
})
