import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { keyLabel, onScreen, shortcutKey, strayFrom, typesText, type KeyLike } from './shortcuts.ts'

const press = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  command: false,
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

  it('takes a key typed on the panel’s tab or buttons as stray too, but leaves Space to press them', () => {
    // Opening Chat focuses its tab: the message typed next must not close the panel (C), swap it (B) or a lens (1).
    for (const key of ['c', 'b', '1', 'h']) assert.equal(strayFrom('scope', key), true, key)
    assert.equal(strayFrom('scope', ' '), false)
    assert.equal(strayFrom('nowhere', ' '), true)
    // A control elsewhere (the dock, the lens bar) keeps its shortcuts: C there opens the chat.
    assert.equal(strayFrom('elsewhere', 'c'), false)
  })

  it('reads a command combination (⌘ on a Mac, Ctrl elsewhere), even from a field: it types nothing', () => {
    const ctrl = { ctrlKey: true, command: true }
    assert.equal(shortcutKey(press('d', ctrl)), 'mod+d')
    assert.equal(shortcutKey(press('d', { ...ctrl, typing: true })), 'mod+d')
    assert.equal(shortcutKey(press('d', { ...ctrl, stray: true })), 'mod+d')
    assert.equal(shortcutKey(press('E', { ...ctrl, shiftKey: true })), 'mod+shift+e')
    assert.equal(shortcutKey(press('d', { metaKey: true, command: true })), 'mod+d')
  })

  it('never a command with Alt, with the other modifier, on repeat, in a dialog or once handled', () => {
    for (const over of [
      { ctrlKey: true, command: true, altKey: true },
      { ctrlKey: true, command: false }, // Ctrl on a Mac, or Ctrl with ⊞ elsewhere
      { ctrlKey: true, command: true, repeat: true },
      { ctrlKey: true, command: true, inDialog: true },
      { ctrlKey: true, command: true, defaultPrevented: true },
    ]) {
      assert.equal(shortcutKey(press('d', over)), null, JSON.stringify(over))
    }
  })

  it('names a shortcut the way each platform writes it', () => {
    assert.equal(keyLabel('mod+d', false), 'Ctrl+D')
    assert.equal(keyLabel('mod+shift+e', false), 'Ctrl+Shift+E')
    assert.equal(keyLabel('mod+d', true), '⌘D')
    assert.equal(keyLabel('mod+shift+e', true), '⇧⌘E')
    assert.equal(keyLabel('c', true), 'C')
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

describe('what is on screen', () => {
  it('asks checkVisibility where the browser has it, and the element’s boxes where it doesn’t (Safari before 17.4)', () => {
    assert.equal(onScreen({ checkVisibility: () => false, getClientRects: () => [{}] }), false)
    assert.equal(onScreen({ checkVisibility: () => true, getClientRects: () => [] }), true)
    assert.equal(onScreen({ getClientRects: () => [{}] }), true)
    assert.equal(onScreen({ getClientRects: () => [] }), false, 'a hidden ancestor leaves it no box')
  })
})
