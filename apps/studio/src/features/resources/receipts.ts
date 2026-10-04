// Commands on work, and what is known of each (WBC-01 G4), kept apart in three dimensions (sophia.work.receipt.v1):
// admission (recorded, refused, unknown), delivery (queued, delivered, unknown) and effect (pending, held, stopped,
// resumed, unknown). Sending is the page's own state before any receipt, and never shown as a receipt. Receipts for
// one operation can come twice, late or out of order: the highest revision wins, Recorded is never taken back, and a
// settled effect is final. A receipt for other work, another assignment or another operation changes nothing here.
// A lost reply is unknown, not unsent: it is tried again with the same operation, never a new one.
//
// Commands are kept by their scope, (project, work, assignment, generation): a session given another assignment
// starts with none of the old one's commands or drafts. Pure: the words and rules are unit-tested.
import { exactly, instant, list, oneOf, orNull, problemsOf, record, text, whole, type Check } from '../../api/shape.ts'
import type { Session } from './resource.ts'

export type ReceiptKind = 'guidance' | 'hold' | 'resume' | 'stop' | 'decision' | 'ask_sophia'
export type Effect = 'not_applicable' | 'pending' | 'held' | 'stopped' | 'resumed' | 'choice_recorded' | 'unknown'

/** What the service observed of one operation, at one revision of its receipt. Not an authorization. */
export interface Receipt {
  schema_version: 'sophia.work.receipt.v1'
  operation_id: string
  receipt_id: string
  project_id: string
  work_id: string
  assignment_id: string | null
  assignment_generation: number | null
  kind: ReceiptKind
  revision: number
  observed_at: string
  admission: 'recorded' | 'rejected' | 'unknown'
  delivery: 'not_applicable' | 'not_sent' | 'queued' | 'delivered' | 'native_consumed' | 'unknown'
  effect: Effect
  rejection: 'conflict' | 'denied' | 'unavailable' | 'expired' | null
  evidence_refs: string[]
}

const id = text(160)
const ids = (max: number) => list(id, max)

const receipt: Check = record({
  schema_version: exactly('sophia.work.receipt.v1'),
  operation_id: id,
  receipt_id: id,
  project_id: id,
  work_id: id,
  assignment_id: orNull(id),
  assignment_generation: orNull(whole(1)),
  kind: oneOf(['guidance', 'hold', 'resume', 'stop', 'decision', 'ask_sophia']),
  revision: whole(1),
  observed_at: instant,
  admission: oneOf(['recorded', 'rejected', 'unknown']),
  delivery: oneOf(['not_applicable', 'not_sent', 'queued', 'delivered', 'native_consumed', 'unknown']),
  effect: oneOf(['not_applicable', 'pending', 'held', 'stopped', 'resumed', 'choice_recorded', 'unknown']),
  rejection: orNull(oneOf(['conflict', 'denied', 'unavailable', 'expired'])),
  evidence_refs: ids(100),
})

const SETTLED: Readonly<Partial<Record<Effect, ReceiptKind>>> = {
  held: 'hold',
  stopped: 'stop',
  resumed: 'resume',
  choice_recorded: 'decision',
}

function receiptRules(r: Receipt): string[] {
  const problems: string[] = []
  if (r.admission === 'rejected' && (r.delivery !== 'not_sent' || r.effect !== 'not_applicable' || !r.rejection)) {
    problems.push('$: a rejected operation was not sent, has no effect, and says why')
  }
  const settledBy = SETTLED[r.effect]
  if (settledBy) {
    if (r.admission !== 'recorded' || r.evidence_refs.length === 0)
      problems.push('$: a settled effect is recorded, with evidence')
    if (r.kind !== settledBy) problems.push(`$: only a ${settledBy} settles as ${r.effect}`)
  }
  return problems
}

const isReceipt = (value: unknown, problems: readonly string[]): value is Receipt => problems.length === 0

/** A receipt, accepted as given, or refused with every reason found. */
export function readReceipt(value: unknown): { ok: true; value: Receipt } | { ok: false; problems: string[] } {
  const problems = problemsOf(receipt, value)
  if (!isReceipt(value, problems)) return { ok: false, problems }
  const rules = receiptRules(value)
  return rules.length > 0 ? { ok: false, problems: rules } : { ok: true, value }
}

export type CommandKind = 'guidance' | 'hold' | 'resume' | 'stop'

/** Exactly what a command is for: the work, its assignment at one generation, and the attempt shown when it was sent. */
export interface CommandTarget {
  project_id: string
  work_id: string
  assignment_id: string | null
  assignment_generation: number | null
  attempt_id: string | null
  /** The native session it reaches, where the page knows one; never how the command is matched. */
  session_id: string | null
}

/** A command offered where it shows, with what it does when it isn't plain (a controlled stop that resumes later). */
export interface Offer {
  kind: CommandKind
  tip?: string
}

export interface Command {
  /** The person's one submission: reused, with the same payload, through every retry. */
  operation_id: string
  kind: CommandKind
  text?: string
  target: CommandTarget
}

/** The scope a command belongs to: its history, kept by work, assignment and generation. */
export const scopeOf = (t: CommandTarget) =>
  [t.project_id, t.work_id, t.assignment_id ?? '-', String(t.assignment_generation ?? '-')].join('|')

/** The execution a command is for, its attempt and session included: what a draft belongs to (Codex F-007). */
export const executionOf = (t: CommandTarget) => [scopeOf(t), t.attempt_id ?? '-', t.session_id ?? '-'].join('|')

const TARGET_FIELDS = [
  'project_id',
  'work_id',
  'assignment_id',
  'assignment_generation',
  'attempt_id',
  'session_id',
] as const satisfies readonly (keyof CommandTarget)[]

/** Whether two targets are the same execution, field for field: a new attempt or session is another target. */
export const sameTarget = (a: CommandTarget, b: CommandTarget) => TARGET_FIELDS.every((field) => a[field] === b[field])

/**
 * Which execution an earlier command was for, beside the one shown: an earlier attempt, or another session of it; null
 * when it is the one shown. Such a command is history: said, never sent again from here (Codex F-007).
 */
export function executionSaid(k: Known, shown: CommandTarget): string | null {
  const t = k.command.target
  if (t.attempt_id !== shown.attempt_id) return attemptSaid(t.attempt_id, shown.attempt_id)
  return t.session_id === shown.session_id ? null : 'for another session'
}

/**
 * Of two attempts that differ: an earlier one when both are named; when one isn't (Resources names no attempt), only
 * that, never "earlier" (Codex F-016).
 */
function attemptSaid(sent: string | null, shown: string | null): string {
  if (sent === null) return 'sent without naming its attempt'
  return shown === null ? 'sent naming its attempt' : 'for an earlier attempt'
}

type Observation = Pick<Receipt, 'revision' | 'admission' | 'delivery' | 'effect' | 'rejection'>

/** What is known of one command: on its way, its reply lost, or its latest receipt. */
export interface Known {
  command: Command
  /** `sending` until a receipt comes; `lost` when no reply came in time and none has come since. */
  local: 'sending' | 'lost' | null
  receipt: Observation | null
}

export const sending = (command: Command): Known => ({ command, local: 'sending', receipt: null })

const FINAL: ReadonlySet<Effect> = new Set(['held', 'stopped', 'resumed', 'choice_recorded'])

/** Whether a receipt speaks of this command: the same project, operation, work, assignment and generation. */
function speaksOf(known: Known, r: Receipt): boolean {
  const { command } = known
  const { target } = command
  return (
    r.project_id === target.project_id &&
    r.operation_id === command.operation_id &&
    r.kind === command.kind &&
    r.work_id === target.work_id &&
    r.assignment_id === target.assignment_id &&
    r.assignment_generation === target.assignment_generation
  )
}

/** How far delivery got. Unknown is no step: it says nothing of a delivery already established. */
const DELIVERY_RANK: Readonly<Record<Receipt['delivery'], number>> = {
  unknown: -1,
  not_applicable: 0,
  not_sent: 0,
  queued: 1,
  delivered: 2,
  native_consumed: 3,
}

/**
 * Delivery as it now stands: what the newer receipt says, except that a delivery once established (delivered, or
 * consumed by the session) is never taken back by a later one saying less, queued, not sent or unknown, as successive
 * dimension updates can (Codex F-014). Before it is established, a newer word, uncertainty included, stands. A
 * contradiction (recorded, then refused) makes it unknown, as before.
 */
function deliveryOf(before: Observation | null, r: Receipt, contradicted: boolean): Receipt['delivery'] {
  if (contradicted) return 'unknown'
  if (!before || !DELIVERED.has(before.delivery)) return r.delivery
  return DELIVERY_RANK[r.delivery] >= DELIVERY_RANK[before.delivery] ? r.delivery : before.delivery
}

/**
 * What a newer receipt adds to what was observed: Recorded is never taken back, nor a delivery established, nor a
 * settled effect. A later receipt that says unknown keeps them; one that says refused contradicts Recorded, so delivery
 * and effect become unknown rather than "nothing was sent".
 */
function observed(before: Observation | null, r: Receipt): Observation {
  const keep = before?.admission === 'recorded' && r.admission !== 'recorded'
  const contradicted = keep && r.admission === 'rejected'
  return {
    revision: r.revision,
    admission: keep ? 'recorded' : r.admission,
    delivery: deliveryOf(before, r, contradicted),
    effect: before && FINAL.has(before.effect) ? before.effect : contradicted ? 'unknown' : r.effect,
    rejection: keep ? null : r.rejection,
  }
}

/** A receipt folded into what is known: a stale, repeated or foreign one changes nothing, and nothing regresses. */
export function fold(known: Known, value: unknown): Known {
  const read = readReceipt(value)
  if (!read.ok || !speaksOf(known, read.value)) return known
  const r = read.value
  const before = known.receipt
  if (before && r.revision <= before.revision) return known
  return { command: known.command, local: null, receipt: observed(before, r) }
}

/** No reply in time: unknown, unless a receipt already said more. */
export const lost = (known: Known): Known => (known.receipt ? known : { ...known, local: 'lost' })

/** A retry of a command whose admission is unknown: on its way again, the same operation, said as sending. */
export const retried = (known: Known): Known =>
  known.local === 'lost' || known.receipt?.admission === 'unknown' ? { ...known, local: 'sending' } : known

const DELIVERED: ReadonlySet<Receipt['delivery']> = new Set(['delivered', 'native_consumed'])

/** Whether a command still needs watching: not refused, and not yet as far as it can be confirmed. */
export function unresolved(k: Known): boolean {
  const r = k.receipt
  if (k.local !== null || !r || r.admission === 'unknown') return true
  if (r.admission === 'rejected') return false
  return k.command.kind === 'guidance' ? !DELIVERED.has(r.delivery) : !FINAL.has(r.effect)
}

/** Whether a command's admission is unknown: its reply lost, or a receipt that couldn't say. */
export const againable = (k: Known) => k.local === 'lost' || (k.local === null && k.receipt?.admission === 'unknown')

/**
 * Whether a command may be tried again from here now (Codex F-002, F-007): its admission unknown, its kind among what
 * may be sent here now (on a task, the view's per-viewer actions while its state is observed; on a resource's row, its
 * route), and its target the execution shown now, field for field. Otherwise it is kept, uncertain, with its own
 * operation: until it may, or as an earlier execution's history. One rule for the button and the send.
 */
export const retryableNow = (k: Known, sendable: ReadonlySet<CommandKind>, shown: CommandTarget) =>
  againable(k) && sendable.has(k.command.kind) && sameTarget(k.command.target, shown)

/** Whether a command's outcome is in doubt: its reply lost, or a dimension the runtime couldn't confirm. */
export const uncertain = (k: Known) =>
  k.local === 'lost' ||
  k.receipt?.admission === 'unknown' ||
  k.receipt?.delivery === 'unknown' ||
  k.receipt?.effect === 'unknown'

const REFUSED: Readonly<Record<NonNullable<Receipt['rejection']>, string>> = {
  conflict: 'This changed before it was sent. Nothing was sent.',
  denied: 'Not allowed here. Nothing was sent.',
  unavailable: 'Not available right now. Nothing was sent.',
  expired: 'Too late for this now. Nothing was sent.',
}

const CONTROL: Readonly<Record<Exclude<CommandKind, 'guidance'>, { name: string; settled: string }>> = {
  hold: { name: 'Hold', settled: 'Held. Work and remaining allowance are retained.' },
  resume: { name: 'Resume', settled: 'Resumed.' },
  stop: { name: 'Stop', settled: 'Stopped. Completed work is kept.' },
}

function guidanceSaid(r: Observation): string {
  if (DELIVERED.has(r.delivery)) return 'Delivered to the session; not yet verified in the result.'
  return r.delivery === 'unknown'
    ? 'Guidance recorded. Its delivery isn’t confirmed.'
    : 'Guidance recorded; delivery pending.'
}

function controlSaid(kind: Exclude<CommandKind, 'guidance'>, r: Observation): string {
  const { name, settled } = CONTROL[kind]
  if (FINAL.has(r.effect)) return settled
  if (r.effect === 'unknown' || r.delivery === 'unknown')
    return `${name} requested. The runtime’s state is not confirmed yet.`
  return `${name} requested; waiting for the runtime to confirm.`
}

/**
 * What is known of a command, in the words a person reads under it. `retryable`: whether it may be sent again from
 * here now. When it may not (its task isn't observed, or the viewer may no longer send it), its uncertainty is still
 * said, and its operation kept for when it may.
 */
export function knownSaid(k: Known, retryable = true): string {
  const r = k.receipt
  if (k.local === 'sending') return 'Sending…'
  if (!r || r.admission === 'unknown')
    return retryable
      ? 'Not confirmed whether it was recorded. Try again: it reuses the same request.'
      : 'Not confirmed whether it was recorded. It can’t be sent again from here now; it is kept as it was.'
  if (r.admission === 'rejected') return REFUSED[r.rejection ?? 'unavailable']
  return k.command.kind === 'guidance' ? guidanceSaid(r) : controlSaid(k.command.kind, r)
}

/** The three steps a command's bars show, by kind: guidance is delivered; a control takes effect. */
const SETTLED_STEP: Readonly<Record<Exclude<CommandKind, 'guidance'>, string>> = {
  hold: 'Held',
  resume: 'Resumed',
  stop: 'Stopped',
}

export const stepsOf = (kind: CommandKind): [string, string, string] =>
  kind === 'guidance' ? ['Recorded', 'Queued', 'Delivered'] : ['Recorded', 'Delivered', SETTLED_STEP[kind]]

/** How many of the three steps are observed: -1 before admission. */
export function reached(k: Known): number {
  const r = k.receipt
  if (!r || r.admission !== 'recorded') return -1
  if (k.command.kind === 'guidance') return DELIVERED.has(r.delivery) ? 2 : r.delivery === 'queued' ? 1 : 0
  if (FINAL.has(r.effect)) return 2
  return DELIVERED.has(r.delivery) ? 1 : 0
}

/**
 * A session's work, as a command's target: only once its runtime says which assignment it is and its generation. A
 * command without them couldn't be refused as stale, and could reach work that replaced it (PR #76 review), so until
 * then there is no target, and nothing is sent.
 */
export function sessionTarget(project: string, session: Session): CommandTarget | null {
  const work = session.assignment
  if (!work?.id || work.epoch === undefined) return null
  return {
    project_id: project,
    work_id: work.workId,
    assignment_id: work.id,
    assignment_generation: work.epoch,
    attempt_id: null,
    session_id: session.id,
  }
}

/** Why a session at work can't be acted on yet: its assignment isn't fenced (sessionTarget). */
export const UNFENCED =
  'Nothing can be sent to it yet: its runtime hasn’t said which assignment this is, or its generation, so a command could reach work that replaced it.'
