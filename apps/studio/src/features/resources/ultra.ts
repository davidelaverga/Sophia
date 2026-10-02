// A small secret: typing "ultracode" on the Resources view (outside any field, with no sheet open) sends a wave of
// lavender dots across every tile, the ultracode bar's glint for everyone, for a moment. It changes nothing, asks
// nothing, and with reduced motion asked for it is only said, not drawn.
import { useContext, useEffect, useRef, useState } from 'react'
import { modalOnScreen, ShortcutScope } from '../../app/shortcuts.ts'

const WORD = 'ultracode'
const SHOWN_MS = 1800
const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Whether a key is plain typing on the page: one character, no modifier, not in a field, no sheet over the page. */
function typedOnPage(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return false
  const at = e.target
  if (at instanceof HTMLElement && (at.isContentEditable || FIELDS.has(at.tagName))) return false
  return !modalOnScreen()
}

export function useUltra(): boolean {
  const scoped = useContext(ShortcutScope)
  const [on, setOn] = useState(false)
  const typed = useRef('')
  useEffect(() => {
    if (!scoped) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (!typedOnPage(e)) return
      typed.current = (typed.current + e.key.toLowerCase()).slice(-WORD.length)
      if (typed.current !== WORD) return
      typed.current = ''
      setOn(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scoped])
  useEffect(() => {
    if (!on) return undefined
    const timer = setTimeout(() => setOn(false), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [on])
  return on
}
