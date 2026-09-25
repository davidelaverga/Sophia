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
})
