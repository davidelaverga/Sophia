// A plan's progress review, as the goal's quiet line says it (LFE-07.2, SCM-04 G3). It is asked with the goal's own
// Request review (WorkControls: its receipt, and a retry with the same key), bound later to the contract's
// requestProgressReview, which coalesces a request into the review already running (PLAN-01). So the line names the
// one review running: who asked it, or that it was scheduled, and of which revision. A review the allowance can't fund waits, said as such, never dropped.
// Once it ends, the line says when and how, and nothing more: a routine end makes no card and no announcement (PLAN-04).
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

/** Who asked the review running, and of which revision when not this one. */
function runningSaid(active: ActiveReview, plan: WorkPlan, viewerId: string | null, name: Name, now: Date) {
  const who = active.asked_by && (active.asked_by === viewerId ? 'you' : name(active.asked_by))
  const said = who
    ? `The lead is reviewing · asked by ${who} ${observedAgo(active.asked_at, now)}`
    : 'The lead is reviewing · scheduled'
  return active.plan_revision === plan.revision ? said : `${said} · of r${String(active.plan_revision)}`
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
  const ended = lastSaid(plan.last_review, now)
  return ended ? { kind: 'ended', text: ended } : null
}
