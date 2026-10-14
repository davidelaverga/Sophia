import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WELCOME_DAYS, welcomeFor, welcomeWords, type Welcome } from './welcome.ts'

const at = Date.parse('2026-10-13T12:00:00Z')
const kept: Welcome = { projectId: 'p1', inviter: 'Lucia', role: 'editor', at }

describe('the newcomer’s welcome (docs/plans/newcomer-welcome.md)', () => {
  it('is read back for the project just joined, within a week, and for no other', () => {
    assert.deepEqual(welcomeFor(kept, 'p1', at + 60_000), kept)
    assert.equal(welcomeFor(kept, 'p2', at), null)
    assert.equal(welcomeFor(kept, 'p1', at + WELCOME_DAYS * 86_400_000 + 1), null)
    assert.equal(welcomeFor(null, 'p1', at), null)
  })

  it('says who brought them and as what, what the project is for, and its goals', () => {
    const words = welcomeWords(kept, {
      title: 'Onboarding pilot',
      purpose: 'Teams share a report in week one.',
      goals: 3,
    })
    assert.equal(words.title, 'Welcome to “Onboarding pilot”')
    assert.equal(words.who, 'Lucia invited you as an editor.')
    assert.equal(words.forWhat, 'Teams share a report in week one.')
    assert.equal(words.goals, '3 goals')
  })

  it('says it plainly when something is missing', () => {
    const words = welcomeWords({ ...kept, inviter: null, role: 'viewer' }, { title: 'Pilot', purpose: null, goals: 0 })
    assert.equal(words.who, 'You joined as a viewer.')
    assert.equal(words.forWhat, null)
    assert.equal(words.goals, 'No goals yet')
    assert.equal(welcomeWords(kept, { title: 'Pilot', purpose: null, goals: 1 }).goals, '1 goal')
  })
})
