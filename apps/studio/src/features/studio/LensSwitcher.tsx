// v2LensBar → LensSwitcher (frontend bindings). A lens is this viewer's local view: switching it sends
// nothing to the server, so it cannot move anyone else's view or retask work.
import { useRef } from 'react'
import { LENSES, type Lens } from './viewer-state.ts'

export const LENS_LABEL: Record<Lens, string> = { converse: 'Converse', explore: 'Explore', build: 'Build' }

/** Arrow keys move between lenses (WAI-ARIA tabs with automatic activation). */
function nextLens(current: Lens, key: string): Lens | null {
  const i = LENSES.indexOf(current)
  const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
  if (key === 'Home') return LENSES[0]
  if (key === 'End') return LENSES[LENSES.length - 1] ?? null
  const delta = step[key]
  return delta === undefined ? null : (LENSES[(i + delta + LENSES.length) % LENSES.length] ?? null)
}

interface Props {
  lens: Lens
  viewerName: string
  onChange: (lens: Lens) => void
}

export function LensSwitcher({ lens, viewerName, onChange }: Props) {
  const tabs = useRef(new Map<Lens, HTMLButtonElement>())
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = nextLens(lens, event.key)
    if (!next) return
    event.preventDefault()
    onChange(next)
    tabs.current.get(next)?.focus()
  }
  return (
    <div className="lens-bar">
      <div className="lenses" role="tablist" aria-label="Studio lenses" onKeyDown={onKeyDown}>
        {LENSES.map((l) => (
          <button
            key={l}
            ref={(el) => {
              if (el) tabs.current.set(l, el)
            }}
            type="button"
            role="tab"
            id={`lens-${l}`}
            aria-selected={l === lens}
            aria-controls="lens-stage"
            tabIndex={l === lens ? 0 : -1}
            onClick={() => onChange(l)}
          >
            {LENS_LABEL[l]}
          </button>
        ))}
      </div>
      <span className="muted lens-note">{viewerName}’s view · only you see this lens</span>
    </div>
  )
}
