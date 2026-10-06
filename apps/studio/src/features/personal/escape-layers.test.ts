import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { topOf } from './escape-layers.ts'

const layer = (name: string, priority = 0) => ({ name, priority })

describe('topOf', () => {
  it('asks the layer opened last', () => {
    assert.equal(topOf([layer('place'), layer('notes')])?.name, 'notes')
  })

  it('asks a layer that holds Escape, even with one opened after it (the notes, on coming back)', () => {
    assert.equal(topOf([layer('place'), layer('package', 1), layer('notes')])?.name, 'package')
  })

  it('among layers that hold it alike, the one opened last; with none open, none', () => {
    assert.equal(topOf([layer('a', 1), layer('b', 1)])?.name, 'b')
    assert.equal(topOf([]), undefined)
  })
})
