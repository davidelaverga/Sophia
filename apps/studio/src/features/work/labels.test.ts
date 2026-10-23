import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { goalCommands, summaryLabel } from './labels.ts'

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
