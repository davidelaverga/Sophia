import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { ChatCaption } from '@sophia/contracts/room-chat'
import { captionText, closeCaptions, receiveCaption, type CaptionTurn } from './captions.ts'

const ID = '55555555-5555-4555-8555-555555555555'
const SOPHIA = '66666666-6666-4666-8666-666666666666'
const packet = (sequence: number, text: string, over: Partial<ChatCaption> = {}): ChatCaption => ({
  kind: 'caption',
  id: ID,
  exchangeId: 'e',
  speaker: 'member',
  actorId: 'me',
  sequence,
  state: 'partial',
  text,
  ...over,
})
const fold = (packets: ChatCaption[], from: CaptionTurn[] = []) =>
  packets.reduce((turns, p, i) => receiveCaption(turns, p, i + 1), from)

it('partials grow a caption in place until its end; a repeat changes nothing (CX-0023)', () => {
  const partial = fold([packet(1, 'Synthetic'), packet(2, ' spoken')])
  assert.equal(partial.length, 1)
  assert.deepEqual(
    [captionText(partial[0] as CaptionTurn), partial[0]?.state, partial[0]?.at],
    ['Synthetic spoken', 'partial', 1],
  )
  assert.equal(receiveCaption(partial, packet(2, ' spoken'), 9), partial, 'the same list: nothing renders again')
  const final = fold([packet(3, ' words', { state: 'final' })], partial)
  assert.deepEqual([captionText(final[0] as CaptionTurn), final[0]?.state], ['Synthetic spoken words', 'final'])
  assert.equal(receiveCaption(final, packet(4, ' late'), 9), final, 'nothing after its end belongs to it')
  assert.equal(receiveCaption(final, packet(4, '', { state: 'interrupted' }), 9), final, 'an end is never taken back')
})

it('reads fragments in order, whatever order they came in, and shows where one never came', () => {
  const late = fold([packet(1, 'One'), packet(3, ' three'), packet(2, ' two')])
  assert.equal(captionText(late[0] as CaptionTurn), 'One two three')
  const gap = fold([packet(2, 'two'), packet(4, 'four'), packet(6, '', { state: 'interrupted' })])
  assert.equal(captionText(gap[0] as CaptionTurn), '… two … four …')
  assert.equal(gap[0]?.state, 'interrupted')
  const filled = receiveCaption(gap, packet(5, ' five'), 9)
  assert.equal(captionText(filled[0] as CaptionTurn), '… two … four five', 'one below the end fills its gap')
})

it('a caption opened after the one it precedes takes the place just before it', () => {
  const reply = fold([packet(1, 'An answer', { id: SOPHIA, speaker: 'sophia', actorId: null })])
  const both = receiveCaption(reply, packet(1, 'The question', { before: SOPHIA }), 5)
  assert.deepEqual(
    both.map((t) => [t.speaker, t.at]),
    [
      ['sophia', 1],
      ['member', 0.5],
    ],
  )
})

it('ignores an end whose words never came, and another exchange under a known id', () => {
  assert.deepEqual(fold([packet(3, '', { state: 'final' })]), [])
  const one = fold([packet(1, 'Words')])
  assert.equal(receiveCaption(one, packet(2, ' more', { exchangeId: 'other' }), 2), one)
})

it('is bounded: 100 captions, and a caption stops growing at 4000 characters', () => {
  const many = Array.from({ length: 105 }, (_, i) =>
    packet(1, 'x', { id: `${String(i).padStart(8, '0')}-5555-4555-8555-555555555555` }),
  )
  assert.equal(fold(many).length, 100)
  const long = fold([packet(1, 'y'.repeat(3990)), packet(2, 'z'.repeat(20)), packet(3, 'w')])
  assert.equal(captionText(long[0] as CaptionTurn), `${'y'.repeat(3990)} … w`)
})

it('the call ending cuts off what was still being said, and only that', () => {
  const turns = fold([packet(1, 'Open'), packet(1, 'Done', { id: SOPHIA, speaker: 'sophia', state: 'final' })])
  const closed = closeCaptions(turns)
  assert.deepEqual(
    closed.map((t) => t.state),
    ['interrupted', 'final'],
  )
  assert.equal(closeCaptions(closed), closed)
})
