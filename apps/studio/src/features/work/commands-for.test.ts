import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { commandsFor } from './labels.ts'

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
