import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buttonClass, buttonHeight, HEIGHT, SCALE, type ButtonKind, type ButtonSize } from './button-class.ts'

const KINDS: readonly ButtonKind[] = ['pill', 'primary', 'ghost', 'text', 'icon', 'warm', 'danger']
const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg']

describe('buttonClass', () => {
  it('names each kind as theme.css draws it, and no size modifier at the kind’s own size', () => {
    assert.equal(buttonClass({}), 'pill')
    assert.equal(buttonClass({ kind: 'pill', size: 'md' }), 'pill')
    assert.equal(buttonClass({ kind: 'primary' }), 'pill primary')
    assert.equal(buttonClass({ kind: 'warm' }), 'pill warm')
    assert.equal(buttonClass({ kind: 'danger' }), 'pill danger')
    assert.equal(buttonClass({ kind: 'ghost', size: 'md' }), 'ghost')
    assert.equal(buttonClass({ kind: 'icon', size: 'lg' }), 'round')
    assert.equal(buttonClass({ kind: 'text' }), 'text-button')
  })

  it('adds one modifier for a size other than the kind’s own', () => {
    assert.equal(buttonClass({ kind: 'pill', size: 'sm' }), 'pill sz-sm')
    assert.equal(buttonClass({ kind: 'primary', size: 'lg' }), 'pill primary sz-lg')
    assert.equal(buttonClass({ kind: 'ghost', size: 'sm' }), 'ghost sz-sm')
    assert.equal(buttonClass({ kind: 'ghost', size: 'lg' }), 'ghost sz-lg')
    assert.equal(buttonClass({ kind: 'icon', size: 'sm' }), 'round sz-sm')
    assert.equal(buttonClass({ kind: 'icon', size: 'md' }), 'round sz-md')
  })

  it('an inline text action is one height: a size asked of it adds nothing', () => {
    for (const size of SIZES) assert.equal(buttonClass({ kind: 'text', size }), 'text-button')
  })

  it('keeps the press’s own classes after the kit’s, and marks a tip', () => {
    assert.equal(buttonClass({ kind: 'ghost', className: 'goal-criteria-button' }), 'ghost goal-criteria-button')
    assert.equal(
      buttonClass({ kind: 'icon', size: 'sm', tip: true, className: ' hw-mic ' }),
      'round sz-sm has-tip hw-mic',
    )
    assert.equal(buttonClass({ className: '' }), 'pill')
  })
})

describe('buttonHeight', () => {
  it('every kind at every size stands on the scale 24 · 28 · 32 · 36', () => {
    for (const kind of KINDS) for (const size of SIZES) assert.ok(SCALE.includes(HEIGHT[kind][size]), `${kind} ${size}`)
  })

  it('the kind’s own size is what its class draws in theme.css', () => {
    assert.equal(buttonHeight(), 32)
    assert.equal(buttonHeight('pill'), 32)
    assert.equal(buttonHeight('ghost'), 28)
    assert.equal(buttonHeight('icon'), 36)
    assert.equal(buttonHeight('text'), 24)
    assert.equal(buttonHeight('ghost', 'sm'), 24)
    assert.equal(buttonHeight('icon', 'sm'), 28)
  })
})
