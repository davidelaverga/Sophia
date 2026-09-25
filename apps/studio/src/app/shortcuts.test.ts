import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shortcutKey, type KeyLike } from './shortcuts.ts'

const press = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  typing: false,
  inDialog: false,
  ...over,
})

describe('single-key shortcuts', () => {
  it('reads a plain letter or digit, in lowercase', () => {
    assert.equal(shortcutKey(press('M')), 'm')
    assert.equal(shortcutKey(press('2')), '2')
    assert.equal(shortcutKey(press('Escape')), null)
  })

  it('never acts while typing, with a modifier, on repeat, or once handled', () => {
    for (const over of [
      { typing: true },
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
      { repeat: true },
      { defaultPrevented: true },
    ]) {
      assert.equal(shortcutKey(press('m', over)), null, JSON.stringify(over))
    }
  })

  it('leaves keys inside a dialog to the dialog', () => {
    assert.equal(shortcutKey(press('m', { inDialog: true })), null)
  })
})
