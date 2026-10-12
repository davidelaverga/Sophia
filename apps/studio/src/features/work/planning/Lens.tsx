// Lenses over the board: All, For you, Waiting, Unassigned. A lens dims what it doesn't show and moves nothing, so the
// board keeps its shape and the eye keeps its map. Each says how many it shows. The arrows move between them.
import { Segmented } from '@sophia/ui'
import { LABEL, LENSES, shows, type LensName } from './lenses.ts'
import type { PlanRow } from './plan.ts'

interface Props {
  lens: LensName
  rows: readonly PlanRow[]
  viewerId: string | null
  onChange: (lens: LensName) => void
}

export function Lens({ lens, rows, viewerId, onChange }: Props) {
  return (
    <Segmented
      role="radiogroup"
      label="Show"
      className="board-lens"
      items={LENSES.map((l) => ({ id: l, label: LABEL[l], count: rows.filter((r) => shows(l, r, viewerId)).length }))}
      value={lens}
      onChange={onChange}
    />
  )
}
