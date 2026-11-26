import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withOwnName } from './own-name.ts'
import type { RoomParticipant } from './room-view.ts'

const person = (identity: string, name: string, local: boolean): RoomParticipant => ({
  identity,
  name,
  speaking: false,
  micOn: false,
  cameraOn: false,
  screenOn: false,
  local,
  standing: 'editor',
})

describe('this person in the call, by the name they saved (one-truth.md)', () => {
  it('names their own participant by it, the others as the call does', () => {
    const room = { participants: [person('a', '', true), person('b', 'Davide', false)] }
    const named = withOwnName(room, 'Marta Ruiz')
    assert.deepEqual(
      named.participants.map((p) => p.name),
      ['Marta Ruiz', 'Davide'],
    )
    assert.equal(room.participants[0]?.name, '', 'the call’s own list is left as it was')
  })

  it('changes nothing with no name, out of the call, or when the call already says it', () => {
    const room = { participants: [person('b', 'Davide', false)] }
    assert.equal(withOwnName(room, 'Marta'), room)
    const mine = { participants: [person('a', 'Marta', true)] }
    assert.equal(withOwnName(mine, 'Marta'), mine)
    assert.equal(withOwnName(mine, null), mine)
  })
})
