import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal } from '@sophia/contracts'
import {
  goalCommands,
  nextLine,
  pulseTone,
  SETTLED_WORDS,
  summaryLabel,
  type CommandKind,
  type CommandLine,
} from './labels.ts'

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

describe('a sent command’s line, as the goal moves (demo-findings-1.md #3, review P2-2)', () => {
  // Hold sent at authority 4: its admission moves the goal to 5; anyone's later command, past it.
  const SENT = 4
  /** The line after the goal went through these states, from a line on its way. */
  const after = (kind: CommandKind, steps: [Goal['status'], number][]): CommandLine =>
    steps.reduce<CommandLine>(
      (line, [status, epoch]) => nextLine(line, kind, SENT, { status, authorityEpoch: epoch }),
      'on_its_way',
    )

  it('is on its way while the goal is still getting there, or not read again yet', () => {
    assert.equal(after('hold', [['running', SENT]]), 'on_its_way')
    assert.equal(after('hold', [['holding', SENT + 1]]), 'on_its_way')
    assert.equal(after('stop', [['stopping', SENT + 1]]), 'on_its_way')
    assert.equal(after('resume', [['held', SENT]]), 'on_its_way')
  })

  it('is settled once the goal is where the command leads: Hold held, Stop stopped, Resume back to work', () => {
    assert.equal(
      after('hold', [
        ['holding', SENT + 1],
        ['held', SENT + 1],
      ]),
      'settled',
    )
    assert.equal(after('stop', [['stopped', SENT + 1]]), 'settled')
    assert.equal(after('resume', [['running', SENT + 1]]), 'settled')
    assert.equal(after('resume', [['checking', SENT + 1]]), 'settled')
  })

  it('Hold, then the goal running again: no line, the settled Hold stays settled', () => {
    assert.equal(
      after('hold', [
        ['held', SENT + 1],
        ['running', SENT + 2],
      ]),
      'settled',
    )
  })

  it('Hold, then stopped by someone else: no line, never the Hold’s pending words again', () => {
    assert.equal(
      after('hold', [
        ['holding', SENT + 1],
        ['stopping', SENT + 2],
      ]),
      'moved',
    )
    assert.equal(
      after('hold', [
        ['holding', SENT + 1],
        ['stopping', SENT + 2],
        ['stopped', SENT + 2],
      ]),
      'moved',
    )
  })

  it('a command after ours, even one that leads where ours did, is someone else’s outcome: moved', () => {
    // Held, resumed and held again by others before this page read it: not this Hold's confirmation.
    assert.equal(after('hold', [['held', SENT + 3]]), 'moved')
    // Resumed by another while it was on its way, never seen held: the Hold's words never come back.
    assert.equal(
      after('hold', [
        ['holding', SENT + 1],
        ['running', SENT + 2],
      ]),
      'moved',
    )
  })

  it('a review, which leaves the goal as it is, stays on its way until the goal moves', () => {
    assert.equal(after('request_review', [['running', SENT]]), 'on_its_way')
    assert.equal(after('request_review', [['holding', SENT + 1]]), 'moved')
  })

  it('says a settled command in the past, for a screen reader: the status beside it already shows it', () => {
    assert.equal(SETTLED_WORDS.hold, 'Held.')
    assert.equal(SETTLED_WORDS.stop, 'Stopped.')
    assert.equal(SETTLED_WORDS.resume, 'Resumed.')
  })
})
