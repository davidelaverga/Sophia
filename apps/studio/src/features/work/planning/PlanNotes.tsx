// What a plan assumes and what was decided: one quiet line under it, opened on request (LFE-07.1). Shared by the plan's
// list and its board.
import { useState } from 'react'
import { Icon } from '@sophia/ui'
import type { Resource } from '../../resources/resource.ts'
import type { WorkPlan } from './plan.ts'

type Person = Resource['owner']

/** What the plan assumes and what was decided: one quiet line, opened on request. */
export function Folded({ plan, people }: { plan: WorkPlan; people: Record<string, Person> }) {
  const [open, setOpen] = useState(false)
  const decided = plan.decisions.filter((d) => d.state === 'accepted')
  if (plan.assumptions.length === 0 && decided.length === 0) return null
  const said = [
    plan.assumptions.length > 0 && `${plan.assumptions.length} assumed`,
    decided.length > 0 && `${decided.length} decided`,
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
                <li key={a.id}>{a.text}</li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <ul className="plan-decided" aria-label="Decided">
              {decided.map((d) => (
                <li key={d.decision_id}>
                  {d.question}{' '}
                  <span className="muted">
                    {people[d.decider_id]?.name ?? 'Someone'} chose{' '}
                    {d.choices.find((c) => c.key === d.selected_choice)?.label ?? 'one'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
