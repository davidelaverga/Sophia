import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TAB_HEIGHT, tabsClass } from './tabs-class.ts'

describe('tabsClass', () => {
  it('is `tabs`, then the strip’s own classes', () => {
    assert.equal(tabsClass(), 'tabs')
    assert.equal(tabsClass(''), 'tabs')
    assert.equal(tabsClass(' sheet-tabs '), 'tabs sheet-tabs')
  })

  it('a tab strip stands on the field scale', () => {
    assert.equal(TAB_HEIGHT, 36)
  })
})
