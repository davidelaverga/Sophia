import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { awaitsConfirmation, goalCommands, pulseTone, summaryLabel } from './labels.ts'

describe('event words in the work pulse', () => {
  it('names room access and membership events', () => {
    assert.equal(summaryLabel('room.lobby_knock', 'room.lobby_changed'), 'A guest asked to come in')
    assert.equal(summaryLabel('room.session', 'room.session_scheduled'), 'Session scheduled')
    assert.equal(summaryLabel('project.member', 'project.member_joined'), 'Member joined')
    // A departure is said as one, and a rename as one (project-leave.md; Codex P2 on #349).
    assert.equal(summaryLabel('project.member_left', 'project.member_left'), 'Member left')
    assert.equal(summaryLabel('project.member_role', 'project.member_role_changed'), 'Role changed')
    // Who did what (project-activity.md): a creation and an admin's acts in the call are said as such.
    assert.equal(summaryLabel('project.created', 'project.created'), 'Project created')
    assert.equal(summaryLabel('project.member_removed', 'project.member_removed'), 'Member removed')
    assert.equal(summaryLabel('room.host_removed', 'room.host_removed'), 'Taken out of the call by an admin')
    assert.equal(summaryLabel('project.renamed', 'project.renamed'), 'Project renamed')
  })

  it('never shows a raw code for an event it does not know', () => {
    assert.equal(summaryLabel('room.something_new', 'room.lobby_changed'), 'Lobby changed')
    assert.equal(summaryLabel('', 'plain'), 'Plain')
  })

  it('says what was sent from the composer', () => {
    assert.equal(summaryLabel('contribution.discuss', 'contribution.recorded'), 'Shared with the project')
    assert.equal(summaryLabel('contribution.ask_sophia', 'contribution.recorded'), 'Question for Sophia')
    assert.equal(summaryLabel('contribution.propose_work', 'contribution.recorded'), 'Work proposed')
  })

  it('never reduces an event to one bare word', () => {
    assert.equal(summaryLabel('contribution.new_intent', 'contribution.recorded'), 'Contribution recorded')
    assert.equal(summaryLabel('', 'native_task.failed'), 'Native task failed')
  })
})

describe('a goal’s commands (docs/plans/prod-asks.md)', () => {
  it('offers Request review under the vision flag only: nothing answers it in production yet', () => {
    assert.deepEqual(goalCommands('running', false), ['hold', 'stop'])
    assert.deepEqual(goalCommands('running', true), ['request_review', 'hold', 'stop'])
  })
  it('keeps each command to the states it is allowed in', () => {
    assert.deepEqual(goalCommands('held', false), ['resume', 'stop'])
    assert.deepEqual(goalCommands('ready', false), ['stop'])
    assert.deepEqual(goalCommands('ready', true), ['request_review', 'stop'])
    assert.deepEqual(goalCommands('completed', true), [])
  })
})

describe('a pulse dot says what happened (one-truth.md)', () => {
  it('is asked for a command sent and a guest at the door', () => {
    assert.equal(pulseTone('command.hold', 'command.admitted'), 'asked')
    assert.equal(pulseTone('command.steer', 'command.admitted'), 'asked')
    assert.equal(pulseTone('room.lobby_knock', 'room.lobby_changed'), 'asked')
    assert.equal(pulseTone('native_task.research', 'native_task.created'), 'asked')
  })

  it('is halted for a goal held or stopped, and a command not carried out or not confirmed', () => {
    assert.equal(pulseTone('goal.held', 'goal.held'), 'halted')
    assert.equal(pulseTone('goal.stopped', 'goal.stopped'), 'halted')
    assert.equal(pulseTone('command.stop', 'command.denied'), 'halted')
    assert.equal(pulseTone('command.hold', 'command.outcome_unknown'), 'halted')
    assert.equal(pulseTone('room.lobby_removal_pending', 'room.lobby_changed'), 'halted')
  })

  it('is done for everything else that happened', () => {
    assert.equal(pulseTone('goal.completed', 'goal.completed'), 'done')
    assert.equal(pulseTone('room.session', 'room.session_scheduled'), 'done')
    assert.equal(pulseTone('command.retire_sessions', 'command.retirement_changed'), 'done')
  })
})

describe('a sent command waits on Sophia until the goal shows it (one-truth.md)', () => {
  it('a Hold waits while the goal still runs or holds, and not once it is held', () => {
    for (const status of ['running', 'checking', 'holding'] as const)
      assert.equal(awaitsConfirmation('hold', status), true)
    assert.equal(awaitsConfirmation('hold', 'held'), false)
  })

  it('a Stop waits until the goal is stopped; a Resume until it runs again', () => {
    assert.equal(awaitsConfirmation('stop', 'stopping'), true)
    assert.equal(awaitsConfirmation('stop', 'stopped'), false)
    assert.equal(awaitsConfirmation('resume', 'held'), true)
    assert.equal(awaitsConfirmation('resume', 'running'), false)
  })

  it('a review settles nothing the goal shows, so it keeps waiting', () => {
    assert.equal(awaitsConfirmation('request_review', 'running'), true)
  })
})
