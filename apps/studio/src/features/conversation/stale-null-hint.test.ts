import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextLook } from './mention-view.ts'
import { jumpOf } from './useMentionAttention.ts'

// 4307870144: a search hit's latest-page hint (null) is only true when found. Once that page is read without the
// message (newer messages came since), the look goes on in the bounded earlier pages; a hint naming the message after
// it (a page that ends at it) read without it still means it is gone. No hint: looked for as any address.
const look = (jump: 'none' | 'unread' | 'read', over: Partial<Parameters<typeof nextLook>[0]> = {}) =>
  nextLook({
    found: false,
    withdrawn: false,
    reading: false,
    failed: false,
    offered: true,
    atStart: false,
    pages: 0,
    jump,
    ...over,
  })

describe('a stale latest-page hint', () => {
  it('null, not yet read: read the latest page; read without it: look earlier, bounded', () => {
    assert.equal(look(jumpOf(null, false)), 'jump')
    assert.equal(look(jumpOf(null, true)), 'load')
    assert.equal(look(jumpOf(null, true), { pages: 4 }), 'further', 'never past the earlier pages’ bound')
    assert.equal(look(jumpOf(null, true), { atStart: true, offered: false }), 'gone', 'at the chat’s start it is gone')
  })

  it('a next-message hint read without it is gone; no hint looks earlier; withdrawn stays gone', () => {
    assert.equal(look(jumpOf('next', true)), 'gone')
    assert.equal(look(jumpOf(undefined, false)), 'load')
    assert.equal(look(jumpOf(null, true), { withdrawn: true }), 'gone')
    assert.equal(look(jumpOf(null, true), { found: true }), 'found')
  })
})
