import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CARD, cardClass } from './card-class.ts'

describe('cardClass', () => {
  it('is `card`, the tile and the live ones marked, then the card’s own classes', () => {
    assert.equal(cardClass(), 'card')
    assert.equal(cardClass('base', false, ' report-card '), 'card report-card')
    assert.equal(cardClass('tile', true, 'task-tile'), 'card card-tile live task-tile')
    assert.equal(cardClass('base', true), 'card live')
  })

  it('a card stands on the app’s radii, a 1 px edge, and sinks half a pixel when pressed', () => {
    assert.equal(CARD.radius, 12)
    assert.equal(CARD.tile.radius, 8)
    assert.equal(CARD.pad, 14)
    assert.deepEqual(CARD.tile.pad, [10, 12])
    assert.equal(CARD.edge, 1)
    assert.equal(CARD.sink, 0.5)
  })
})
