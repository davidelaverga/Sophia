import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectMember } from '@sophia/contracts'
import { canMention, labelOf, mentionWords, MOST_MENTIONS, nameable, toggled } from './mention-view.ts'

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
