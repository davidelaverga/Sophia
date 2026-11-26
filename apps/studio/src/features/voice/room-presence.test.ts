import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectList, ProjectSummary } from '@sophia/contracts'
import { facesOf, presenceIn, UNKNOWN } from './room-presence.ts'

const PROJECT = '5c1decc5-6bfe-49fd-8ebb-178992ef84f8'

const listed = (room: ProjectSummary['room']): ProjectList => ({
  projects: [
    {
      projectId: PROJECT,
      title: 'Pitch deck',
      role: 'admin',
      members: 3,
      room,
      nextSession: null,
      releases: [],
    },
  ],
  personalEpoch: 1,
})

describe('who is in the room before joining (one-truth.md)', () => {
  it('says what Home says: the same short names, Sophia last', () => {
    const presence = presenceIn(listed({ people: ['davide@sophia.test'], sophia: true }), PROJECT)
    assert.deepEqual(presence, {
      known: true,
      people: ['Davide'],
      sophia: true,
      words: 'Davide and Sophia are in the room',
    })
    assert.equal(presenceIn(listed({ people: ['Ana', 'Marco'], sophia: false }), PROJECT).known, true)
  })

  it('knows nobody is in when the server says so, Sophia alone included', () => {
    for (const room of [
      { people: [], sophia: false },
      { people: [], sophia: true },
    ]) {
      const presence = presenceIn(listed(room), PROJECT)
      assert.equal(presence.known, true)
      assert.equal(presence.known && presence.words, null)
      assert.deepEqual(facesOf(presence), [])
    }
  })

  it('claims nothing before the list is read, or when it doesn’t have the project', () => {
    assert.deepEqual(presenceIn(undefined, PROJECT), UNKNOWN)
    assert.deepEqual(presenceIn({ projects: [], personalEpoch: 1 }, PROJECT), UNKNOWN)
    assert.deepEqual(facesOf(UNKNOWN), [])
  })

  it('reads a room the server couldn’t ask in time (`room: null`) as unknown, never as nobody', () => {
    assert.deepEqual(presenceIn(listed(null), PROJECT), UNKNOWN)
  })

  it('shows at most three faces, by initial', () => {
    const presence = presenceIn(listed({ people: ['Ana', 'Bea', 'Carla', 'Dora'], sophia: false }), PROJECT)
    assert.deepEqual(facesOf(presence), ['A', 'B', 'C'])
  })

  it('names someone the server can’t name by the one word, never an id', () => {
    const presence = presenceIn(listed({ people: [''], sophia: false }), PROJECT)
    assert.deepEqual(presence.known && presence.people, ['A member'])
  })
})
