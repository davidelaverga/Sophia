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
  // A completed goal's sessions still attached (0075, A41): project admins only; the goal stays completed.
  retire_sessions: {
    verb: 'Retire remaining sessions',
    noun: 'Retirement',
    requested: 'Retirement requested',
    hint: 'Stop the sessions still attached to this completed goal; it stays completed',
    allowed: ['completed'],
  },
}

const ORDER: readonly CommandKind[] = ['request_review', 'hold', 'resume', 'stop', 'retire_sessions']

/** The controls a goal offers, in order: by its status; Retire remaining sessions to a project admin only (A41). */
export const commandsFor = (status: Goal['status'], admin: boolean): CommandKind[] =>
  ORDER.filter((kind) => COMMAND[kind].allowed.includes(status) && (kind !== 'retire_sessions' || admin))

/**
 * A goal's commands on this page: `commandsFor`, with Request review only under the vision flag. The lead's review
 * ('lead.review' in the outbox) has no consumer yet, so in production its receipt would wait for ever; the fixtures'
 * lead answers it (docs/plans/prod-asks.md).
 */
export const goalCommands = (status: Goal['status'], vision: boolean, admin = false): CommandKind[] =>
  commandsFor(status, admin).filter((kind) => vision || kind !== 'request_review')

/**
 * Where each command leads the goal, once the runtime confirms it: Hold to held, Stop to stopped, Resume back to work.
 * A review leaves the goal as it is, and a retirement its sessions, so neither is ever shown by the goal's status.
 */
const LEADS_TO: Partial<Record<CommandKind, ReadonlyArray<Goal['status']>>> = {
  hold: ['held'],
  stop: ['stopped'],
  resume: ['running', 'checking'],
}

/** Where a command passes on its way: the goal moved at admission, until the runtime confirms (Hold, Stop). */
const ON_THE_WAY: Partial<Record<CommandKind, Goal['status']>> = { hold: 'holding', stop: 'stopping' }

/**
 * A sent command's line under the controls: on its way (said, with «The status changes when Sophia confirms»);
 * settled, the goal where the command leads (the status says it; a screen reader hears it in the past); or moved, the
 * goal taken elsewhere by a later command, anyone's (nothing more to say). demo-findings-1.md #3.
 */
export type CommandLine = 'on_its_way' | 'settled' | 'moved'

/**
 * The line once the goal reads as `goal`, for a command sent at authority `sentEpoch`. Its own admission moves the
 * authority one step; one past that is a later command. Settled or moved, it stays so until another command is sent
 * (review P2-2): a goal running again after a Hold never brings the Hold's words back.
 */
export function nextLine(
  line: CommandLine,
  kind: CommandKind,
  sentEpoch: number,
  goal: Pick<Goal, 'status' | 'authorityEpoch'>,
): CommandLine {
  if (line !== 'on_its_way') return line
  if (goal.authorityEpoch > sentEpoch + 1) return 'moved'
  if (LEADS_TO[kind]?.includes(goal.status)) return 'settled'
  if (COMMAND[kind].allowed.includes(goal.status) || ON_THE_WAY[kind] === goal.status) return 'on_its_way'
  return 'moved'
}

/** A settled command, said in the past where only a screen reader hears it: the status beside it shows it already. */
export const SETTLED_WORDS: Partial<Record<CommandKind, string>> = {
  hold: 'Held.',
  stop: 'Stopped.',
  resume: 'Resumed.',
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
  'command.retire_sessions': 'Retirement of remaining sessions requested',
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
  // A person's task (A39): made, given to someone (or to nobody), done.
  'task.created': 'Task created',
  'task.owner_set': 'Task assigned',
  'task.done': 'Task done',
  // What someone sent from the composer, by its intent (the composer says "Shared with the project" too).
  'contribution.discuss': 'Shared with the project',
  'contribution.ask_sophia': 'Question for Sophia',
  'contribution.propose_work': 'Work proposed',
}

/**
 * Words for any event: its summary, or else its type without the code ("room.lobby_changed" → "Lobby changed").
 * A type that ends in one bare word keeps its subject ("contribution.recorded" → "Contribution recorded").
 */
/**
 * A command's later events carry its summary code but are not new requests (R-C75-UI-1): a retirement's progress and a
 * control that was not confirmed or not carried out say what they are, so one admission stays one «requested».
 */
const COMMAND_LATER: Record<string, (noun: string) => string> = {
  'command.retirement_changed': () => 'Retirement of remaining sessions: session results updated',
  'command.outcome_unknown': (noun) => `${noun} not confirmed`,
  'command.denied': (noun) => `${noun} not carried out`,
}

const isCommandKind = (kind: string): kind is CommandKind => Object.hasOwn(COMMAND, kind)

/** The command a summary code names, as a noun («Stop», «Retirement»), or «Command». */
const commandNoun = (summaryCode: string): string => {
  const kind = summaryCode.startsWith('command.') ? summaryCode.slice('command.'.length) : ''
  return isCommandKind(kind) ? COMMAND[kind].noun : 'Command'
}

export function summaryLabel(summaryCode: string, type: string): string {
  const later = summaryCode.startsWith('command.') ? COMMAND_LATER[type] : undefined
  if (later) return later(commandNoun(summaryCode))
  const known = SUMMARY[summaryCode]
  if (known) return known
  const parts = type.split('.')
  const last = parts.pop() ?? type
  const words = (last.includes('_') || parts.length === 0 ? last : `${parts.join(' ')} ${last}`).replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * What a pulse row's dot says (one-truth.md), the label still saying it in words: asked (a command sent, a guest at the
 * door), done, or halted (a goal held or stopped, a command not carried out or not confirmed).
 */
export type PulseTone = 'asked' | 'done' | 'halted'

const HALTED: ReadonlySet<string> = new Set([
  'goal.held',
  'goal.stopped',
  'command.denied',
  'command.outcome_unknown',
  'room.lobby_removal_pending',
])
const ASKED: ReadonlySet<string> = new Set(['room.lobby_knock', 'native_task.research'])

export function pulseTone(summaryCode: string, type: string): PulseTone {
  if (HALTED.has(type) || HALTED.has(summaryCode)) return 'halted'
  if (summaryCode.startsWith('command.')) return COMMAND_LATER[type] ? 'done' : 'asked'
  return ASKED.has(summaryCode) ? 'asked' : 'done'
}

type Retirement = NonNullable<Goal['retirement']>
type RetirementResult = Retirement['targets'][number]['result']

/**
 * Each admitted session's own result, in words (A41). Only what the runtime said: a live fence is reported as such; a
 * durable restop and a settlement without contact say what they are; nothing claims memory freed or a provider quiet.
 */
export const RETIREMENT_RESULT: Record<RetirementResult, { words: string; tone: Tone }> = {
  pending: { words: 'Waiting for the runtime', tone: 'lav' },
  live_reported: { words: 'Stopped: the runtime reported it idle and its handle released', tone: 'teal' },
  durable_only: { words: 'Fenced: its stopped state stands; whether it was still busy isn’t known', tone: 'muted' },
  checked: { words: 'Stopped, as the runtime confirmed', tone: 'teal' },
  no_contact: { words: 'No session to contact: settled without the runtime', tone: 'muted' },
  outcome_unknown: { words: 'Not confirmed: the runtime didn’t say', tone: 'amber' },
  failed: { words: 'Not stopped: the runtime reported a failure', tone: 'rose' },
  rejected: { words: 'Not stopped: the runtime refused it', tone: 'rose' },
  denied: { words: 'Not sent: no runtime could take it', tone: 'rose' },
  superseded: { words: 'Not sent: a later control replaced it', tone: 'muted' },
}

const SETTLED: ReadonlySet<RetirementResult> = new Set(['live_reported', 'durable_only', 'checked', 'no_contact'])

/** The retirement as a whole: in flight, every session answered, or not all of them (never «all stopped» on faith). */
export function retirementView(retirement: Retirement): {
  summary: string
  lines: { key: string; session: string; words: string; tone: Tone }[]
} {
  const results = retirement.targets.map((t) => t.result)
  const open = results.filter((r) => r === 'pending').length
  const answered = results.filter((r) => SETTLED.has(r)).length
  const summary =
    results.length === 0
      ? 'No session was left to retire.'
      : open > 0
        ? `Retiring ${String(results.length)} sessions: ${String(open)} still waiting for the runtime.`
        : answered === results.length
          ? `Every one of the ${String(results.length)} sessions has an answer; each says what it means.`
          : `Not every session was stopped: ${String(results.length - answered)} of ${String(results.length)} weren’t confirmed.`
  const lines = retirement.targets.map((t) => ({
    key: t.bindingId,
    session: t.nativeSessionId ?? t.attemptId,
    words: RETIREMENT_RESULT[t.result].words,
    tone: RETIREMENT_RESULT[t.result].tone,
  }))
  return { summary, lines }
}
