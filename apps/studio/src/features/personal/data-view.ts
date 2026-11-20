// "Your data" (direction C): what the personal space keeps, counted, and everything as plain text to copy. Pure.
// A controlled space's copy (A54's export, INC03-DES-001) says under each message how its answer stands: its control,
// what it replaces or was replaced by, each decision and call (their money as recorded: never an amount, a route or a
// payer), and every answer kept aside, in full.
import type {
  PersonalAnswerControlCall,
  PersonalAnswerControlView,
  PersonalAnswerDecision,
  PersonalAnswerPrior,
  PersonalControlledExport,
  PersonalControlledTurn,
  PersonalExport,
} from '@sophia/contracts'
import type { ControlledExport, SpaceRead } from '../../api/personal.ts'
import { clock } from '../../app/time-words.ts'
import { controlLine } from './conversation-view.ts'

export interface Facts {
  days: number
  notes: number
  carried: number
}

/** The days are the server's count over the whole conversation (a long one lists only its newest turns). */
export function factsOf(space: Pick<SpaceRead, 'days' | 'notes' | 'releases'>): Facts {
  return { days: space.days, notes: space.notes.length, carried: space.releases.length }
}

export const factWords = (facts: Facts) => ({
  days: `day${facts.days === 1 ? '' : 's'} with Sophia`,
  notes: `note${facts.notes === 1 ? '' : 's'}`,
  carried: 'carried to work',
})

/** A day as a copy kept for later says it: in full, never in words relative to the day it was made (export-dates.md). */
const FULL_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

/** A moment as the copy says it: its day in full and its time. */
const fullTime = (iso: string) => {
  const at = new Date(iso)
  return `${FULL_DAY.format(at)}, ${clock(at)}`
}

/** An export: A10's, or a controlled space's (A54's, with each page's inputs). */
type Everything = PersonalExport | PersonalControlledExport | ControlledExport

const OPERATION: Record<PersonalAnswerDecision['operation'], string> = {
  send: 'Sent',
  retry: 'Asked again',
  cancel: 'Cancelled',
}
const DECISION_REASON: Record<NonNullable<PersonalAnswerDecision['reason']>, string> = {
  payer_unavailable: 'no one could pay for it',
  cancelled_by_owner: 'cancelled by you',
}
const COST: Record<PersonalAnswerControlCall['financial'], string> = {
  reserved_active: 'cost reserved',
  reserved_orphan: 'cost reserved, its call lost',
  uncertain: 'cost not known',
  settled: 'cost settled',
  released: 'cost released',
}
const PRIOR_COST: Record<PersonalAnswerPrior['financial'], string> = {
  none: 'no cost',
  unresolved: 'cost not settled yet',
  settled: 'cost settled',
}
const LAUNCH: Record<PersonalAnswerControlCall['launch'], string> = {
  untagged: 'launch not tagged',
  tagged: 'launch tagged',
  launching: 'launching',
  denied: 'launch denied',
  refused: 'launch refused',
}
const ANSWER: Record<PersonalAnswerPrior['answer'], string> = {
  none: 'no answer',
  in_progress: 'answer in progress',
  published: 'answer published',
  kept_unpublished: 'answer kept, not published',
  withheld: 'answer kept aside',
  no_answer: 'ended without an answer',
  unknown: 'answer not known',
}
const KEPT_FROM: Record<PersonalAnswerControlView['withheld'][number]['source'], string> = {
  late_settlement: 'late settlement',
  kept_transfer: 'kept on transfer',
}

/** Each input of the export by id, with a stable reference the copy names it by (input 1, 2, … in order). */
interface Inputs {
  views: ReadonlyMap<string, PersonalAnswerControlView>
  number: ReadonlyMap<string, number>
}

const inputsOf = (views: readonly PersonalAnswerControlView[]): Inputs => ({
  views: new Map(views.map((v) => [v.inputId, v] as const)),
  number: new Map(views.map((v, i) => [v.inputId, i + 1] as const)),
})

/** An input as the copy names it: its reference and its message's time, or that it isn't in this copy. */
function inputRef(inputId: string, inputs: Inputs): string {
  const view = inputs.views.get(inputId)
  const n = inputs.number.get(inputId)
  return view && n !== undefined
    ? `input ${String(n)} (your message of ${fullTime(view.createdAt)})`
    : 'a message of yours not in this copy'
}

/**
 * A decision on an input, as recorded: its sequence, what was asked, how it came out and why, whether it was late,
 * when it was admitted, its epoch, and the policy it was decided under (A54's decision; nothing about who pays).
 */
const decisionLine = (d: PersonalAnswerDecision) =>
  [
    `  Decision ${String(d.seq)}: ${OPERATION[d.operation]}, ${d.outcome}`,
    d.reason ? `, ${DECISION_REASON[d.reason]}` : '',
    d.late ? ', late' : '',
    d.admittedAt ? `; admitted ${fullTime(d.admittedAt)}` : '',
    `; epoch ${String(d.epoch)}; ${d.policy} v${String(d.policyVersion)} (${d.family}, ${d.basis.replaceAll('_', ' ')})`,
  ].join('')

/** A call made for an input, as recorded: its money and launch, its answer, a possible effect and its reason. */
const callLine = (c: PersonalAnswerControlCall, n: number) =>
  [
    `  Call ${String(n)}: ${COST[c.financial]} · ${LAUNCH[c.launch]} · ${ANSWER[c.answer]}`,
    c.possibleEffect ? ' · may have had an effect' : '',
    c.reason ? ` · ${c.reason.replaceAll('_', ' ')}` : '',
  ].join('')

/** The answers kept aside for an input: which of its calls each came from, its source, when it was kept, its words. */
function keptLines(view: PersonalAnswerControlView): string[] {
  return view.withheld.flatMap((kept) => {
    const call = view.calls.findIndex((c) => c.callId === kept.callId)
    const from = call >= 0 ? `call ${String(call + 1)}` : 'a call not listed'
    const lines = [`  Kept aside from ${from} (${KEPT_FROM[kept.source]}), at ${fullTime(kept.at)}: ${kept.text}`]
    if (kept.suggestion) lines.push(`    Suggested note with it: ${kept.suggestion}`)
    return lines
  })
}

/** What a controlled message's answer is, under it: its input, control, replacements, decisions, calls, kept answers. */
function controlLines(turn: PersonalControlledTurn, view: PersonalAnswerControlView, inputs: Inputs): string[] {
  const n = inputs.number.get(view.inputId)
  const lines = [`  Input ${n === undefined ? '?' : String(n)} (control revision ${String(view.control.revision)})`]
  // The control exactly as recorded (R03): its state, its withdrawal phase and held reason (none when null), apart from
  // the friendly line, which says the same in words.
  const { state, withdrawnPhase, heldReason } = view.control
  lines.push(`  Control: ${state} · phase ${withdrawnPhase ?? 'none'} · held reason ${heldReason ?? 'none'}`)
  const line = controlLine(turn, view)
  if (line) lines.push(`  ${line}`)
  if (view.control.replaces) lines.push(`  Replaces ${inputRef(view.control.replaces, inputs)}`)
  for (const id of view.control.replacedBy) lines.push(`  Replaced by ${inputRef(id, inputs)}`)
  const { prior } = view
  lines.push(
    `  Original request: ${ANSWER[prior.answer]} · ${PRIOR_COST[prior.financial]}${prior.effect === 'possible' ? ' · may have had an effect' : ''}`,
  )
  lines.push(...view.decisions.map(decisionLine))
  lines.push(...view.calls.map((c, i) => callLine(c, i + 1)))
  lines.push(...keptLines(view))
  return lines
}

/** What a turn of a controlled space adds: how its answer stands, and what Sophia leaves out of what comes next. */
function controlledLines(turn: PersonalControlledTurn, inputs: Inputs) {
  const view = turn.input ? inputs.views.get(turn.input.inputId) : undefined
  const lines = view ? controlLines(turn, view, inputs) : []
  if (turn.prompt === 'excluded') lines.push('  Not used for what Sophia says next')
  if (!turn.activity && turn.author === 'person') lines.push('  Not counted as time together')
  return lines
}

/** When the export's pages after the first were made, by the seq each starts at (each page its own reading). */
const pageTimes = (everything: Everything): ReadonlyMap<number, string> =>
  new Map(
    'pages' in everything
      ? everything.pages.slice(1).flatMap((p) => (p.from === null ? [] : [[p.from, p.exportedAt] as const]))
      : [],
  )

/**
 * Everything, readable: when it was made, the notes, what was carried and where, then the conversation by day, each
 * message after its time, with each note Sophia suggested and the person hasn't decided on yet (one kept is in the
 * notes; one let go is deleted). When it was made is the export's own time, the first page's, where the notes come
 * from too; never the device's clock, which may be off (Codex P2 on #405). A controlled space's (A54's export, its
 * `inputs`) says under each message how its answer stands (controlledLines), and where a later page begins, when that
 * page was made: its facts are as of then.
 */
export function exportText(everything: Everything, who: string): string {
  const made = new Date(everything.exportedAt)
  const lines = [`${who} · personal space with Sophia`, `As of ${FULL_DAY.format(made)}, ${clock(made)}`, '', 'Notes:']
  lines.push(...everything.notes.map((n) => `- ${n.text}`))
  if (everything.releases.length > 0) {
    lines.push('', 'Carried to projects:')
    lines.push(...everything.releases.map((r) => `- ${r.text} (${r.projectTitle ?? 'a project you left'})`))
  }
  const inputs = inputsOf('inputs' in everything ? everything.inputs : [])
  const later = pageTimes(everything)
  lines.push('', 'Conversation:')
  let day = ''
  for (const t of everything.turns) {
    const page = later.get(t.seq)
    if (page) lines.push('', `(The rest as of ${fullTime(page)})`)
    const at = new Date(t.createdAt)
    const label = FULL_DAY.format(at)
    if (label !== day || page) lines.push('', label)
    day = label
    lines.push(`${clock(at)} ${t.author === 'person' ? 'You' : 'Sophia'}: ${t.text}`)
    if (t.suggestion?.state === 'open') lines.push(`  Suggested note, not kept: ${t.suggestion.text}`)
    if ('input' in t) lines.push(...controlledLines(t, inputs))
  }
  return lines.join('\n')
}

/** The typed confirmation for the one thing that can't be undone. */
export const confirmsErasure = (typed: string) => typed.trim().toLowerCase() === 'delete'

/** What the "Your data" sheet says. */
export const DATA = {
  copy: 'Copy everything as text',
  copying: 'Copying…',
  locked: 'Your personal space is locked.',
  unlock: 'Unlock to copy or delete',
  erase: 'Delete all personal data',
  eraseSays: 'Conversations and notes are removed for good. What you carried to projects stays there.',
  confirm: 'Type “delete” to confirm',
  erased: 'Your personal space is empty. Sophia starts fresh with you, and your projects are unchanged.',
} as const
