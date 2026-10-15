import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { encodeReaction, paced, parseReaction, REACTIONS, shownAfter } from './reactions.ts'

describe('reactions in the call (call-reactions.md)', () => {
  it('offers Meet’s six, each named', () => {
    assert.deepEqual(
      REACTIONS.map((r) => [r.emoji, r.name]),
      [
        ['👍', 'Thumbs up'],
        ['❤️', 'Heart'],
        ['😂', 'Laugh'],
        ['🎉', 'Celebrate'],
        ['👏', 'Clap'],
        ['😮', 'Surprised'],
      ],
    )
  })

  it('travels as a small packet, and reads back only one of the six', () => {
    assert.equal(parseReaction(encodeReaction('🎉')), '🎉')
    const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    assert.equal(parseReaction(raw({ kind: 'reaction', emoji: '💣' })), null, 'not one of the six')
    assert.equal(parseReaction(raw({ kind: 'reaction', emoji: '<img src=x>' })), null)
    assert.equal(parseReaction(raw({ kind: 'chat', emoji: '👍' })), null)
    assert.equal(parseReaction(new TextEncoder().encode('{not json')), null)
  })

  it('goes at most one every 400 ms from here, so a held key never floods the room', () => {
    assert.equal(paced(1000, null), true)
    assert.equal(paced(1300, 1000), false)
    assert.equal(paced(1400, 1000), true)
  })

  it('keeps the newest twelve on screen', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: String(i) }))
    assert.deepEqual(
      shownAfter(many.slice(0, 13), { id: '13' }).map((r) => r.id),
      many.slice(2).map((r) => r.id),
    )
  })
})
