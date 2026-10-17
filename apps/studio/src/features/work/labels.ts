import type { Goal, GoalCommand } from '@sophia/contracts'

import type { Tone } from '@sophia/ui'

/** Status is always spelled out; color only reinforces it. */
export const GOAL_STATUS: Record<Goal['status'], { label: string; tone: Tone }> = {
  ready: { label: 'Ready', tone: 'lav' },
  running: { label: 'Running', tone: 'teal' },
  checking: { label: 'Checking', tone: 'teal' },
  holding: { label: 'Holding', tone: 'amber' },
  held: { label: 'Held', tone: 'amber' },
  stopping: { label: 'Stopping', tone: 'rose' },
  stopped: { label: 'Stopped', tone: 'muted' },
  completed: { label: 'Completed', tone: 'muted' },
}

export type CommandKind = Exclude<GoalCommand['kind'], 'steer'>

interface Command {
  verb: string
  noun: string
  /** What was sent, in the words of the Work pulse. */
  requested: string
  /** What the button does, for its tip. */
  hint: string
  allowed: ReadonlyArray<Goal['status']>
}

export const COMMAND: Record<CommandKind, Command> = {
  request_review: {
    verb: 'Request review',
    noun: 'Review request',
    requested: 'Review requested',
    hint: 'Ask for a review of the progress so far',
    allowed: ['ready', 'running', 'checking'],
  },
  hold: {
    verb: 'Hold',
    noun: 'Hold',
    requested: 'Hold requested',
    hint: 'Pause the work; you can resume it',
    allowed: ['running', 'checking'],
  },
  resume: {
    verb: 'Resume',
    noun: 'Resume',
    requested: 'Resume requested',
    hint: 'Continue the work where it paused',
    allowed: ['held'],
  },
  stop: {
    verb: 'Stop',
    noun: 'Stop',
    requested: 'Stop requested',
    hint: 'End the work for good',
    allowed: ['ready', 'running', 'checking', 'holding', 'held'],
  },
}

const ORDER: readonly CommandKind[] = ['request_review', 'hold', 'resume', 'stop']

/**
 * A goal's commands in its state, in order. Request review only under the vision flag: the lead's review
 * ('lead.review' in the outbox) has no consumer yet, so in production its receipt would wait for ever; the fixtures'
 * lead answers it (docs/plans/prod-asks.md).
 */
export const goalCommands = (status: Goal['status'], vision: boolean): CommandKind[] =>
  ORDER.filter((kind) => (vision || kind !== 'request_review') && COMMAND[kind].allowed.includes(status))

/**
 * Command summaries describe what was *requested* (admission is not completion); room and membership
 * summaries describe what happened.
 */
export const SUMMARY: Record<string, string> = {
  'command.request_review': 'Review requested',
  'command.hold': 'Hold requested',
  'command.stop': 'Stop requested',
  'command.resume': 'Resume requested',
  'command.steer': 'Steer sent to the lead',
  'room.input_floor': 'Input to Sophia passed',
  'room.session': 'Session scheduled',
  'room.session_canceled': 'Session cancelled',
  'room.invitation': 'Invitation link issued',
  'room.invitation_revoked': 'Invitation link closed',
  'room.lobby_knock': 'A guest asked to come in',
  'room.lobby_admit': 'Guest let in',
  'room.lobby_deny': 'Guest declined',
  'room.lobby_block': 'Guest blocked',
  'room.lobby_unblock': 'Guest unblocked',
  'native_task.waiting': 'Brief waiting for Sophia',
  'native_task.research': 'Research requested',
  'room.lobby_removal_pending': 'Taking a guest out of the call: not confirmed yet',
  'room.lobby_removal_removed': 'Guest taken out of the call',
  'room.lobby_removal_absent': 'Guest confirmed out of the call',
  'room.exchange_opened': 'Sophia asked into the conversation',
  'room.exchange_end': 'Sophia left the conversation',
  'room.exchange_stop_speaking': 'Sophia asked to stop speaking',
  'room.exchange_look': 'Sophia shown a screen or camera',
  'room.exchange_stop_looking': 'Sophia stopped looking',
  'room.exchange_resume': 'Sophia resumed',
  'room.exchange_guest': 'Sophia paused for a guest',
  'room.exchange_holder_left': 'Sophia paused: the speaker was not in the room',
  'room.exchange_empty': 'Sophia left: nobody was in the room',
  'room.input_floor_released': 'Input to Sophia released',
  'project.member': 'Member joined',
  'project.member_left': 'Member left',
  'project.member_removed': 'Member removed',
  'project.member_role': 'Role changed',
  'project.created': 'Project created',
  'room.host_muted': 'Muted in the call by an admin',
  'room.host_removed': 'Taken out of the call by an admin',
  'room.host_camera_off': 'Camera turned off by an admin',
  'room.host_screen_off': 'Screen sharing stopped by an admin',
  'room.host_muted_all': 'Everyone muted by an admin',
  'goal.target': 'Goal owner or date set',
  'project.renamed': 'Project renamed',
  'project.archived': 'Project archived',
  'project.unarchived': 'Project brought back',
  // What someone sent from the composer, by its intent (the composer says "Shared with the project" too).
  'contribution.discuss': 'Shared with the project',
  'contribution.ask_sophia': 'Question for Sophia',
  'contribution.propose_work': 'Work proposed',
}

/**
 * Words for any event: its summary, or else its type without the code ("room.lobby_changed" → "Lobby changed").
 * A type that ends in one bare word keeps its subject ("contribution.recorded" → "Contribution recorded").
 */
export function summaryLabel(summaryCode: string, type: string): string {
  const known = SUMMARY[summaryCode]
  if (known) return known
  const parts = type.split('.')
  const last = parts.pop() ?? type
  const words = (last.includes('_') || parts.length === 0 ? last : `${parts.join(' ')} ${last}`).replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
