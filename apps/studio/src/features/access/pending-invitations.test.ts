import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { invitedLine, inviterName } from './pending-invitations.ts'

const waiting = {
  id: '00000000-0000-4000-8000-0000000000a1',
  projectId: '00000000-0000-4000-8000-0000000000b1',
  projectTitle: 'Onboarding pilot',
  inviter: 'luis@sophia.test',
  role: 'editor' as const,
  expiresAt: '2026-10-21T12:00:00.000Z',
}

describe('an invitation waiting in the app (A16)', () => {
  it('says who invited, to what and as what, as the join page names the inviter', () => {
    assert.equal(invitedLine(waiting), 'Luis invited you to “Onboarding pilot” as an editor')
    assert.equal(invitedLine({ ...waiting, role: 'viewer' }), 'Luis invited you to “Onboarding pilot” as a viewer')
  })
  it('names a given name whole, and nobody when the account gave none', () => {
    assert.equal(inviterName('Ana López'), 'Ana López')
    assert.equal(inviterName('ana.lopez@example.com'), 'Ana')
    assert.equal(invitedLine({ ...waiting, inviter: null }), 'You were invited to “Onboarding pilot” as an editor')
  })
})
