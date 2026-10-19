import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accountSessionKept } from './kept-session.ts'

/** A store holding these entries, as a browser's localStorage lists them. */
function store(entries: Record<string, string>) {
  const held = new Map(Object.entries(entries))
  return {
    get length() {
      return held.size
    },
    key: (i: number) => [...held.keys()][i] ?? null,
    getItem: (k: string) => held.get(k) ?? null,
  }
}

const kept = (isAnonymous: boolean) =>
  JSON.stringify({ access_token: 'a', user: { id: 'u', is_anonymous: isAnonymous } })

describe('the session this device keeps for an account', () => {
  it('counts an account’s session supabase-js keeps, whatever the project', () => {
    assert.equal(accountSessionKept(store({ 'sb-127-auth-token': kept(false) })), true)
    assert.equal(accountSessionKept(store({ 'sophia.theme': 'dark', 'sb-abcd-auth-token': kept(false) })), true)
  })

  it('does not count a guest’s left from a room’s door, another key, or words that aren’t a session', () => {
    assert.equal(accountSessionKept(store({ 'sb-127-auth-token': kept(true) })), false)
    assert.equal(accountSessionKept(store({ 'sophia.theme': 'dark', 'sb-127-auth-token-code-verifier': 'x' })), false)
    assert.equal(accountSessionKept(store({ 'sb-127-auth-token': 'not json' })), false)
    assert.equal(accountSessionKept(store({ 'sb-127-auth-token': 'null' })), false)
  })

  it('knows of none where the browser keeps nothing', () => {
    // Node has no localStorage to reach: as a browser that blocks storage, nothing is known kept.
    assert.equal(accountSessionKept(), false)
  })
})
