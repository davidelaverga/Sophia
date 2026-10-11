// An empty state (docs/plans/states.md): what a view says when it has nothing, in the `.empty` theme.css look: the
// sentence where the first row would be, 18 px under the rule, and its way forward (a press or two: `actions`) under
// it. A `slot` is a box with nothing in it (a board's lane): the sentence centred in a dashed edge.
import type { ReactNode } from 'react'
import { emptyClass } from './state-class.ts'

export interface EmptyStateProps {
  /** The sentence: what there is none of, and where it will come from. */
  children: ReactNode
  /** The way forward, under the sentence. */
  actions?: ReactNode
  slot?: boolean
  className?: string
}

export function EmptyState({ children, actions, slot = false, className }: EmptyStateProps) {
  return (
    <div className={emptyClass(slot, className)}>
      <p>{children}</p>
      {actions !== undefined && <div className="control-row">{actions}</div>}
    </div>
  )
}
