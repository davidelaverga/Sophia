import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptFragment, moves, next } from './useAddressed.ts'

// What a move of the address does to a view that reads it (docs/plans/addressed-follows-back.md): Back or Forward that
// names another record than the one last followed is followed; one that names none is read; the same record is kept,
// so a sheet closed since stays closed.

const AT = (hash: string) => `https://studio.example/p/x/conversations${hash}`

test('Back naming another record follows it; naming the one last followed keeps what is on screen', () => {
  const m = moves('c1')
  assert.equal(m.named('c2'), 'follow') // a link followed
  assert.equal(m.pop('c1', AT('#c1')), 'follow') // Back: the earlier conversation
  assert.equal(m.pop('c2', AT('#c2')), 'follow') // Forward
  assert.equal(m.pop('c2', AT('#c2')), 'keep') // the report's Back, or a close's: the same record
})

test('Back naming no record is read, and the record last followed stays the one a later move is held to', () => {
  const m = moves('t1')
  assert.equal(m.pop(null, AT('')), 'read')
  // A sheet closed since (its fragment cleared or left): a move landing on it again reopens nothing.
  assert.equal(m.pop('t1', AT('#t1')), 'keep')
  assert.equal(m.pop('t2', AT('#t2')), 'follow')
})

test('a move of the fragment alone is followed once: its popstate, or else its hashchange, as today', () => {
  const m = moves(null)
  assert.equal(m.pop('a', AT('#a')), 'follow')
  assert.equal(m.hash('a', AT('#a')), 'keep') // the same move's hashchange
  // A fragment typed again after its sheet closed: the popstate keeps (the record last followed), the hashchange follows.
  assert.equal(m.pop('a', AT('#a')), 'keep')
  assert.equal(m.hash('a', AT('#a')), 'follow')
  // A hashchange of another move than the popstate's follows.
  assert.equal(m.pop('b', AT('#b')), 'follow')
  assert.equal(m.hash(null, AT('#content')), 'follow')
})

test('a link followed (ADDRESS_NAMED) always follows, and is the record later moves are held to', () => {
  const m = moves(null)
  assert.equal(m.named('g1'), 'follow')
  assert.equal(m.named('g1'), 'follow')
  assert.equal(m.pop('g1', AT('#g1')), 'keep')
  // A move naming none of this record's kind (another kind's link, a report's `#md-` anchor) is followed, as today, and
  // leaves the record last followed: Back to it later reopens nothing.
  assert.equal(m.hash(null, AT('#md-a')), 'follow')
  assert.equal(m.named(null), 'follow')
  assert.equal(m.pop('g1', AT('#g1')), 'keep')
  assert.equal(m.pop('g2', AT('#g2')), 'follow')
})

test('a record the view opened by a press is the one Back is held to; its close leaves it so', () => {
  const m = moves('c2') // the page opened at c2
  assert.equal(m.shown('c1'), 'keep') // c1 pressed beside a report: written by the view, never followed
  assert.equal(m.pop('c1', AT('#c1')), 'keep') // the report's Close, its fragment kept: nothing moves
  assert.equal(m.pop('c2', AT('#c2')), 'follow') // Back to the entry from before: the conversation read then
  assert.equal(m.shown(null), 'keep') // a close: the record stays the one last acted on
  assert.equal(m.pop('c2', AT('#c2')), 'keep')
})

test('the report’s own step Back keeps the fragment on screen: read as noted until written where it lands', () => {
  assert.equal(keptFragment.take(), null) // nothing noted: the address's own
  assert.equal(keptFragment.of('#conversation-c2'), '#conversation-c2')
  keptFragment.note('#conversation-c1', () => true)
  assert.equal(keptFragment.of('#conversation-c2'), '#conversation-c1') // landed, not yet written
  assert.equal(keptFragment.take(), '#conversation-c1')
  assert.equal(keptFragment.of('#conversation-c2'), '#conversation-c2')
  keptFragment.note('', () => true)
  assert.equal(keptFragment.of('#task-t1'), '') // a plain address is kept plain
  assert.equal(keptFragment.take(), '')
})

test('a note outlives no step: read only where the step was to land, and gone at the next move either way', () => {
  let landed = false
  keptFragment.note('#conversation-c1', () => landed)
  assert.equal(keptFragment.of('#conversation-c2'), '#conversation-c2') // another move than the viewer's step
  assert.equal(keptFragment.take(), null) // and the note goes with it
  landed = true
  assert.equal(keptFragment.of('#conversation-c2'), '#conversation-c2')
  assert.equal(keptFragment.take(), null)
})

test('what a view is given after a step: the same object when nothing moves, so effects keyed on it stay still', () => {
  const at = { id: 'c1', seq: 2 }
  assert.equal(next(at, 'keep', 'c2'), at) // kept: nothing at all
  assert.equal(next(at, 'read', 'c1'), at) // read, the same record: the same object
  const none = { id: null, seq: 2 }
  assert.equal(next(none, 'read', null), none)
  assert.deepEqual(next(at, 'read', null), { id: null, seq: 2 }) // read: a gone address is gone, `seq` stays
  assert.deepEqual(next(at, 'follow', 'c2'), { id: 'c2', seq: 3 })
  assert.deepEqual(next(at, 'follow', 'c1'), { id: 'c1', seq: 3 }) // followed again: a new object
})
