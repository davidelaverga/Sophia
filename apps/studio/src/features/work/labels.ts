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

export const COMMAND: Record<CommandKind, { verb: string; noun: string; allowed: ReadonlyArray<Goal['status']> }> = {
  request_review: { verb: 'Request review', noun: 'Review request', allowed: ['ready', 'running', 'checking'] },
  hold: { verb: 'Hold', noun: 'Hold', allowed: ['running', 'checking'] },
  resume: { verb: 'Resume', noun: 'Resume', allowed: ['held'] },
  stop: { verb: 'Stop', noun: 'Stop', allowed: ['ready', 'running', 'checking', 'holding', 'held'] },
}

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
  'room.session_canceled': 'Session canceled',
  'room.invitation': 'Invitation link issued',
  'room.invitation_revoked': 'Invitation link closed',
  'room.lobby_knock': 'A guest asked to come in',
  'room.lobby_admit': 'Guest let in',
  'room.lobby_deny': 'Guest not let in',
  'project.member': 'Member joined',
}

/** Words for any event: its summary, or else its type without the code ("room.lobby_changed" → "Lobby changed"). */
export function summaryLabel(summaryCode: string, type: string): string {
  const known = SUMMARY[summaryCode]
  if (known) return known
  const words = (type.split('.').pop() ?? type).replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
