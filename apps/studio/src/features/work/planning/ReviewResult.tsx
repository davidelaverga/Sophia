// A review that proposes a change, as a card under the board's bar (LFE-07.2, slice 2), in the slot the decisions use:
// one or the other, never both. Four parts, each only when it has something to say: Observed (each line with its
// evidence, how long ago that was observed, and what it was; one about a task opens it), Reading, Unsure and Proposed.
// A proposal waiting on the viewer's own decision opens it, one waiting on someone else's names them, and one the lead
// already sent says so. A review of an earlier revision says so, and
// its proposal is then read, not acted on. Escape or Close puts it away: the viewer's own view, not a receipt.
import { useEffect, useRef } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { observedAgo } from '../../resources/resource.ts'
import type { PlanRow, WorkPlan } from './plan.ts'
import { EVIDENCE, staleSaid, type Intervention, type LastReview, type Observation } from './review.ts'

interface Props {
  review: LastReview
  plan: WorkPlan
  rows: readonly PlanRow[]
  now: Date
  onOpenTask: (id: string) => void
  /** Who a proposal's decision waits on, while it is open: the viewer (who can answer it now) or someone named. */
  waitsOn: (decisionId: string) => { yours: true } | { yours: false; name: string } | null
  /** Opens the decisions on this one, where the viewer answers it. */
  onOpenDecisions: (decisionId: string) => void
  onClose: () => void
}

/** One labelled part; nothing when it has nothing to say. */
function Part({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="review-part">
      <span className="field-label">{label}</span>
      <div className="review-part-body">{children}</div>
    </div>
  )
}

function Seen({ seen, rows, now, onOpenTask }: { seen: Observation } & Pick<Props, 'rows' | 'now' | 'onOpenTask'>) {
  const task = rows.find((r) => r.item.id === seen.item_id)
  return (
    <li className="review-seen">
      <span className="review-evidence">
        {EVIDENCE[seen.evidence.kind]} · {observedAgo(seen.evidence.observed_at, now)}
      </span>
      <span className="review-seen-text">{seen.text}</span>
      <span className="review-evidence-ref">{seen.evidence.ref}</span>
      {task && (
        <button type="button" className="text-button review-task" onClick={() => onOpenTask(task.item.id)}>
          {task.item.purpose}
        </button>
      )}
    </li>
  )
}

/** Its decision, while open: the viewer's to answer now, or someone else's to wait on. */
function Waits({
  decisionId,
  waitsOn,
  onOpenDecisions,
}: { decisionId: string } & Pick<Props, 'waitsOn' | 'onOpenDecisions'>) {
  const on = waitsOn(decisionId)
  if (!on) return null
  return on.yours ? (
    <button type="button" className="text-button" onClick={() => onOpenDecisions(decisionId)}>
      Waits on your decision: answer it
    </button>
  ) : (
    <p className="review-proposal-state">Waits on {on.name}’s decision.</p>
  )
}

/** The proposal: sent by the lead, or waiting on a decision (unless the review is out of date), said either way. */
function Proposed({
  proposal,
  stale,
  ...decision
}: { proposal: Intervention; stale: boolean } & Pick<Props, 'waitsOn' | 'onOpenDecisions'>) {
  return (
    <>
      <p>{proposal.text}</p>
      {proposal.status === 'sent_by_lead' && (
        <p className="review-proposal-state">The lead sent it, within its own authority.</p>
      )}
      {proposal.status === 'proposed' && proposal.decision_id && !stale && (
        <Waits decisionId={proposal.decision_id} {...decision} />
      )}
    </>
  )
}

export function ReviewResult({ review, plan, rows, now, onOpenTask, waitsOn, onOpenDecisions, onClose }: Props) {
  const card = useRef<HTMLElement>(null)
  // Opened, it takes the focus, so Escape puts it away at once.
  useEffect(() => card.current?.focus(), [])
  const stale = staleSaid(review, plan)
  const seen = review.observations ?? []
  return (
    <section
      ref={card}
      className="review-result"
      aria-label="The lead’s review"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <header className="review-result-head">
        <span className="field-label">The lead’s review</span>
        <span className="review-result-when">{observedAgo(review.completed_at, now)}</span>
        {stale && <span className="review-result-stale">{stale}</span>}
        <button type="button" className="round has-tip review-result-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
          <Tip label="Close" keys="Esc" />
        </button>
      </header>
      <Part label="Observed">
        {seen.length > 0 && (
          <ul className="review-seen-list">
            {seen.map((s) => (
              <Seen key={`${s.evidence.ref}:${s.text}`} seen={s} rows={rows} now={now} onOpenTask={onOpenTask} />
            ))}
          </ul>
        )}
      </Part>
      <Part label="Reading">{review.interpretation && <p>{review.interpretation}</p>}</Part>
      <Part label="Unsure">{review.uncertainty && <p>{review.uncertainty}</p>}</Part>
      <Part label="Proposed">
        {review.intervention && (
          <Proposed
            proposal={review.intervention}
            stale={stale !== null}
            waitsOn={waitsOn}
            onOpenDecisions={onOpenDecisions}
          />
        )}
      </Part>
    </section>
  )
}
