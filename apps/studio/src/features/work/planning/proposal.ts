// A replacement plan beside the one in force (WBC-01 G1): what it adds, removes and changes, item by item, by the
// items' ids. The accepted plan stays the board; the proposal is read and compared, never operated, until it is
// accepted and becomes the plan in force. Pure: tested.
import type { PlanItem, WorkPlan } from './board-view.ts'

export interface PlanChange {
  added: PlanItem[]
  removed: PlanItem[]
  changed: { item: PlanItem; what: string[] }[]
}

const ASPECTS: readonly [string, (i: PlanItem) => string][] = [
  ['what it does', (i) => i.purpose],
  ['who does it', (i) => `${i.assignee_kind}:${i.assignee_id ?? ''}`],
  [
    'what it waits on',
    (i) => `${i.blocked_by.toSorted().join()}|${i.activation.kind}:${i.activation.producer_work_id ?? ''}`,
  ],
  ['where it sits', (i) => i.parent_id ?? ''],
  ['its deliverable', (i) => i.deliverable_ref],
  ['its criteria', (i) => i.criteria_ref],
  ['its sources', (i) => i.source_scope_ref],
  ['its recipe', (i) => i.recipe_ref],
  ['its review', (i) => i.review_policy_ref],
]

/** How `proposed` differs from `current`, by item id. */
export function compare(current: WorkPlan, proposed: WorkPlan): PlanChange {
  const before = new Map(current.items.map((i) => [i.id, i]))
  const after = new Set(proposed.items.map((i) => i.id))
  const changed = proposed.items.flatMap((item) => {
    const was = before.get(item.id)
    const what = was ? ASPECTS.filter(([, of]) => of(was) !== of(item)).map(([name]) => name) : []
    return what.length > 0 ? [{ item, what }] : []
  })
  return {
    added: proposed.items.filter((i) => !before.has(i.id)),
    removed: current.items.filter((i) => !after.has(i.id)),
    changed,
  }
}

/** The change in a few words: "2 added · 1 changed · 1 removed", or that no task changes. */
export function changeSaid(c: PlanChange): string {
  const parts = [
    c.added.length > 0 && `${String(c.added.length)} added`,
    c.changed.length > 0 && `${String(c.changed.length)} changed`,
    c.removed.length > 0 && `${String(c.removed.length)} removed`,
  ].filter((p) => typeof p === 'string')
  return parts.length > 0 ? parts.join(' · ') : 'No task changes'
}
