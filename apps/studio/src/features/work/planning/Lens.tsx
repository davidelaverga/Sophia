// Lenses over the board: All, For you, Waiting, Open. A lens dims what it doesn't show and moves nothing, so the
// board keeps its shape and the eye keeps its map. Each says how many it shows. The arrows move between them.
import { useRef } from 'react'
import { useSlidingThumb } from '@sophia/ui'
import { nextInRow } from '../../../app/roving.ts'
import { LABEL, LENSES, shows, type LensName } from './lenses.ts'
import type { PlanRow } from './plan.ts'

interface Props {
  lens: LensName
  rows: readonly PlanRow[]
  viewerId: string | null
  onChange: (lens: LensName) => void
}

export function Lens({ lens, rows, viewerId, onChange }: Props) {
  const thumb = useSlidingThumb<HTMLDivElement>(lens)
  const buttons = useRef(new Map<LensName, HTMLButtonElement>())
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = nextInRow(LENSES, lens, event.key)
    if (!next) return
    event.preventDefault()
    onChange(next)
    buttons.current.get(next)?.focus()
  }
  return (
    <div ref={thumb} className="segmented board-lens" role="radiogroup" aria-label="Show" onKeyDown={onKeyDown}>
      {LENSES.map((l) => (
        <button
          key={l}
          ref={(el) => {
            if (el) buttons.current.set(l, el)
          }}
          type="button"
          role="radio"
          data-thumb={l}
          aria-checked={l === lens}
          tabIndex={l === lens ? 0 : -1}
          onClick={() => onChange(l)}
        >
          {LABEL[l]}
          <span className="filter-count">{rows.filter((r) => shows(l, r, viewerId)).length}</span>
        </button>
      ))}
    </div>
  )
}
