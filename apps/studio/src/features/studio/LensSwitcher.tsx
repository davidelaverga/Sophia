// v2LensBar → LensSwitcher (frontend bindings). A lens is this viewer's local view: switching it sends
// nothing to the server, so it cannot move anyone else's view or retask work. The lenses' tip says so, and
// assistive technology hears it as the group's description. The tip also carries the lens's key: a key drawn
// inside the button, hidden until hover, would reserve room on one side and push the label off its center.
import { useRef } from 'react'
import { Tip, useSlidingThumb } from '@sophia/ui'
import { nextInRow } from '../../app/roving.ts'
import { LENSES, type Lens } from './viewer-state.ts'

export const LENS_LABEL: Record<Lens, string> = { converse: 'Converse', explore: 'Explore', build: 'Build' }

interface Props {
  lens: Lens
  onChange: (lens: Lens) => void
}

export function LensSwitcher({ lens, onChange }: Props) {
  const tabs = useRef(new Map<Lens, HTMLButtonElement>())
  const thumb = useSlidingThumb<HTMLDivElement>(lens)
  const onKeyDown = (event: React.KeyboardEvent) => {
    // Arrow keys move between lenses (WAI-ARIA tabs with automatic activation).
    const next = nextInRow(LENSES, lens, event.key)
    if (!next) return
    event.preventDefault()
    onChange(next)
    tabs.current.get(next)?.focus()
  }
  return (
    <div className="lens-bar">
      <div
        ref={thumb}
        className="segmented"
        role="tablist"
        aria-label="Your view"
        aria-describedby="lens-note"
        onKeyDown={onKeyDown}
      >
        {LENSES.map((l) => (
          <button
            key={l}
            ref={(el) => {
              if (el) tabs.current.set(l, el)
            }}
            type="button"
            role="tab"
            className="has-tip"
            id={`lens-${l}`}
            data-thumb={l}
            aria-selected={l === lens}
            aria-controls="lens-stage"
            tabIndex={l === lens ? 0 : -1}
            onClick={() => onChange(l)}
          >
            {LENS_LABEL[l]}
            <Tip label="Only your view changes" keys={String(LENSES.indexOf(l) + 1)} side="bottom" />
          </button>
        ))}
      </div>
      <span id="lens-note" className="sr-only">
        Only your view changes
      </span>
    </div>
  )
}
