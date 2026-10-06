import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tilesFor } from './tile-view.ts'

const person = (identity: string, over: { speaking?: boolean; local?: boolean } = {}) => ({
  identity,
  speaking: over.speaking ?? false,
  local: over.local ?? false,
})
const ids = (list: readonly { identity: string }[]) => list.map((p) => p.identity)
const nobody = { floor: null, showing: null, spokeAt: new Map<string, number>() }
const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => person(id))

describe('tilesFor', () => {
  it('under the cap, everyone, in the order they came, and nobody past it', () => {
    const { shown, more } = tilesFor(nine.slice(0, 4), nobody, 4)
    assert.deepEqual(ids(shown), ['a', 'b', 'c', 'd'])
    assert.deepEqual(more, [])
  })

  it('past the cap, one tile fewer and the rest as more', () => {
    const { shown, more } = tilesFor(nine, nobody, 4)
    assert.deepEqual(ids(shown), ['a', 'b', 'c'])
    assert.deepEqual(ids(more), ['d', 'e', 'f', 'g', 'h', 'i'])
  })

  it('the floor, the one showing, whoever speaks and you keep a tile, in the order they came', () => {
    const people = [...nine.slice(0, 6), person('g', { speaking: true }), person('h', { local: true }), person('i')]
    const { shown } = tilesFor(people, { floor: 'f', showing: 'e', spokeAt: new Map() }, 4)
    assert.deepEqual(ids(shown), ['e', 'f', 'g'])
    const withYou = tilesFor(people, { floor: 'f', showing: null, spokeAt: new Map() }, 5)
    assert.deepEqual(ids(withYou.shown), ['f', 'g', 'h', 'a'].toSorted())
  })

  it('then whoever spoke most recently', () => {
    const spokeAt = new Map([
      ['i', 30],
      ['c', 20],
      ['h', 10],
    ])
    const { shown } = tilesFor(nine, { floor: null, showing: null, spokeAt }, 4)
    assert.deepEqual(ids(shown), ['c', 'h', 'i'])
  })
})
