// What a plan assumes and what was decided for it: one quiet line under it, opened on request (LFE-07.1). Shared by
// the plan's list and its board.
import { useState } from 'react'
import { Icon } from '@sophia/ui'
import type { Resource } from '../../resources/resource.ts'
import { decidedFor, type BoardDecision, type WorkPlan } from './plan.ts'

type Person = Resource['owner']

const STATUS = { unresolved: null, supported: 'supported', contradicted: 'contradicted' } as const

interface Props {
  plan: WorkPlan
  decisions: readonly BoardDecision[]
  people: Record<string, Person>
}

/** Choices made, each with who made it; for another plan, which revision it was for. */
function Choices({ label, decisions, people, elsewhere }: ChoicesProps) {
  if (decisions.length === 0) return null
  return (
    <ul className="plan-decided" aria-label={label}>
      {decisions.map((d) => (
        // Each decision at its revision: two revisions of one are two rows (Codex F-041).
        <li key={JSON.stringify([d.decision_id, d.revision])}>
          {d.question}{' '}
          <span className="muted">
            {people[d.decider_id]?.name ?? 'Someone'} chose{' '}
            {d.choices.find((c) => c.key === d.selected_choice)?.label ?? 'one'}
            {elsewhere && ` · for plan r${String(d.plan_revision)}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface ChoicesProps {
  label: string
  decisions: readonly BoardDecision[]
  people: Record<string, Person>
  elsewhere?: boolean
}

/**
 * What the plan assumes, kept apart from what was decided for it: one quiet line, opened on request. Choices made for
 * another plan are the goal's history, listed apart and named by their plan's revision, never as this plan's.
 */
export function Folded({ plan, decisions, people }: Props) {
  const [open, setOpen] = useState(false)
  const accepted = decisions.filter((d) => d.state === 'accepted')
  const decided = accepted.filter((d) => decidedFor(d, plan))
  const elsewhere = accepted.filter((d) => !decidedFor(d, plan))
  if (plan.assumptions.length === 0 && accepted.length === 0) return null
  const said = [
    plan.assumptions.length > 0 && `${plan.assumptions.length} assumed`,
    decided.length > 0 && `${decided.length} decided`,
    elsewhere.length > 0 && `${elsewhere.length} for another plan`,
  ].filter(Boolean)
  return (
    <div className="plan-fold">
      {/* Keyed on what it says: a new decision lands with the line arriving again. */}
      <button
        key={said.join()}
        type="button"
        className="ghost plan-fold-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {said.join(' · ')}
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="plan-fold-body">
          {plan.assumptions.length > 0 && (
            <ul className="plan-assumed" aria-label="Assumed">
              {plan.assumptions.map((a) => (
                <li key={a.id} data-status={a.status}>
                  {a.text}
                  {STATUS[a.status] && <span className="muted"> · {STATUS[a.status]}</span>}
                </li>
              ))}
            </ul>
          )}
          <Choices label="Decided" decisions={decided} people={people} />
          <Choices label="Decided for another plan" decisions={elsewhere} people={people} elsewhere />
        </div>
      )}
    </div>
  )
}
