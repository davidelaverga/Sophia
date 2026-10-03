import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changeLine, currentLevel } from './change.ts'
import type { Session } from './resource.ts'

const session = (s: Partial<Session> = {}): Session => ({
  id: 'worker',
  role: 'worker',
  model: 'claude-opus-5-5',
  effort: 'high',
  mode: 'ultracode',
  assignment: { workId: 'work-1', title: 'Implement the PDF retry', state: 'running' },
  ...s,
})

describe('a change of a session’s effort', () => {
  it('runs its mode when it has one, else its effort', () => {
    assert.equal(currentLevel(session()), 'ultracode')
    assert.equal(currentLevel(session({ mode: null, effort: 'Max' })), 'max')
    assert.equal(currentLevel(session({ mode: null, effort: null })), null)
  })

  it('is its owner’s request until its runtime takes it: for the next run, or a restart', () => {
    assert.equal(changeLine(session(), undefined), null)
    assert.deepEqual(changeLine(session(), { level: 'max', when: 'next' }), { text: 'Next run · Max', tone: 'asked' })
    assert.deepEqual(changeLine(session(), { level: 'low', when: 'now' }), {
      text: 'Restart asked · Low',
      tone: 'asked',
    })
  })

  it('then says each step its runtime reports, past undoing, whoever asked', () => {
    const ask = { level: 'low', when: 'now' } as const
    const stopping = session({ change: { level: 'low', phase: 'stopping' } })
    assert.deepEqual(changeLine(stopping, ask), { text: 'Stopping · keeping its work', tone: 'moving' })
    const starting = session({ change: { level: 'xhigh', phase: 'starting' } })
    assert.deepEqual(changeLine(starting, undefined), { text: 'Starting again with Extra high', tone: 'moving' })
  })

  it('says a stop it couldn’t confirm, and that nothing restarted', () => {
    const unconfirmed = session({ change: { level: 'low', phase: 'unconfirmed' } })
    assert.deepEqual(changeLine(unconfirmed, { level: 'low', when: 'now' }), {
      text: 'Stop not confirmed · nothing restarted',
      tone: 'warn',
    })
  })

  it('is done once what it runs is what was asked, and not before', () => {
    const low = session({ mode: null, effort: 'low' })
    assert.deepEqual(changeLine(low, { level: 'low', when: 'now' }), { text: 'Now on Low', tone: 'done' })
    // Still starting with it: not done until the runtime says it runs it.
    assert.equal(
      changeLine({ ...low, change: { level: 'low', phase: 'starting' } }, { level: 'low', when: 'now' })?.tone,
      'moving',
    )
    assert.deepEqual(changeLine(session(), { level: 'ultracode', when: 'next' }), {
      text: 'Now on Ultracode',
      tone: 'done',
    })
  })
})
