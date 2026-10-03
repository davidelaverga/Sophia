// What a v1.2 guide is told of a task's own standing and of a control it asked for (CX-0026 STEER). Pure. A refused
// control changed nothing and left nothing waiting (its write rolled back), so every refusal here starts "Not applied."
// and never says admitted, queued or "will be applied"; it says why from where the task stands now, keyed on the
// action, the goal's status and the task's own job. An accepted steer is not applied yet, and nothing reports back
// to the guide when it is. A task's state is its own job's, never only its goal's: a lineage shares its goal, and
// 0022's phase lets the goal's Hold or Stop hide that a task already finished.
import type { TaskStanding } from '@sophia/persistence'

export type Control = 'hold' | 'resume' | 'stop' | 'steer'

export type TaskState =
  | 'waiting_to_start'
  | 'running'
  | 'finished'
  | 'ended_without_report'
  | 'on_hold'
  | 'stopped'
  | 'refused'
  | 'unconfirmed'

const ENDED: Partial<Record<TaskStanding['state'], TaskState>> = {
  succeeded: 'finished',
  failed: 'ended_without_report',
  cancelled: 'stopped',
  outcome_unknown: 'unconfirmed',
}

const UNDER_WAY: Partial<Record<TaskStanding['phase'], TaskState>> = {
  holding: 'on_hold',
  held: 'on_hold',
  stopping: 'stopped',
  stopped: 'stopped',
  queued: 'waiting_to_start',
  dispatched: 'waiting_to_start',
}

/** The task's own state: its job's when that ended, else what holds it now. */
export function taskStateOf(s: Pick<TaskStanding, 'state' | 'phase'>): TaskState {
  if (s.phase === 'denied') return 'refused'
  return ENDED[s.state] ?? UNDER_WAY[s.phase] ?? 'running'
}

/** Whether Steer reaches this task itself: only while it waits to start or runs. */
export const steerOf = (s: Pick<TaskStanding, 'state' | 'phase'>): 'possible' | 'not_possible' => {
  const state = taskStateOf(s)
  return state === 'waiting_to_start' || state === 'running' ? 'possible' : 'not_possible'
}

/** A steer named a task that ended while nothing of its goal is under way: no work is left to receive it. */
export const endedWithNothingUnderWay = (s: TaskStanding): boolean =>
  ['succeeded', 'failed', 'cancelled'].includes(s.state) && s.inFlight.length === 0

export interface NotApplied {
  code: `not_applied:${string}`
  applied: false
  pending: false
  reason: string
  next?: string
  /** For research that ended: the version it published, and the report's version now. */
  publishedVersion?: number
  currentVersion?: number
}

const NOTHING = 'Nothing was changed and nothing is waiting.'

const notApplied = (why: string, reason: string, next?: string): NotApplied => ({
  code: `not_applied:${why}`,
  applied: false,
  pending: false,
  reason: `Not applied. ${reason}`,
  ...(next === undefined ? {} : { next }),
})

export interface Refused {
  action: Control
  /** What the write was refused as: a state that does not take the action, or a revision that moved meanwhile. */
  refusedAs: 'invalid_state' | 'stale_revision'
  /** The task as read after the refusal; null when it could not be read. */
  standing: TaskStanding | null
  /** Whether the research gate is open; null when unknown, which leaves the call to answer. */
  researchGate: boolean | null
}

/** For a steer on research that ended: offer a follow-up, which the person confirms, only while one can start. */
function followUp(r: Refused, s: TaskStanding): string | undefined {
  if (r.action !== 'steer' || s.kind !== 'research' || s.latestTaskId === null) return undefined
  if (r.researchGate === false)
    return 'A follow-up cannot be started now: research is not switched on for this project.'
  return `If they want it changed, offer a follow-up (start_research with amendsTaskId ${s.latestTaskId}); start it only if they confirm.`
}

/** The report's version now, when it is not the one this task published. */
function nowAt(s: TaskStanding): string {
  const current = s.current?.versionNumber
  if (current === undefined || current === s.published?.versionNumber) return ''
  return s.published
    ? `; the report is now at version ${String(current)}`
    : `; the report is still at version ${String(current)}`
}

/** The versions a reason names, as numbers too. */
const versions = (s: TaskStanding) => ({
  ...(s.published ? { publishedVersion: s.published.versionNumber } : {}),
  ...(s.current ? { currentVersion: s.current.versionNumber } : {}),
})

/** A task that ended: finished with its version, ended without one, or stopped. */
function ended(r: Refused, s: TaskStanding): NotApplied | null {
  const subject = s.kind === 'research' ? 'This research' : 'This work'
  if (s.state === 'succeeded') {
    const version = s.published ? ` and published version ${String(s.published.versionNumber)}` : ''
    const why = `${subject} already finished${version}${nowAt(s)}. ${NOTHING}`
    return { ...notApplied('finished', why, followUp(r, s)), ...versions(s) }
  }
  if (s.state === 'failed') {
    const why = `${subject} ended without a report${nowAt(s)}. ${NOTHING}`
    return { ...notApplied('ended_without_report', why, followUp(r, s)), ...versions(s) }
  }
  if (s.state === 'cancelled') return notApplied('stopped', `${subject} was stopped. ${NOTHING}`)
  return null
}

/** The work moved between the read and the write: the guide reads it again before asking again. */
const changed = () =>
  notApplied(
    'changed',
    `It changed while this was asked. ${NOTHING}`,
    'Read project_status, then ask again if it still applies.',
  )

/** Work still under way that does not take this action in the state its goal is in. */
function notNow(r: Refused, s: TaskStanding): NotApplied {
  const status = s.goalStatus
  if (status === 'stopping' || status === 'stopped') return notApplied('stopped', `This work was stopped. ${NOTHING}`)
  if (r.action === 'resume') {
    if (status === 'holding') return notApplied('settling', `The Hold is still settling; ask again shortly. ${NOTHING}`)
    if (status !== 'held') return notApplied('not_held', `It is not on hold. ${NOTHING}`)
  } else if (status === 'holding' || status === 'held') {
    const what = r.action === 'hold' ? 'It is already on hold.' : 'It is on hold: resume it first.'
    return notApplied('on_hold', `${what} ${NOTHING}`)
  } else if (r.action === 'hold' && status === 'ready') {
    const work = s.kind === 'research' ? 'the research' : 'the work'
    return notApplied(
      'not_started',
      `A Hold takes effect once ${work} is running; it is still waiting to start. Stop works now. ${NOTHING}`,
    )
  }
  return changed()
}

/**
 * Why a control was not applied, from where the task stands now. A task that ended answers for itself only while
 * nothing of its goal is under way; otherwise the goal's state refused it (a follow-up held, say), and says why.
 */
export function refusedControl(r: Refused): NotApplied {
  const s = r.standing
  if (!s) return notApplied('unread', `${NOTHING} Read project_status.`)
  if (r.refusedAs === 'stale_revision') return changed()
  return (s.inFlight.length === 0 ? ended(r, s) : null) ?? notNow(r, s)
}

/** How an accepted steer names the state of the work it reaches; any other state (unconfirmed, say) is not named. */
const STEERED: Partial<Record<TaskState, string>> = { waiting_to_start: 'waiting-to-start', running: 'running' }

/** The task an accepted steer reaches: the named one while under way, else the goal's newest under way. */
function receiver(s: TaskStanding): { taskId: string; state: TaskState } | null {
  if (!ENDED[s.state]) return { taskId: s.taskId, state: taskStateOf(s) }
  const next = s.inFlight[0]
  return next ? { taskId: next.taskId, state: taskStateOf(next) } : null
}

/**
 * An accepted steer's note: where it went, and that it is not applied yet and no confirmation comes back here. With no
 * work under way (a retry answered by its first receipt after the work ended), it says only where to look.
 */
export function steerAccepted(s: TaskStanding | null): string {
  const after = 'It is not applied yet, and no confirmation comes back here.'
  const to = s && receiver(s)
  if (!s || !to) return 'Steer accepted. No confirmation comes back here; project_status says where the work stands.'
  const when = STEERED[to.state]
  const what = `${when ? `${when} ` : ''}${s.kind === 'research' ? 'research' : 'work'}`
  return `Steer accepted for ${what} (taskId ${to.taskId}). ${after}`
}
