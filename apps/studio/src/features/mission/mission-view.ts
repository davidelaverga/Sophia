// What the compact mission view shows, derived from the MissionContext (the same view Sophia reads by voice). Pure, so
// the rules are unit-tested and React only renders them. The words say what each record is: a proposal is not a
// decision, a note Sophia wrote is her paraphrase, not someone's exact words, and no accepted mission is not an empty
// project.
import type { MissionContext, MissionDecision, MissionEntry, MissionNotePolicy } from '@sophia/contracts'
import type { Tone } from '@sophia/ui'
import { authorLabel } from '../conversation/conversation-view.ts'

/** The mission read's query key: every write and project event refreshes it. */
export const missionKey = (projectId: string) => ['mission', projectId] as const

export const ENTRY_KIND: Record<MissionEntry['kind'], string> = {
  observation: 'Observation',
  expectation: 'Expectation',
  outcome: 'Outcome',
  blocker: 'Blocker',
  explanation: 'Possible explanation',
  lesson_candidate: 'Lesson to check',
  continuity: 'For next time',
}

export const isEntryKind = (value: string): value is MissionEntry['kind'] => Object.hasOwn(ENTRY_KIND, value)

export const EPISTEMIC: Record<MissionEntry['epistemic'], string> = {
  reported: 'as reported',
  observed: 'observed',
  inferred: 'a hypothesis',
}

export const PROPOSAL_KIND: Record<MissionDecision['kind'], string> = {
  mission: 'Proposed direction',
  constraint: 'Proposed constraint',
  lesson: 'Proposed lesson',
}

/** What an accepted proposal became. */
export const AGREED_KIND: Record<MissionDecision['kind'], string> = {
  mission: 'Direction',
  constraint: 'Constraint',
  lesson: 'Lesson',
}

export const OUTCOME: Record<MissionDecision['state'], string> = {
  proposed: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Replaced',
}

/** Who decided a proposal, and where: by voice with Sophia or in the Studio; null when it was replaced, not decided. */
export function decidedBy(d: MissionDecision, me: string, names: ReadonlyMap<string, string>): string | null {
  if (!d.decidedBy) return null
  return `${authorLabel(d.decidedBy, me, names)}, ${d.decidedVia === 'voice' ? 'by voice' : 'in the Studio'}`
}

export interface Line {
  text: string
  tone: Tone
}

/** Whether Sophia keeps notes from this person's turns, and if not, why. */
export function notesLine(policy: MissionNotePolicy): Line {
  if (policy.capture === 'off') return { text: 'Sophia isn’t keeping notes in this project.', tone: 'muted' }
  if (policy.consent === 'accepted') {
    return { text: 'Sophia keeps shared project notes during this exchange.', tone: 'teal' }
  }
  if (policy.consent === 'declined') {
    return { text: 'Sophia keeps no notes from your turns: you declined.', tone: 'muted' }
  }
  return { text: 'Sophia keeps shared notes for members who agree. You haven’t chosen yet.', tone: 'amber' }
}

/** The direction the team accepted, or plainly none yet: a project with no records says how to begin. */
export function direction(ctx: MissionContext): { statement: string; purpose: string | null; accepted: boolean } {
  if (ctx.mission) return { statement: ctx.mission.statement, purpose: ctx.mission.purpose, accepted: true }
  const statement =
    ctx.readState === 'empty'
      ? 'Nothing recorded yet. Talk the idea through with Sophia.'
      : 'No direction accepted yet.'
  return { statement, purpose: null, accepted: false }
}

/** The proposal to look at now: the newest pending one, and how many other proposals are pending beside it. */
export function pendingFocus(ctx: MissionContext): { proposal: MissionDecision; alternatives: number } | null {
  const proposal = ctx.pending.at(-1)
  return proposal ? { proposal, alternatives: ctx.pending.length - 1 } : null
}

/** The newest current notes, oldest first. */
export const recentNotes = (ctx: MissionContext, n = 3): MissionEntry[] => ctx.entries.slice(-n)

/** How a note is worded: Sophia's paraphrase of a turn, or a member's own typed words. */
export const wording = (entry: Pick<MissionEntry, 'textKind'>): string =>
  entry.textKind === 'sophia_paraphrase' ? 'Sophia’s paraphrase' : 'typed'

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/** What the context leaves out, said plainly: the view shows the newest notes and history, not every one. */
export function omittedLine(ctx: MissionContext): string | null {
  const { olderEntries, olderHistory } = ctx.excluded
  const parts = [
    olderEntries > 0 ? count(olderEntries, 'older note', 'older notes') : null,
    olderHistory > 0
      ? count(olderHistory, 'older correction or forgotten note', 'older corrections and forgotten notes')
      : null,
  ].filter((part) => part !== null)
  return parts.length > 0 ? `Not shown here: ${parts.join(' and ')}.` : null
}

/** Past notes as the history shows them: corrected ones keep their text; forgotten ones say only that. */
export function historyText(entry: MissionEntry): string {
  if (entry.state === 'withdrawn') return 'A note was forgotten; its text no longer exists.'
  return entry.text ?? ''
}

/** Who may do what with one note, for this person. */
export function noteActions(ctx: MissionContext, entry: MissionEntry, me: string) {
  const current = entry.state === 'current'
  const mine = entry.actorId === me
  return {
    correct: current && ctx.capabilities.correct.available,
    withdraw: entry.state !== 'withdrawn' && (mine || ctx.capabilities.setNotePolicy.available),
  }
}
