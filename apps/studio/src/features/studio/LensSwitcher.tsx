// v2LensBar → LensSwitcher (frontend bindings). A lens is this viewer's local view: switching it sends
// nothing to the server, so it cannot move anyone else's view or retask work. The lenses' tip says so, and
// assistive technology hears it as the group's description. The tip also carries the lens's key: a key drawn
// inside the button, hidden until hover, would reserve room on one side and push the label off its center.
import { Segmented } from '@sophia/ui'
import { LENSES, type Lens } from './viewer-state.ts'

export const LENS_LABEL: Record<Lens, string> = { converse: 'Converse', explore: 'Explore', build: 'Build' }

interface Props {
  lens: Lens
  onChange: (lens: Lens) => void
}

export function LensSwitcher({ lens, onChange }: Props) {
  return (
    <div className="lens-bar">
      <Segmented
        role="tablist"
        label="Your view"
        describedBy="lens-note"
        items={LENSES.map((l) => ({
          id: l,
          label: LENS_LABEL[l],
          controls: 'lens-stage',
          tip: { label: 'Only your view changes', keys: String(LENSES.indexOf(l) + 1), side: 'bottom' },
        }))}
        value={lens}
        onChange={onChange}
        idFor={(l) => `lens-${l}`}
      />
      <span id="lens-note" className="sr-only">
        Only your view changes
      </span>
    </div>
  )
}
