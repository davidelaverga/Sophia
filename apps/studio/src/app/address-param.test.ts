import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { paramIn, withParam } from './address-param.ts'

const PANELS = ['chat', 'people', 'brief'] as const

describe('what a view keeps in the address’s query (focus-kept.md)', () => {
  it('reads a value it knows, and nothing for one it doesn’t', () => {
    assert.equal(paramIn('?lens=build&panel=people', 'panel', PANELS), 'people')
    assert.equal(paramIn('?panel=everything', 'panel', PANELS), null)
    assert.equal(paramIn('', 'panel', PANELS), null)
  })

  it('sets and drops its own key, keeping the lens and the report beside it', () => {
    assert.equal(withParam('?lens=build', 'panel', 'chat'), '?lens=build&panel=chat')
    assert.equal(withParam('?lens=build&panel=chat', 'panel', 'brief'), '?lens=build&panel=brief')
    assert.equal(withParam('?report=r1&panel=chat', 'panel', null), '?report=r1')
    assert.equal(withParam('?panel=chat', 'panel', null), '')
    assert.equal(withParam('', 'invite', 'members'), '?invite=members')
  })
})
