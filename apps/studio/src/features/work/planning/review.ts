// A plan's progress review, as the goal's quiet line says it (LFE-07.2, SCM-04 G3). It is asked with the goal's own
// Request review (WorkControls: its receipt, and a retry with the same key), bound later to the contract's
// requestProgressReview, which coalesces a request into the review already running (PLAN-01). So the line names the
// one review running: who asked it, or that it was scheduled, and of which revision. A review the allowance can't fund
// waits, said as such, never dropped. Once it ends, the line says when and how, and of which revision when the plan
// has moved on since; nothing more: a routine end makes no card and no announcement (PLAN-04).
import { observedAgo } from '../../resources/resource.ts'
import type { WorkPlan } from './plan.ts'

/** How a review ended: nothing to change, not enough to tell, a change proposed, or it didn't finish. */
export type ReviewOutcome = 'no_change' | 'insufficient_evidence' | 'recommendation' | 'failed'

/** Proposed for SCM-04: a plan's last finished review. */
export interface LastReview {
  review_id: string
  plan_revision: number
  completed_at: string
  outcome: ReviewOutcome
  /** Not enough to tell: the checkpoint the lead waits for, when it names one. */
  checkpoint: { label: string } | null
  /** A change proposed (slice 2): what the lead saw, made of it, can't tell yet, and proposes. */
  observations?: Observation[]
  interpretation?: string | null
  uncertainty?: string | null
  intervention?: Intervention | null
}

/** What a review rests on: a check run, a change made, a report, a log, or a candidate; and when it was observed. */
export interface Evidence {
  kind: 'check' | 'change' | 'report' | 'log' | 'candidate'
  observed_at: string
  ref: string
}

/** One thing the lead saw, tied to its evidence and, when it is about one, to a task. */
export interface Observation {
  text: string
  item_id: string | null
  evidence: Evidence
}

/** What the lead proposes: a change it sent within its own authority, or one waiting on a decision. */
export interface Intervention {
  text: string
  decision_id: string | null
  status: 'proposed' | 'sent_by_lead'
}

/** Proposed for SCM-04: the review asked and not ended yet, running or waiting for the allowance to fund it. */
export interface ActiveReview {
  review_id: string
  plan_revision: number
  state: 'running' | 'awaiting_allowance'
  /** Who asked for it first; null when it was scheduled. */
  asked_by: string | null
  asked_at: string
  /** Awaiting: who can extend the project's allowance. */
  allowance_owner: string | null
}

type Name = (personId: string) => string

/** The goal's line about its review: running (with a pinging dot), awaiting its allowance, or how the last ended. */
export interface ReviewLine {
  kind: 'running' | 'awaiting' | 'ended'
  text: string
}

/** Of which revision, when not the plan's own: what was reviewed may not be what the plan now says. */
const ofRevision = (revision: number, plan: WorkPlan) =>
  revision === plan.revision ? '' : ` · of r${String(revision)}`

/** Who asked the review running, and of which revision when not this one. */
function runningSaid(active: ActiveReview, plan: WorkPlan, viewerId: string | null, name: Name, now: Date) {
  const who = active.asked_by && (active.asked_by === viewerId ? 'you' : name(active.asked_by))
  const said = who
    ? `The lead is reviewing · asked by ${who} ${observedAgo(active.asked_at, now)}`
    : 'The lead is reviewing · scheduled'
  return `${said}${ofRevision(active.plan_revision, plan)}`
}

const ENDED: Record<Exclude<ReviewOutcome, 'failed'>, (checkpoint: string | null) => string> = {
  no_change: () => 'no change',
  insufficient_evidence: (checkpoint) =>
    checkpoint ? `not enough to tell until ${checkpoint}` : 'not enough to tell yet',
  recommendation: () => 'a change proposed',
}

/** The plan's last review, said quietly: when, and how it ended; nothing before the first. */
export function lastSaid(last: LastReview | null | undefined, now: Date): string | null {
  if (!last) return null
  if (last.outcome === 'failed') return 'The last review didn’t finish'
  return `Reviewed ${observedAgo(last.completed_at, now)} · ${ENDED[last.outcome](last.checkpoint?.label ?? null)}`
}

export function reviewLine(plan: WorkPlan, viewerId: string | null, name: Name, now: Date): ReviewLine | null {
  const active = plan.active_review
  if (active?.state === 'running') return { kind: 'running', text: runningSaid(active, plan, viewerId, name, now) }
  if (active?.state === 'awaiting_allowance') {
    const owner = active.allowance_owner
    const who = owner && (owner === viewerId ? 'You' : name(owner))
    const text = `Awaiting review: the project’s allowance is spent.${who ? ` ${who} can extend it.` : ''}`
    return { kind: 'awaiting', text }
  }
  const last = plan.last_review
  const ended = lastSaid(last, now)
  return last && ended ? { kind: 'ended', text: `${ended}${ofRevision(last.plan_revision, plan)}` } : null
}

/** A review worth its card: one that proposes a change. Any other end is said on the goal's line only (PLAN-04). */
export const material = (last: LastReview | null | undefined): last is LastReview => last?.outcome === 'recommendation'

/** A review of an earlier revision than the plan's, said so: what it proposes may already be out of date. */
export const staleSaid = (last: LastReview, plan: WorkPlan) =>
  last.plan_revision === plan.revision
    ? null
    : `Reviewed r${String(last.plan_revision)} · the plan is now r${String(plan.revision)}`

export const EVIDENCE: Record<Evidence['kind'], string> = {
  check: 'Check',
  change: 'Change',
  report: 'Report',
  log: 'Log',
  candidate: 'Candidate',
}
