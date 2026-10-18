import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectMember } from '@sophia/contracts'
import { boardPeople, viewerOf } from './board-people.ts'
import { item } from './board-samples.ts'
import { whoDoes } from './plan.ts'

const member = (actorId: string, name: string | null, role: ProjectMember['role'] = 'editor'): ProjectMember => ({
  actorId,
  role,
  name,
})

describe('who the served board names (informe-25 DL-05)', () => {
  it('names each member the project knows by name', () => {
    assert.deepEqual(boardPeople(null, [member('a', 'Marco'), member('b', 'Lucía', 'viewer')]), {
      a: { id: 'a', name: 'Marco', avatarUrl: null },
      b: { id: 'b', name: 'Lucía', avatarUrl: null },
    })
  })

  it('says an address as the stage says it, and keeps a chosen name whole', () => {
    const people = boardPeople(null, [member('a', 'marco.rossi@acme.test'), member('b', 'Ana @ Acme')])
    assert.equal(people['a']?.name, 'Marco')
    assert.equal(people['b']?.name, 'Ana @ Acme')
  })

  it('leaves out a member the project keeps no name for, so the board’s own word reads instead', () => {
    assert.equal('c' in boardPeople(null, [member('c', null)]), false)
  })

  it('names the viewer as their account does, over the room’s name for them', () => {
    const viewer = { id: 'a', name: 'Luis Pérez', avatarUrl: 'https://example.test/a.png' }
    assert.deepEqual(boardPeople(viewer, [member('a', 'luis@acme.test')])['a'], viewer)
  })

  it('names the viewer with no display name by their address said as a name, never the address', () => {
    const identity = { name: 'luis.perez@acme.test', role: 'editor', token: 't', displayName: null, avatarUrl: null }
    assert.deepEqual(viewerOf(identity, 'a'), { id: 'a', name: 'Luis', avatarUrl: null })
    assert.equal(viewerOf(identity, null), null)
  })

  it('gives the board’s own words a name: a person a task is assigned to', () => {
    const people = boardPeople(null, [member('a', 'Marco')])
    assert.equal(whoDoes(item('write', { assignee_kind: 'human', assignee_id: 'a' }), null, [], people).name, 'Marco')
  })
})
