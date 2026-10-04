// The plan's progress review, simulated for the fixture page (LFE-07.2). The goal's Request review reaches the lead
// (fixture-api's command route): with no review running it starts one, asked by the viewer, which runs for 2 s and
// ends as `review=` says (`no-change`, the default; `insufficient`; `failed`). With one running, the request joins it
// and nothing new starts (PLAN-01). `review=running` opens with Davide's from 3 min ago, `scheduled` with a scheduled
// one, `old` with one of the plan's previous revision, `awaiting` with one the allowance can't fund. `material` opens
// with a finished review that proposes a change (its card), `material-old` with the same review of the previous
// revision, `material-sent` with one whose proposal the lead already sent. The review is the goal's own read beside
// the board's view (review.ts, WBC-01), never a field of the plan.
import type { GoalCommand } from '@sophia/contracts'
import type { ActiveReview, LastReview, ReviewOutcome, Reviewed } from '../src/features/work/planning/review.ts'
import { NOW } from './resources-data.ts'

const MODES = [
  'no-change',
  'insufficient',
  'failed',
  'running',
  'scheduled',
  'old',
  'awaiting',
  'material',
  'material-old',
  'material-sent',
] as const
export type ReviewMode = (typeof MODES)[number]

export const reviewMode = (given: string | null): ReviewMode => MODES.find((m) => m === given) ?? 'no-change'

/** The fixture's clock: NOW, running on from when the page opened. */
const opened = Date.now()
const clock = () => new Date(NOW.getTime() + Date.now() - opened).toISOString()

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

/** A finished review that proposes a change: what the lead saw, made of it, can't tell yet, and proposes. */
const proposing = (revision: number): LastReview => ({
  review_id: 'review-material',
  plan_revision: revision,
  completed_at: minutesAgo(4),
  outcome: 'recommendation',
  checkpoint: null,
  observations: [
    {
      text: 'The retry passes its unit tests, but the export check still fails on large reports.',
      item_id: 'work-1',
      evidence: { kind: 'check', observed_at: minutesAgo(6), ref: 'pnpm --filter @sophia/report test' },
    },
    {
      text: 'Reports over 20 MB time out in the renderer after 30 s.',
      item_id: null,
      evidence: { kind: 'log', observed_at: minutesAgo(9), ref: 'renderer log, 12:41' },
    },
  ],
  interpretation: 'The retry fixes the transient failures; the large reports fail for another reason, their size.',
  uncertainty: 'Whether the renderer’s host can be given more time without slowing the others.',
  intervention: {
    text: 'Measure render time on large reports before the retry ships, and keep the retry’s review waiting for it.',
    decision_id: 'd1',
    status: 'proposed',
  },
})

/** A later review taking the last one's place, as the lead's next one would: a new id, the same proposal. */
export const reviewedAgain = (p: Reviewed): Reviewed =>
  p.last_review ? { ...p, last_review: { ...p.last_review, review_id: `${p.last_review.review_id}-again` } } : p

/** The review a plan opens with, as `review=` says; none for the modes that wait for a request. */
export function openedWith(mode: ReviewMode, p: Reviewed): Reviewed {
  if (mode === 'material') return { ...p, last_review: proposing(p.revision) }
  if (mode === 'material-old') return { ...p, last_review: proposing(p.revision - 1) }
  if (mode === 'material-sent') {
    const review = proposing(p.revision)
    const sent = {
      text: 'Raise the renderer’s timeout for large reports to 90 s.',
      decision_id: null,
      status: 'sent_by_lead' as const,
    }
    return { ...p, last_review: { ...review, review_id: 'review-sent', intervention: sent } }
  }
  const base: ActiveReview = {
    review_id: 'review-0',
    plan_revision: p.revision,
    state: 'running',
    asked_by: 'davide',
    asked_at: new Date(NOW.getTime() - 3 * 60_000).toISOString(),
    allowance_owner: null,
  }
  const opening: Partial<Record<ReviewMode, ActiveReview>> = {
    running: base,
    scheduled: { ...base, asked_by: null },
    old: { ...base, plan_revision: p.revision - 1 },
    awaiting: { ...base, state: 'awaiting_allowance', asked_by: null, allowance_owner: 'davide' },
  }
  return { ...p, active_review: opening[mode] ?? null }
}

const ENDS: Partial<Record<ReviewMode, ReviewOutcome>> = { insufficient: 'insufficient_evidence', failed: 'failed' }

type Update = (change: (p: Reviewed) => Reviewed) => void

/**
 * The lead's side of Request review: starts a review, or joins the one running (nothing new starts). Each command is
 * kept, for checks. A review ends after 2 s, unless another has taken its place.
 */
export function reviewer(mode: ReviewMode, viewerId: string, update: Update, revisionNow: () => number) {
  const commands: { kind: GoalCommand['kind']; key: string }[] = []
  const command = (cmd: GoalCommand, key: string) => {
    commands.push({ kind: cmd.kind, key })
    if (cmd.kind !== 'request_review') return
    const review_id = `review-${String(commands.length)}`
    const asked_at = clock()
    update((p) =>
      p.active_review
        ? p
        : {
            ...p,
            active_review: {
              review_id,
              plan_revision: revisionNow(),
              state: 'running',
              asked_by: viewerId,
              asked_at,
              allowance_owner: null,
            },
          },
    )
    setTimeout(() => {
      const checkpoint = mode === 'insufficient' ? { label: 'the retry passes the export tests' } : null
      const completed_at = clock()
      const outcome = ENDS[mode] ?? 'no_change'
      update((p) =>
        p.active_review?.review_id === review_id
          ? {
              ...p,
              active_review: null,
              last_review: {
                review_id,
                plan_revision: p.active_review.plan_revision,
                completed_at,
                outcome,
                checkpoint,
              },
            }
          : p,
      )
    }, 2000)
  }
  return { commands, command }
}
