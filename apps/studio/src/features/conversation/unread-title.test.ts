import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DiscussionEntry } from '@sophia/contracts'
import { awayWords, dividerAt, nextUnseen, reachedAway, withUnseen, type Unseen } from './unread-title.ts'

const entry = (id: string, actorId: string, origin: DiscussionEntry['origin'] = 'composer'): DiscussionEntry => ({
  id,
  actorId,
  intent: 'discuss',
  origin,
  text: 'words',
  sourceId: 's',
  sha256: 'h',
  createdAt: '2026-10-16T10:00:00Z',
})

test('counts the typed messages not seen, never the viewer’s own nor a voice turn', () => {
  const entries = [entry('a', 'marco'), entry('b', 'marco'), entry('c', 'me'), entry('d', 'lucia', 'voice')]
  assert.equal(withUnseen(new Map(), entries, new Set(['a']), 'me').size, 1)
  assert.equal(withUnseen(new Map(), entries, new Set(), null).size, 3)
  assert.equal(withUnseen(new Map(), entries, new Set(['a', 'b', 'c', 'd']), 'me').size, 0)
})

test('a message rolled out of the snapshot’s 50 still counts (Codex P2 on #418)', () => {
  const first = withUnseen(new Map(), [entry('a', 'marco')], new Set(), 'me')
  const window = Array.from({ length: 50 }, (_, i) => entry(`n${String(i)}`, 'marco'))
  assert.equal(withUnseen(first, window, new Set(), 'me').size, 51)
})

test('nothing new gives the same set back, so a refresh alone renders nothing', () => {
  const counted = withUnseen(new Map(), [entry('a', 'marco'), entry('b', 'marco')], new Set(), 'me')
  assert.equal(withUnseen(counted, [entry('b', 'marco'), entry('c', 'me')], new Set(), 'me'), counted)
})

test('the viewer’s own message, counted before their membership was read, leaves the count once it is (Codex P2 on #444)', () => {
  const entries = [entry('a', 'marco'), entry('c', 'me')]
  const before = withUnseen(new Map(), entries, new Set(), null)
  assert.equal(before.size, 2, 'who the viewer is isn’t known yet: both count')
  assert.equal(withUnseen(before, entries, new Set(), 'me').size, 1, 'known now, their own goes')
  assert.equal(withUnseen(before, [entry('d', 'marco')], new Set(), 'me').size, 2, 'even once it left the snapshot')
})

// What came while the tab was hidden, said once it is shown again (docs/plans/messages-while-away.md, seam #10).

/** The discussion read in turn, each read with whether the tab was hidden. */
const reads = (steps: ReadonlyArray<readonly [readonly DiscussionEntry[], boolean]>, me: string | null = 'me') =>
  steps.reduce<Unseen | null>((was, [entries, hidden]) => nextUnseen(was, entries, hidden, me), null)

const before = [entry('o', 'marco')]
const after = [...before, entry('a', 'marco'), entry('b', 'lucia')]
/** Shown, hidden, two messages from others, shown again. */
const back = () =>
  reads([
    [before, false],
    [before, true],
    [after, true],
    [after, false],
  ])!

test('counted in the order they came, across refreshes: the first counted is the earliest (seam #10)', () => {
  const first = withUnseen(new Map(), [entry('m', 'me'), entry('a', 'marco')], new Set(), null)
  const later = withUnseen(first, [entry('m', 'me'), entry('a', 'marco'), entry('b', 'lucia')], new Set(), null)
  assert.deepEqual([...later.keys()], ['m', 'a', 'b'])
  // The viewer known now, their own leaves, and the others keep their order.
  assert.deepEqual([...withUnseen(later, [entry('c', 'me')], new Set(), 'me').keys()], ['a', 'b'])
})

test('shown again, what was counted came while away, the first first; the title’s count goes', () => {
  const shown = back()
  assert.deepEqual(shown.away, { ids: ['a', 'b'], reached: false })
  assert.equal(shown.counted.size, 0)
})

test('a message while the tab is shown never came while away', () => {
  assert.equal(
    reads([
      [before, false],
      [after, false],
    ])!.away,
    null,
  )
  // Nor one that comes after the absence was said.
  const later = nextUnseen(back(), [...after, entry('c', 'marco')], false, 'me')
  assert.deepEqual(later.away, { ids: ['a', 'b'], reached: false })
})

test('hidden and shown with nothing new adds nothing: none stays none, a reached one stays reached', () => {
  assert.equal(
    reads([
      [before, false],
      [before, true],
      [before, false],
    ])!.away,
    null,
  )
  const reached = { ...back(), away: reachedAway(back().away, 'a') }
  const again = nextUnseen(nextUnseen(reached, after, true, 'me'), after, false, 'me')
  assert.deepEqual(again.away, { ids: ['a', 'b'], reached: true })
})

test('an absence before the last was reached adds to it; after a reached one it starts anew', () => {
  const more = [...after, entry('c', 'marco')]
  const twice = nextUnseen(nextUnseen(back(), more, true, 'me'), more, false, 'me')
  assert.deepEqual(twice.away, { ids: ['a', 'b', 'c'], reached: false })
  const reached = { ...back(), away: reachedAway(back().away, 'a') }
  const anew = nextUnseen(nextUnseen(reached, more, true, 'me'), more, false, 'me')
  assert.deepEqual(anew.away, { ids: ['c'], reached: false })
})

test('reaching another absence’s first changes nothing', () => {
  const away = { ids: ['c'], reached: false }
  assert.equal(reachedAway(away, 'a'), away)
  assert.deepEqual(reachedAway(away, 'c'), { ids: ['c'], reached: true })
  assert.equal(reachedAway(null, 'c'), null)
})

test('the words count as the Studio counts, one in the singular', () => {
  assert.equal(awayWords(2), '2 messages came while you were away')
  assert.equal(awayWords(1), '1 message came while you were away')
})

test('the divider goes above the first drawn among those counted', () => {
  const drawn = [entry('o', 'marco'), entry('b', 'marco'), entry('c', 'lucia')]
  assert.equal(dividerAt({ ids: ['a', 'b', 'c'], reached: false }, drawn), 'b', 'the first rolled out of the 50')
  assert.equal(dividerAt({ ids: ['x'], reached: false }, drawn), null)
  assert.equal(dividerAt(null, drawn), null)
})

// The viewer's own message, wherever they wrote it, puts what came before it behind them (review P2 on seam #10).

/** Shown, hidden, these messages read while hidden, shown again. */
const backFrom = (came: readonly DiscussionEntry[], me: string | null = 'me') =>
  reads(
    [
      [before, false],
      [before, true],
      [[...before, ...came], true],
      [[...before, ...came], false],
    ],
    me,
  )!

test('answered from another device while the tab was hidden, nothing is left to mark', () => {
  assert.equal(backFrom([entry('a', 'marco'), entry('m', 'me')]).away, null)
  // Written first, then Marco: his is still to read.
  assert.deepEqual(backFrom([entry('m', 'me'), entry('a', 'marco')]).away, { ids: ['a'], reached: false })
  // A turn the viewer spoke in the call reads nothing of the chat: what came stays.
  assert.deepEqual(backFrom([entry('a', 'marco'), entry('v', 'me', 'voice')]).away, { ids: ['a'], reached: false })
})

test('an earlier absence the viewer answered goes with what came after it, reached or not', () => {
  const more = [...after, entry('c', 'marco'), entry('m', 'me')]
  assert.equal(nextUnseen(nextUnseen(back(), more, true, 'me'), more, false, 'me').away, null)
  const reached = { ...back(), away: reachedAway(back().away, 'a') }
  assert.equal(nextUnseen(nextUnseen(reached, more, true, 'me'), more, false, 'me').away, null)
})

test('the viewer known only once the tab is shown: their own message and what came before it leave', () => {
  const came = [entry('a', 'marco'), entry('m', 'me'), entry('b', 'lucia')]
  const shown = backFrom(came, null)
  assert.deepEqual(shown.away, { ids: ['a', 'm', 'b'], reached: false }, 'not known yet: all of it came')
  const known = nextUnseen(shown, [...before, ...came], false, 'me')
  assert.deepEqual(known.away, { ids: ['b'], reached: false })
})
