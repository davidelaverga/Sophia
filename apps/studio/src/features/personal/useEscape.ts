// Escape in the three places closes what opened last: the notes, the first visit's sentence, then the place itself goes
// home. Each open layer registers here; one window listener asks the top one. A sheet is modal and owns its keys
// (useDialog), wherever the focus is; a menu or a popover closes itself first (usePopover); and a key someone already
// handled (the composer lets go of its field first) is left alone.
import { useEffect, useRef } from 'react'

interface Layer {
  close: () => void
}

const layers: Layer[] = []

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  if (document.querySelector('[aria-modal="true"]')) return
  if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return
  const top = layers.at(-1)
  if (!top) return
  e.preventDefault()
  top.close()
}

/** While `active`, Escape runs `close` unless a layer opened after this one is still open. */
export function useEscape(active: boolean, close: () => void): void {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!active) return undefined
    const layer: Layer = { close: () => latest.current() }
    layers.push(layer)
    if (layers.length === 1) window.addEventListener('keydown', onKey)
    return () => {
      layers.splice(layers.indexOf(layer), 1)
      if (layers.length === 0) window.removeEventListener('keydown', onKey)
    }
  }, [active])
}
