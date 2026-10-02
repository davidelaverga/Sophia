import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { alive, effortLook, effortStyle } from './effort.ts'

describe('a session’s effort', () => {
  it('takes its place on one scale, the tools’ top levels (max, ultra) at its end', () => {
    assert.deepEqual(effortLook('low'), { label: 'Low', rank: 1, top: false })
    assert.deepEqual(effortLook('xhigh'), { label: 'Extra high', rank: 4, top: false })
    assert.deepEqual(effortLook('max'), { label: 'Max', rank: 5, top: true })
    assert.deepEqual(effortLook('ULTRA'), { label: 'Ultra', rank: 5, top: true })
  })

  it('keeps a word it doesn’t know, with no place on the scale', () => {
    assert.deepEqual(effortLook('turbo'), { label: 'turbo', rank: null, top: false })
  })

  it('looks as each tool draws it: Claude’s dots, GPT’s gradient, a plain bar for the rest', () => {
    assert.equal(effortStyle('claude-code'), 'claude')
    assert.equal(effortStyle('codex'), 'gpt')
    assert.equal(effortStyle('gemini-cli'), 'plain')
    assert.equal(effortStyle('grok'), 'plain')
  })

  it('comes alive as each tool’s own does: Claude in ultracode whatever its level, GPT at ultra, others never', () => {
    assert.equal(alive('claude', effortLook('high'), 'ultracode'), true)
    assert.equal(alive('claude', effortLook('max'), null), false) // max is a level, not ultracode
    assert.equal(alive('gpt', effortLook('ultra'), null), true)
    assert.equal(alive('gpt', effortLook('high'), null), false)
    assert.equal(alive('plain', effortLook('max'), 'ultracode'), false)
  })
})
