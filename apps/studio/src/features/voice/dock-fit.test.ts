import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { firstFit, wraps, type DockLayout } from './dock-fit.ts'

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

/** A dock that wraps in the layouts given, and the layouts it was tried in. */
const dock = (wrapping: readonly DockLayout[]) => {
  const tried: DockLayout[] = []
  const wrapsAs = (layout: DockLayout) => {
    tried.push(layout)
    return wrapping.includes(layout)
  }
  return { tried, wrapsAs }
}

describe('firstFit', () => {
  it('keeps the words where they fit, and tries nothing else', () => {
    const d = dock([])
    assert.equal(firstFit(d.wrapsAs), 'words')
    assert.deepEqual(d.tried, ['words'])
  })

  it('gives the words up for icons where only the icons fit', () => {
    assert.equal(firstFit(dock(['words']).wrapsAs), 'icons')
  })

  it('folds the extras behind More controls where even the icons would wrap, without reading the fold', () => {
    const d = dock(['words', 'icons', 'folded'])
    assert.equal(firstFit(d.wrapsAs), 'folded')
    assert.deepEqual(d.tried, ['words', 'icons'])
  })
})
