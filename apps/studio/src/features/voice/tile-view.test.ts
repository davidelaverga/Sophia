import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { arrivalOrder, tilesFor } from './tile-view.ts'

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

  it('then the order they came in, whatever order the list is in', () => {
    const arrived = ['i', 'g', 'e', 'c', 'a', 'b', 'd', 'f', 'h']
    const { shown, more } = tilesFor(nine, { ...nobody, arrived }, 4)
    // Shown in the list's order: the kept move only when who keeps a tile changes.
    assert.deepEqual(ids(shown), ['e', 'g', 'i'])
    assert.deepEqual(ids(more), ['a', 'b', 'c', 'd', 'f', 'h'])
  })
})

describe('arrivalOrder', () => {
  it('by when they joined, unknown last, ties by identity, whatever order LiveKit lists them in', () => {
    const people = [
      { identity: 'c', joinedAt: 30 },
      { identity: 'a' },
      { identity: 'd', joinedAt: 10 },
      { identity: 'b', joinedAt: 10 },
      { identity: '0' },
    ]
    assert.deepEqual(arrivalOrder(people), ['b', 'd', 'c', '0', 'a'])
  })
})
