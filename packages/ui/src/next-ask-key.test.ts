import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextAskKey, type KeyPress } from './next-ask-key.ts'

const press = (key: string, over: Partial<KeyPress> = {}): KeyPress => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  ...over,
})

describe('the next ask’s keys', () => {
  it('Tab and → accept at an empty field with a suggestion; Escape puts it away there', () => {
    assert.equal(nextAskKey(press('Tab'), '', true), 'accept')
    assert.equal(nextAskKey(press('ArrowRight'), '', true), 'accept')
    assert.equal(nextAskKey(press('Escape'), '', true), 'putAway')
  })
  it('leave every key alone without a suggestion, or once the field has words (spaces too)', () => {
    for (const key of ['Tab', 'ArrowRight', 'Escape']) {
      assert.equal(nextAskKey(press(key), '', false), null)
      assert.equal(nextAskKey(press(key), 'a', true), null)
      assert.equal(nextAskKey(press(key), ' ', true), null)
    }
  })
  it('leave a key with a modifier, or one typed while composing, alone: Shift+Tab still goes back', () => {
    assert.equal(nextAskKey(press('Tab', { shiftKey: true }), '', true), null)
    assert.equal(nextAskKey(press('Tab', { altKey: true }), '', true), null)
    assert.equal(nextAskKey(press('ArrowRight', { ctrlKey: true }), '', true), null)
    assert.equal(nextAskKey(press('Escape', { metaKey: true }), '', true), null)
    assert.equal(nextAskKey(press('Tab', { isComposing: true }), '', true), null)
  })
  it('leave other keys alone', () => {
    assert.equal(nextAskKey(press('Enter'), '', true), null)
    assert.equal(nextAskKey(press('a'), '', true), null)
  })
})
