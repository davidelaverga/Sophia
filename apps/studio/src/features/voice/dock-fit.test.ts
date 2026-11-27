import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { firstFit, fitBeside, wraps, type DockLayout } from './dock-fit.ts'

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

/** A dock that wraps in the layouts given, beside the corner (low) or with the band to itself (up). */
function beside(low: readonly DockLayout[], up: readonly DockLayout[]) {
  const tried: string[] = []
  const wrapsAs = (layout: DockLayout, cornerUp: boolean) => {
    tried.push(`${layout}${cornerUp ? ' up' : ''}`)
    return (cornerUp ? up : low).includes(layout)
  }
  return { tried, wrapsAs }
}

describe('fitBeside', () => {
  it('keeps the corner low with the words where they fit beside it', () => {
    const d = beside([], [])
    assert.deepEqual(fitBeside(d.wrapsAs), { layout: 'words', cornerUp: false })
    assert.deepEqual(d.tried, ['words'])
  })

  it('folds the dock rather than move the corner, while folded fits beside it', () => {
    assert.deepEqual(fitBeside(beside(['words', 'icons'], []).wrapsAs), { layout: 'folded', cornerUp: false })
  })

  it('sends the corner up only where even folded wraps beside it, and lays the dock out again on the whole band', () => {
    const d = beside(['words', 'icons', 'folded'], ['words'])
    assert.deepEqual(fitBeside(d.wrapsAs), { layout: 'icons', cornerUp: true })
    assert.deepEqual(d.tried, ['words', 'icons', 'folded', 'words up', 'icons up'])
  })
})
