import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MESSAGE, REQUEST, TASK, linkHash, requestAddress } from '../features/resources/link.ts'
import { RETURN_ANCHOR_KEY, RETURN_ANCHOR_MS, anchorAfter, keepAnchor, takeAnchor } from './return-anchor.ts'

const memory = () => {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  }
}
const PATH = '/p/00000000-0000-4000-8000-000000000001/conversations'
const AT = 1_760_000_000_000

test('a view’s anchor is kept with its path, given back once on that path, and gone after', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#conversation-c1' }, AT)
  assert.equal(takeAnchor(store, PATH, AT + 60_000), '#conversation-c1')
  assert.equal(takeAnchor(store, PATH, AT + 60_000), null)
  assert.equal(store.kept.size, 0)
})

test('another fragment is not kept, and lets an older anchor go', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#task-t1' }, AT)
  keepAnchor(store, { pathname: PATH, hash: '#access_token=secret&type=invite' }, AT)
  assert.equal(store.kept.has(RETURN_ANCHOR_KEY), false)
  keepAnchor(store, { pathname: PATH, hash: '#top' }, AT)
  assert.equal(takeAnchor(store, PATH, AT), null)
})

test('another path, or an anchor kept too long ago, gives nothing back', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#goal-g1' }, AT)
  assert.equal(takeAnchor(store, '/p/00000000-0000-4000-8000-000000000002/goals', AT), null)
  keepAnchor(store, { pathname: PATH, hash: '#goal-g1' }, AT)
  assert.equal(takeAnchor(store, PATH, AT + RETURN_ANCHOR_MS + 1), null)
})

test('unreadable storage gives nothing back', () => {
  const store = memory()
  store.setItem(RETURN_ANCHOR_KEY, '{not json')
  assert.equal(takeAnchor(store, PATH, AT), null)
  store.setItem(RETURN_ANCHOR_KEY, JSON.stringify({ path: PATH, hash: 'javascript:alert(1)', at: AT }))
  assert.equal(takeAnchor(store, PATH, AT), null)
})

test('a failed return puts the place back and keeps it, so the next try still finds it (Codex P2 on #404)', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#task-t1' }, AT) // asked for two links, or left for a provider
  // An older link (otp_expired) or a provider's refusal: the address carries the place again, and it stays kept.
  assert.equal(anchorAfter(store, { kind: 'error', signedIn: false, path: PATH }, AT + 1_000), '#task-t1')
  // A link whose session didn't follow (opened in another browser, say): the same.
  assert.equal(anchorAfter(store, { kind: 'code', signedIn: false, path: PATH }, AT + 2_000), '#task-t1')
  // The newer link, in another tab, signs in: the place is given back once, then gone.
  assert.equal(anchorAfter(store, { kind: 'code', signedIn: true, path: PATH }, AT + 3_000), '#task-t1')
  assert.equal(store.kept.size, 0)
})

test('a try again from the address given back keeps the place afresh', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#task-t1' }, AT)
  const back = anchorAfter(store, { kind: 'error', signedIn: false, path: PATH }, AT + 20 * 60_000)
  keepAnchor(store, { pathname: PATH, hash: back ?? '' }, AT + 20 * 60_000)
  assert.equal(anchorAfter(store, { kind: 'code', signedIn: true, path: PATH }, AT + 45 * 60_000), '#task-t1')
})

test('a failed return on another path gives nothing back and leaves the place kept', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#task-t1' }, AT)
  assert.equal(anchorAfter(store, { kind: 'error', signedIn: false, path: '/' }, AT + 1_000), null)
  assert.equal(anchorAfter(store, { kind: 'code', signedIn: true, path: PATH }, AT + 2_000), '#task-t1')
})

test('an invitation, or no sign-in at all, never left from here: nothing comes back, and a kept place waits', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#task-t1' }, AT)
  assert.equal(anchorAfter(store, { kind: 'tokens', signedIn: true, path: PATH }, AT), null)
  assert.equal(anchorAfter(store, { kind: 'none', signedIn: true, path: PATH }, AT), null)
  assert.equal(store.kept.has(RETURN_ANCHOR_KEY), true)
})

test('the longest anchors the link helpers make from the contract’s ids are kept and given back (Codex P2 on #404)', () => {
  const store = memory()
  for (const hash of [
    // A request named with its resource, encoded twice: a realistic id with a colon (body 203).
    linkHash(requestAddress('00000000-0000-4000-8000-000000000001', 'perm:' + 'a'.repeat(155)), REQUEST),
    linkHash('é'.repeat(160), TASK), // a work item's id at its 160 bound (body 960)
    linkHash(requestAddress('\u{1F600}'.repeat(160), '\u{1F600}'.repeat(200)), REQUEST), // the contract's worst (7203)
  ]) {
    keepAnchor(store, { pathname: PATH, hash }, AT)
    assert.equal(takeAnchor(store, PATH, AT + 60_000), hash)
  }
})

test('an anchor longer than the helpers can make is still not kept', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#task-' + 'a'.repeat(7204) }, AT)
  assert.equal(store.kept.has(RETURN_ANCHOR_KEY), false)
})

test('any letter in an anchor’s body is kept; a space, a #, & or = is not', () => {
  const store = memory()
  keepAnchor(store, { pathname: PATH, hash: '#resource-specs' }, AT)
  assert.equal(takeAnchor(store, PATH, AT), '#resource-specs')
  for (const hash of ['#task-a b', '#task-a#b', '#task-a&b', '#task-a=b']) {
    keepAnchor(store, { pathname: PATH, hash }, AT)
    assert.equal(store.kept.has(RETURN_ANCHOR_KEY), false, hash)
  }
})

test('a chat message’s anchor (a mention’s link, A37) comes back through a sign-in like any view’s (Codex P2 on #435)', () => {
  const store = memory()
  const path = '/p/00000000-0000-4000-8000-0000000000aa/studio'
  const message = linkHash('00000000-0000-4000-8000-0000000000ab', MESSAGE)
  keepAnchor(store, { pathname: path, hash: message }, AT)
  assert.equal(anchorAfter(store, { kind: 'error', signedIn: false, path }, AT + 1_000), message)
  assert.equal(anchorAfter(store, { kind: 'code', signedIn: false, path }, AT + 2_000), message)
  assert.equal(anchorAfter(store, { kind: 'code', signedIn: true, path }, AT + 3_000), message)
  assert.equal(store.kept.size, 0)
  // Still never a token, a body with a space or &, nor a message kept too long ago or on another path.
  keepAnchor(store, { pathname: path, hash: '#message-x&access_token=secret' }, AT)
  assert.equal(store.kept.has(RETURN_ANCHOR_KEY), false)
  keepAnchor(store, { pathname: path, hash: '#message-a b' }, AT)
  assert.equal(store.kept.has(RETURN_ANCHOR_KEY), false)
  keepAnchor(store, { pathname: path, hash: message }, AT)
  assert.equal(takeAnchor(store, PATH, AT), null)
  keepAnchor(store, { pathname: path, hash: message }, AT)
  assert.equal(takeAnchor(store, path, AT + RETURN_ANCHOR_MS + 1), null)
})
