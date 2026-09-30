import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { summaryLabel } from './labels.ts'

describe('event words in the work pulse', () => {
  it('names room access and membership events', () => {
    assert.equal(summaryLabel('room.lobby_knock', 'room.lobby_changed'), 'A guest asked to come in')
    assert.equal(summaryLabel('room.session', 'room.session_scheduled'), 'Session scheduled')
    assert.equal(summaryLabel('project.member', 'project.member_joined'), 'Member joined')
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
