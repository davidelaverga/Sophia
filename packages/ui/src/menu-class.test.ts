import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { itemRole, MENU, menuClass } from './menu-class.ts'

describe('menuClass', () => {
  it('is `menu` under its control at its end unless said otherwise, then the menu’s own classes', () => {
    assert.equal(menuClass(), 'menu menu-end')
    assert.equal(menuClass('bottom', 'start'), 'menu menu-start')
    assert.equal(menuClass('top', 'center', ' pass-list '), 'menu menu-top menu-center pass-list')
  })

  it('an item is a radio item only when it can be checked', () => {
    assert.equal(itemRole(undefined), 'menuitem')
    assert.equal(itemRole(false), 'menuitemradio')
    assert.equal(itemRole(true), 'menuitemradio')
  })

  it('a menu’s rows stand on the control scale, 6 px from their control', () => {
    assert.equal(MENU.row, 32)
    assert.equal(MENU.touchRow, 44)
    assert.equal(MENU.offset, 6)
    assert.equal(MENU.pad, 6)
  })
})
