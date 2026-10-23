import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectMember } from '@sophia/contracts'
import {
  ADDRESS_PAGES,
  canMention,
  labelOf,
  mentionWords,
  MOST_MENTIONS,
  nameable,
  needFor,
  nextLook,
  readable,
  toggled,
  waitingRevision,
} from './mention-view.ts'

const ME = '00000000-0000-4000-8000-0000000000a1'
const member = (n: number, name: string | null, role: ProjectMember['role'] = 'editor'): ProjectMember => ({
  actorId: `00000000-0000-4000-8000-00000000000${n}`,
  role,
  name,
})

describe('canMention', () => {
  it('lets an editor or an admin name members, never a viewer', () => {
    assert.deepEqual((['admin', 'editor', 'viewer', undefined] as const).map(canMention), [true, true, false, false])
  })
})

describe('toggled', () => {
  it('adds and takes off a member, and stops at five', () => {
    assert.deepEqual(toggled([], 'a'), ['a'])
    assert.deepEqual(toggled(['a', 'b'], 'a'), ['b'])
    const five = ['a', 'b', 'c', 'd', 'e']
    assert.equal(five.length, MOST_MENTIONS)
    assert.deepEqual(toggled(five, 'f'), five)
  })
})

describe('mentionWords', () => {
  it('names members by their display names, the reader as you, never an address; someone gone as a former member', () => {
    const marco = member(1, 'Marco')
    const unnamed = member(2, null, 'viewer')
    const members = new Map([marco, unnamed].map((m) => [m.actorId, m]))
    assert.equal(mentionWords([marco.actorId], ME, members), 'to Marco')
    assert.equal(mentionWords([marco.actorId, ME, unnamed.actorId], ME, members), 'to Marco, you and A member')
    assert.equal(mentionWords(['00000000-0000-4000-8000-000000000009'], ME, members), 'to a former member')
    assert.equal(labelOf(undefined), 'A member')
  })

  it('offers every other member, never the reader', () => {
    assert.deepEqual(
      nameable([member(1, 'Marco'), { actorId: ME, role: 'admin', name: 'Me' }], ME).map((m) => m.name),
      ['Marco'],
    )
  })
})

describe('readable', () => {
  it('counts a message seen once 60% of it shows; a sliver at the edge is not reading it', () => {
    assert.equal(readable(4, 100, 400), false)
    assert.equal(readable(59, 100, 400), false)
    assert.equal(readable(60, 100, 400), true)
    assert.equal(readable(0, 100, 400), false)
  })

  it('counts a message taller than the chat once it fills 60% of the chat, which 60% of itself never could', () => {
    // 2000 px tall in a 400 px chat: at most 400 px of it shows, 20% of it.
    assert.equal(readable(400, 2000, 400), true)
    assert.equal(readable(240, 2000, 400), true)
    assert.equal(readable(200, 2000, 400), false)
    assert.equal(readable(12, 2000, 400), false)
  })
})

describe('nextLook', () => {
  const base = {
    found: false,
    withdrawn: false,
    reading: false,
    failed: false,
    offered: true,
    atStart: false,
    pages: 0,
  }
  it('shows a message found; says a withdrawn one is gone; waits for a page being read', () => {
    assert.equal(nextLook({ ...base, found: true }), 'found')
    assert.equal(nextLook({ ...base, withdrawn: true }), 'gone')
    assert.equal(nextLook({ ...base, reading: true }), 'wait')
  })

  it('reads at most a few earlier pages, then says it is further back; at the start, gone', () => {
    assert.equal(nextLook({ ...base, pages: ADDRESS_PAGES - 1 }), 'load')
    assert.equal(nextLook({ ...base, pages: ADDRESS_PAGES }), 'further')
    assert.equal(nextLook({ ...base, offered: false, atStart: true }), 'gone')
    assert.equal(nextLook({ ...base, offered: false }), 'gone')
  })
})

describe('waitingRevision and needFor', () => {
  it('reads the revision from <revision>.<occurrence>, and nothing from any other form', () => {
    assert.equal(waitingRevision('2.1'), 2)
    assert.equal(waitingRevision('12.3'), 12)
    for (const bad of ['2', '2.0', '0.1', 'x.1', '', null]) assert.equal(waitingRevision(bad), null)
  })

  it('attaches a need only to the revision it is for: never to older words still shown, never without a revision', () => {
    const waiting = { need: 'mention:p:2.1:m', revision: 2 }
    assert.equal(needFor(waiting, 2), 'mention:p:2.1:m')
    assert.equal(needFor(waiting, 1), undefined)
    assert.equal(needFor(waiting, 3), undefined)
    assert.equal(needFor(waiting, undefined), undefined)
    assert.equal(needFor(undefined, 2), undefined)
  })
})

describe('nextLook after a failed read', () => {
  it('waits for the reader’s Try again instead of reading again or calling it further back', () => {
    const at = { found: false, withdrawn: false, reading: false, failed: true, offered: true, atStart: false }
    assert.equal(nextLook({ ...at, pages: 1 }), 'wait')
    assert.equal(nextLook({ ...at, pages: 4 }), 'wait')
  })
})

describe('nextLook for a message a search found (A38)', () => {
  const at = { found: false, withdrawn: false, reading: false, failed: false, offered: true, atStart: false, pages: 0 }
  it('reads the one page that ends at it, never page by page; not there after it, gone', () => {
    assert.equal(nextLook({ ...at, jump: 'unread' }), 'jump')
    assert.equal(nextLook({ ...at, jump: 'read' }), 'gone')
    assert.equal(nextLook({ ...at, jump: 'read', found: true }), 'found')
    assert.equal(nextLook({ ...at, jump: 'unread', withdrawn: true }), 'gone')
  })
  it('waits while that page is read, and after it failed, for the reader’s Try again', () => {
    assert.equal(nextLook({ ...at, jump: 'read', reading: true }), 'wait')
    assert.equal(nextLook({ ...at, jump: 'read', failed: true }), 'wait')
  })
  it('without a search’s hint, looks as a mention does', () => {
    assert.equal(nextLook({ ...at, jump: 'none' }), 'load')
    assert.equal(nextLook(at), 'load')
  })
})
