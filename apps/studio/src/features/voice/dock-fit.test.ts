import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { wraps } from './dock-fit.ts'

const box = (top: number, height: number) => ({ top, bottom: top + height })

describe('wraps', () => {
  it('reads controls of different heights centred on one line as one row', () => {
    assert.equal(wraps([box(700, 36), box(708, 20), box(700, 36), box(710, 16)]), false)
  })

  it('reads a control that starts under the others as a second row', () => {
    assert.equal(wraps([box(700, 36), box(708, 20), box(740, 36)]), true)
  })

  it('says nothing wraps with one control or none', () => {
    assert.equal(wraps([]), false)
    assert.equal(wraps([box(700, 36)]), false)
  })
})
