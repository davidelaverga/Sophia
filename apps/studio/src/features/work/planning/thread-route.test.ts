import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rounded, route, type Box } from './thread-route.ts'

/** Four lanes 200 wide with 12 between them, from x = 0. */
const lanes: Box[] = [0, 1, 2, 3].map((i) => ({ left: i * 212, right: i * 212 + 200, top: 0, bottom: 600 }))
const tile = (lane: number, top: number): Box => ({ left: lane * 212, right: lane * 212 + 200, top, bottom: top + 60 })
const BAND = 24

describe('a thread between two tasks', () => {
  it('in one lane, leaves and enters by the left edges, down the gutter', () => {
    assert.deepEqual(route(tile(1, 40), tile(1, 200), lanes, BAND), [
      [212, 70],
      [202, 70],
      [202, 230],
      [212, 230],
    ])
  })

  it('between lanes side by side, runs edge to edge down the gap between them', () => {
    assert.deepEqual(route(tile(0, 40), tile(1, 200), lanes, BAND), [
      [200, 70],
      [206, 70],
      [206, 230],
      [212, 230],
    ])
    // Leftward, it leaves by the left edge and enters by the right one.
    assert.deepEqual(route(tile(2, 40), tile(1, 40), lanes, BAND), [
      [424, 70],
      [418, 70],
      [418, 70],
      [412, 70],
    ])
  })

  it('between lanes apart, climbs to the free band over the tiles and crosses there, never over a tile', () => {
    const corners = route(tile(0, 300), tile(3, 100), lanes, BAND)
    assert.deepEqual(corners, [
      [200, 330],
      [206, 330],
      [206, BAND],
      [630, BAND],
      [630, 130],
      [636, 130],
    ])
    // Every vertical leg runs in a gap, never inside a lane.
    for (const [x] of corners.slice(1, -1)) assert.ok(lanes.every((l) => x <= l.left || x >= l.right))
  })

  it('draws its corners rounded, and a straight line plainly', () => {
    assert.equal(
      rounded([
        [0, 0],
        [10, 0],
      ]),
      'M 0 0 L 10 0',
    )
    assert.match(
      rounded([
        [0, 0],
        [40, 0],
        [40, 40],
      ]),
      /^M 0 0 L 32 0 Q 40 0 40 8 L 40 40$/,
    )
  })
})
