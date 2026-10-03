import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buddiesOf, type Cell } from './buddies.ts'

const cell = (id: string, tool: string, top = 0): Cell => ({ id, tool, top })

describe('two Claude Codes side by side', () => {
  it('look at each other: the left one to its right, the right one to its left', () => {
    const looks = buddiesOf([cell('a', 'claude-code'), cell('b', 'claude-code'), cell('c', 'codex')])
    assert.deepEqual(
      [...looks],
      [
        ['a', 'right'],
        ['b', 'left'],
      ],
    )
  })

  it('one between two greets both and leans to neither', () => {
    const looks = buddiesOf([cell('a', 'claude-code'), cell('b', 'claude-code'), cell('c', 'claude-code')])
    assert.equal(looks.get('b'), 'both')
  })

  it('only neighbours in the same row, and only Claude Code', () => {
    assert.equal(buddiesOf([cell('a', 'claude-code', 0), cell('b', 'claude-code', 160)]).size, 0) // a row apart
    assert.equal(buddiesOf([cell('a', 'claude-code'), cell('b', 'codex'), cell('c', 'claude-code')]).size, 0)
    assert.equal(buddiesOf([cell('a', 'codex'), cell('b', 'codex')]).size, 0)
  })
})
