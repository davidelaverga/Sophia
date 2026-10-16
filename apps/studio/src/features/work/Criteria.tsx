import type { Goal } from '@sophia/contracts'

/** A goal's criteria. Required unless said otherwise: the exception is marked, never the rule (goal-optional.md). */
export function Criteria({ goal }: { goal: Goal }) {
  return (
    <ul className="criteria">
      {goal.criteria.map((c) => (
        <li key={c.id}>
          <span>{c.description}</span>
          {!c.required && <span className="criterion-optional"> · optional</span>}
        </li>
      ))}
    </ul>
  )
}
