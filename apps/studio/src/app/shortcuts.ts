// Single-key shortcuts, the way modern tools do them: a key acts only when nobody is typing, no modifier
// is held, it is not a key repeat, and no dialog is open over the page. Every shortcut is also a visible
// control (its tip shows the key), so the keyboard never hides a feature.
import { useEffect, useRef } from 'react'

export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  repeat: boolean
  defaultPrevented: boolean
  /** Focus is in a field (input, textarea, select, editable text): the key is text. */
  typing: boolean
  /** The key happened inside an open dialog, which owns it. */
  inDialog: boolean
}

/** The shortcut key an event stands for (lowercase letters and digits), or null when it must not act. */
export function shortcutKey(e: KeyLike): string | null {
  if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.typing || e.inDialog) return null
  return e.key.length === 1 ? e.key.toLowerCase() : null
}

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function keyLike(e: KeyboardEvent): KeyLike {
  const el = e.target instanceof HTMLElement ? e.target : null
  return {
    key: e.key,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    repeat: e.repeat,
    defaultPrevented: e.defaultPrevented,
    typing: !!el && (el.isContentEditable || FIELDS.has(el.tagName)),
    inDialog: !!el?.closest('[role="dialog"]'),
  }
}

/** Bind keys to actions while `enabled`; the latest actions are always used without re-subscribing. */
export function useShortcuts(bindings: Readonly<Record<string, (() => void) | undefined>>, enabled = true): void {
  const current = useRef(bindings)
  useEffect(() => {
    current.current = bindings
  })
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e: KeyboardEvent) => {
      const key = shortcutKey(keyLike(e))
      const run = key ? current.current[key] : undefined
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
