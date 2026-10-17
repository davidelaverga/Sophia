import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { commandsFor, retirementView } from './labels.ts'

describe('the goal controls offered (A41)', () => {
  it('offers Retire remaining sessions only to an admin, only on a completed goal', () => {
    assert.deepEqual(commandsFor('completed', true), ['retire_sessions'])
    assert.deepEqual(commandsFor('completed', false), [])
    for (const status of ['ready', 'running', 'checking', 'holding', 'held', 'stopping', 'stopped'] as const) {
      assert.equal(commandsFor(status, true).includes('retire_sessions'), false, status)
    }
  })

  it('keeps every other control as it was, for admins and editors alike', () => {
    for (const admin of [true, false]) {
      assert.deepEqual(commandsFor('running', admin), ['request_review', 'hold', 'stop'])
      assert.deepEqual(commandsFor('held', admin), ['resume', 'stop'])
      assert.deepEqual(commandsFor('stopped', admin), [])
    }
  })
})

const target = (result: string, n: number) => ({
  bindingId: `00000000-0000-4000-8000-00000000000${String(n)}`,
  attemptId: `00000000-0000-4000-8000-00000000001${String(n)}`,
  nativeSessionId: `sophia-${String(n)}`,
  runtimeCommandId: null,
  stage: null,
  nativeSequence: null,
  reason: null,
  observedAt: null,
  result: result as never,
})
const of = (...results: string[]) => ({
  commandId: '00000000-0000-4000-8000-000000000099',
  state: 'dispatching' as const,
  goalRevision: 2,
  authorityEpoch: 8,
  targets: results.map((r, i) => target(r, i)),
})

describe('a retirement’s results, in words (A41)', () => {
  it('never says every session stopped while one is unconfirmed, waiting or refused', () => {
    assert.match(retirementView(of('live_reported', 'pending')).summary, /1 still waiting/)
    assert.match(
      retirementView(of('live_reported', 'outcome_unknown')).summary,
      /Not every session was stopped: 1 of 2/,
    )
    assert.match(retirementView(of('no_contact', 'rejected')).summary, /Not every session was stopped/)
    assert.match(retirementView(of()).summary, /No session was left/)
  })

  it('keeps a live fence, a durable restop and a settlement without contact apart, and claims no idle on faith', () => {
    const lines = retirementView(of('live_reported', 'durable_only', 'no_contact')).lines.map((l) => l.words)
    assert.deepEqual(lines, [
      'Stopped: the runtime reported it idle and its handle released',
      'Fenced: its stopped state stands; whether it was still busy isn’t known',
      'No session to contact: settled without the runtime',
    ])
    assert.match(retirementView(of('live_reported', 'durable_only', 'no_contact')).summary, /each says what it means/)
  })
})
