import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SHEET, sheetClass, sheetHeadClass } from './sheet-class.ts'

describe('a sheet’s classes', () => {
  it('is `sheet`, then its own', () => {
    assert.equal(sheetClass(), 'sheet')
    assert.equal(sheetClass(''), 'sheet')
    assert.equal(sheetClass(' resource-sheet '), 'sheet resource-sheet')
  })

  it('its head is `sheet-head`, then its own', () => {
    assert.equal(sheetHeadClass(), 'sheet-head')
    assert.equal(sheetHeadClass('resource-sheet-head'), 'sheet-head resource-sheet-head')
  })
})

describe('the frame’s numbers', () => {
  it('a sheet is 420 wide, its head 36 with a 28 px Close 20 from the edge, under a veil at half', () => {
    assert.equal(SHEET.width, 420)
    assert.equal(SHEET.head, 36)
    assert.equal(SHEET.close, 28)
    assert.deepEqual(SHEET.pad, { top: 12, side: 20, bottom: 28 })
    assert.equal(SHEET.veil, 0.5)
  })
})
