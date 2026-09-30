import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shortcutKey, typesText, type KeyLike } from './shortcuts.ts'

const press = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  typing: false,
  inDialog: false,
  stray: false,
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

  it('never acts on stray typing: with a chat bar on screen and the focus nowhere, a letter is text', () => {
    // "v" would turn the camera on, "m" the microphone, "s" would open the screen picker
    for (const key of ['v', 'm', 's', 'j', 'c', '1']) assert.equal(shortcutKey(press(key, { stray: true })), null, key)
  })

  it('knows a key that types a character from one that commands', () => {
    assert.equal(typesText(press('v')), true)
    assert.equal(typesText(press(' ')), true)
    assert.equal(typesText(press('V')), true)
    assert.equal(typesText(press('Enter')), false)
    assert.equal(typesText(press('Escape')), false)
    assert.equal(typesText(press('v', { ctrlKey: true })), false)
    assert.equal(typesText(press('v', { metaKey: true })), false)
  })
})
