import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectTask } from '../../api/vision.ts'
import type { RoomParticipant } from '../voice/room-view.ts'
import {
  doneWords,
  fromWords,
  mayAssign,
  mayFinish,
  noOwnerOption,
  openCount,
  ordered,
  ownerWords,
  QUOTE_MAX,
  taskPeople,
  taskQuote,
} from './task-view.ts'

const task = (over: Partial<ProjectTask> = {}): ProjectTask => ({
  taskId: 't1',
  text: 'Check the March figure',
  owner: null,
  ownerName: null,
  from: { versionId: 'v1', versionNumber: 1, passage: '0.0.3', quote: 'The fixture holds.' },
  by: 'me',
  at: '2026-10-06T10:00:00Z',
  doneBy: null,
  doneAt: null,
  ...over,
})

describe('who a task is for, in words', () => {
  it('is you, a member by the name the API gives, or anyone', () => {
    assert.equal(ownerWords(task({ owner: 'me', ownerName: 'Luis' }), 'me'), 'you')
    assert.equal(ownerWords(task({ owner: 'ana', ownerName: 'Lucía' }), 'me'), 'Lucía')
    assert.equal(ownerWords(task({ owner: 'ana', ownerName: null }), 'me'), 'a member')
    assert.equal(ownerWords(task(), 'me'), 'anyone')
  })

  it('says who did it once done', () => {
    assert.equal(doneWords(task({ doneBy: 'me' }), 'me'), 'Done by you.')
    assert.equal(doneWords(task({ doneBy: 'ana' }), 'me'), 'Done by a member.')
  })
})

describe('the order of the tab', () => {
  it('puts the open ones first, newest first as the API gives them, then the done ones', () => {
    const tasks = [
      task({ taskId: 'a', doneBy: 'me' }),
      task({ taskId: 'b' }),
      task({ taskId: 'c', doneBy: 'ana' }),
      task({ taskId: 'd' }),
    ]
    assert.deepEqual(
      ordered(tasks).map((t) => t.taskId),
      ['b', 'd', 'a', 'c'],
    )
    assert.equal(openCount(tasks), 2)
  })
})

describe('who may mark it done', () => {
  it('is whoever it is for, an editor or an admin; a task for anyone, any member', () => {
    assert.equal(mayFinish(task({ owner: 'me' }), 'me', 'viewer'), true)
    assert.equal(mayFinish(task({ owner: 'ana' }), 'me', 'viewer'), false)
    assert.equal(mayFinish(task({ owner: 'ana' }), 'me', 'editor'), true)
    assert.equal(mayFinish(task({ owner: 'ana' }), 'me', 'admin'), true)
    assert.equal(mayFinish(task(), 'me', 'viewer'), true)
  })

  it('is no one once it is done', () => {
    assert.equal(mayFinish(task({ owner: 'me', doneBy: 'me' }), 'me', 'admin'), false)
  })
})

const person = (identity: string, standing: RoomParticipant['standing'], local = false) =>
  ({ identity, name: identity.toUpperCase(), standing, local }) as RoomParticipant

describe('whom a task may be for, in the call', () => {
  it('is the members, once each, never this person, a guest or someone the API signed nothing for', () => {
    const people = [
      person('me', 'admin', true),
      person('ana', 'editor'),
      person('ben', 'viewer'),
      person('gus', 'guest'),
      person('nob', 'unknown'),
      person('ana', 'editor'),
      person('ada', 'admin'),
    ]
    assert.deepEqual(taskPeople(people), [
      { actorId: 'ana', name: 'ANA' },
      { actorId: 'ben', name: 'BEN' },
      { actorId: 'ada', name: 'ADA' },
    ])
  })
})

describe('a task’s quote', () => {
  it('is the passage as selected, within the API’s 800 characters, its cut marked', () => {
    assert.equal(taskQuote('The fixture holds.'), 'The fixture holds.')
    const long = `${'a'.repeat(799)}…`
    assert.equal(taskQuote(long).length, QUOTE_MAX)
    const longer = 'b'.repeat(900)
    assert.equal(taskQuote(longer).length, QUOTE_MAX)
    assert.ok(taskQuote(longer).endsWith('…'))
    assert.equal(taskQuote('c'.repeat(800)), 'c'.repeat(800))
  })
})

describe('a task’s quote, by characters', () => {
  it('never splits a character at the limit', () => {
    const emoji = '😀'.repeat(900)
    const quote = taskQuote(emoji)
    assert.ok(quote.length <= QUOTE_MAX)
    const skin = taskQuote('👍🏽'.repeat(900))
    assert.ok(skin.length <= QUOTE_MAX)
    assert.ok(skin.endsWith('👍🏽…'))
    // Where the browser has no segmenter: by code points, never a lone half.
    const plain = taskQuote(emoji, null)
    assert.ok(plain.length <= QUOTE_MAX)
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(plain))
    assert.ok(quote.endsWith('😀…'))
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(quote))
  })
})

describe('A39 served tasks (D-TASKS)', () => {
  const roles = ['admin', 'editor', 'viewer'] as const
  it('lets editors and admins finish any open task; a viewer only one explicitly theirs, never one for nobody', () => {
    const cells = roles.map((role) => [
      role,
      mayFinish(task({ owner: null }), 'me', role, true),
      mayFinish(task({ owner: 'me' }), 'me', role, true),
      mayFinish(task({ owner: 'ana' }), 'me', role, true),
      mayFinish(task({ owner: 'me', doneBy: 'me' }), 'me', role, true),
    ])
    assert.deepEqual(cells, [
      ['admin', true, true, true, false],
      ['editor', true, true, true, false],
      ['viewer', false, true, false, false],
    ])
    // A17's proposal keeps its own rule: anyone's task, any member.
    assert.equal(mayFinish(task({ owner: null }), 'me', 'viewer'), true)
    assert.deepEqual(roles.map(mayAssign), [true, true, false])
  })

  it('says nobody yet for an unassigned served task, and what the passage is, or that it is not available', () => {
    assert.equal(ownerWords(task(), 'me', true), 'nobody yet')
    assert.equal(fromWords(task({ from: null })), null)
    assert.equal(fromWords(task({ from: 'unavailable' })), 'The passage it came from isn’t available to you')
    assert.equal(fromWords(task({ from: { versionId: 'v', versionNumber: 2, passage: '1.2.3', quote: null } })), 'v2')
  })
})

describe('the owner choice for no one (FND-C50)', () => {
  it('says «Nobody yet» in the served form and keeps A17’s «Anyone»; a viewer still never finishes it', () => {
    assert.equal(noOwnerOption(true), 'Nobody yet')
    assert.equal(noOwnerOption(false), 'Anyone')
    assert.equal(ownerWords(task(), 'me', true), 'nobody yet', 'the list and confirmation agree')
  })
})
