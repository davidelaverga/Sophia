import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RETURN_ANCHOR_KEY, RETURN_ANCHOR_MS, keepAnchor, takeAnchor } from './return-anchor.ts'

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
