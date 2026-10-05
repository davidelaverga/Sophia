import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CaptionTurn } from '../conversation/captions.ts'
import { captionEnd, newSince, saidKey, saidSoFar, stageCaptions } from './stage-captions.ts'

const turn = (id: string, text: string, over: Partial<CaptionTurn> = {}): CaptionTurn => ({
  id,
  exchangeId: 'e',
  speaker: 'member',
  actorId: 'marco',
  parts: [{ sequence: 1, text }],
  state: 'final',
  end: 1,
  at: 1,
  ...over,
})

const label = (actorId: string) => (actorId === 'me' ? 'You' : 'Marco')

describe('stage captions', () => {
  it('shows the last two said, newest last, the earlier one older', () => {
    const shown = stageCaptions([turn('a', 'One'), turn('b', 'Two'), turn('c', 'Three')], label)
    assert.deepEqual(
      shown.map((c) => [c.words, c.older]),
      [
        ['Two', true],
        ['Three', false],
      ],
    )
  })

  it('names Sophia as Sophia and a member the chat’s way', () => {
    const shown = stageCaptions(
      [turn('a', 'Hi', { speaker: 'sophia', actorId: null }), turn('b', 'Yes', { actorId: 'me' })],
      label,
    )
    assert.deepEqual(
      shown.map((c) => [c.who, c.sophia]),
      [
        ['Sophia', true],
        ['You', false],
      ],
    )
  })

  it('leaves out a caption with no words yet', () => {
    const shown = stageCaptions([turn('a', 'Said'), turn('b', '', { state: 'partial', end: null })], label)
    assert.deepEqual(
      shown.map((c) => c.words),
      ['Said'],
    )
    assert.equal(shown[0]?.older, false)
  })

  it('keeps how far each has been said', () => {
    assert.equal(stageCaptions([turn('a', 'Mid', { state: 'partial', end: null })], label)[0]?.said, 'partial')
  })
})

describe('a long caption on the stage', () => {
  it('shows a short one whole', () => {
    assert.equal(captionEnd('Short words', 20), 'Short words')
  })

  it('shows the end of a long one, from a word, after an ellipsis', () => {
    assert.equal(captionEnd('one two three four five six', 12), '…five six')
  })

  it('cuts inside a word only when no word starts near the cut', () => {
    assert.equal(captionEnd('abcdefghijklmnopqrstuvwxyz', 6), '…uvwxyz')
  })
})

describe('the chat’s order on the stage', () => {
  it('puts a caption placed before another above it, whatever came first', () => {
    const reply = turn('reply', 'Her reply', { at: 2 })
    const question = turn('question', 'His question', { at: 1.5 })
    assert.deepEqual(
      stageCaptions([reply, question], label).map((c) => c.words),
      ['His question', 'Her reply'],
    )
  })
})

describe('what was said so far', () => {
  const a = turn('a', 'One', { state: 'partial', end: null })
  const more = { ...a, parts: [...a.parts, { sequence: 2, text: ' two' }] }
  const ended = { ...more, state: 'final' as const, end: 2 }

  it('changes with more words, an end, or a new caption, wherever it is', () => {
    const keys = [[], [a], [a], [more], [ended], [ended, turn('b', 'B')], [more, turn('b', 'B')]].map((t) =>
      saidKey(saidSoFar(t)),
    )
    assert.equal(new Set(keys).size, 6)
    assert.equal(keys[1], keys[2])
  })

  it('once they went, only captions that said something since come back', () => {
    const gone = saidSoFar([a, turn('b', 'B')])
    assert.deepEqual(
      newSince([more, turn('b', 'B'), turn('c', 'C')], gone).map((t) => t.id),
      ['a', 'c'],
    )
    assert.deepEqual(
      newSince([a, turn('b', 'B')], null).map((t) => t.id),
      ['a', 'b'],
    )
  })
})
