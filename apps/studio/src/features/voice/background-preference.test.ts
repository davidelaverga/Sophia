import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { BACKGROUNDS, backgroundEffect, chosenBackground, rememberBackground } from './background-preference.ts'

function storage(): Storage {
  const kept = new Map<string, string>()
  return {
    get length() {
      return kept.size
    },
    clear: () => kept.clear(),
    getItem: (k) => kept.get(k) ?? null,
    key: (i) => [...kept.keys()][i] ?? null,
    removeItem: (k) => void kept.delete(k),
    setItem: (k, v) => void kept.set(k, v),
  }
}

/** A picture as the browser would give it: its URL. */
const picture = (id: string) => `blob:${id}`

describe('the background a person chose for their camera (call-backgrounds.md)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  })

  it('offers none, two blurs and three of Sophia’s lights, none first', () => {
    assert.deepEqual(
      BACKGROUNDS.map((b) => [b.id, b.label]),
      [
        ['none', 'None'],
        ['blur-light', 'Slight blur'],
        ['blur', 'Blur'],
        ['dusk', 'Dusk'],
        ['deep', 'Deep'],
        ['dawn', 'Dawn'],
      ],
    )
  })

  it('keeps the choice for the next call; nothing kept, or anything it doesn’t know, is none', () => {
    assert.equal(chosenBackground(), 'none')
    rememberBackground('blur')
    assert.equal(chosenBackground(), 'blur')
    localStorage.setItem('sophia.background.v1', 'sparkles')
    assert.equal(chosenBackground(), 'none')
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => {
        throw new Error('blocked')
      },
      configurable: true,
    })
    assert.equal(chosenBackground(), 'none')
    assert.doesNotThrow(() => rememberBackground('dusk'))
  })

  it('says each as the processor takes it: off, a blur of its strength, or a picture behind the person', () => {
    assert.deepEqual(backgroundEffect('none', picture), { mode: 'disabled' })
    assert.deepEqual(backgroundEffect('blur-light', picture), { mode: 'background-blur', blurRadius: 4 })
    assert.deepEqual(backgroundEffect('blur', picture), { mode: 'background-blur', blurRadius: 12 })
    assert.deepEqual(backgroundEffect('dusk', picture), { mode: 'virtual-background', imagePath: 'blob:dusk' })
  })
})
