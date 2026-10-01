// Shortcuts, the way modern tools do them. A single key acts only when nobody is typing, no modifier is held, it
// is not a key repeat, and no dialog is open over the page. What turns on a microphone, a camera or a screen share,
// or joins a call, takes the command key instead (⌘ on a Mac, Ctrl elsewhere), as in Meet: a stray letter must
// never start sending, and a command combination types nothing, so it acts even from a field. Every shortcut is
// also a visible control (its tip shows the key), so the keyboard never hides a feature.
//
// Where the chat's foot is on screen (it marks itself `data-typing-sink`), a key typed with the focus on no
// control is text for it, as in any chat, and never a shortcut: someone who starts a message without clicking the
// bar must not turn on a camera with its first letter. Before the chat starts, the foot is the "Chat with Sophia"
// button: it takes the key as nothing, and still no camera, microphone or shared screen starts.
import { useEffect, useRef } from 'react'

export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** The platform's command key is held, alone: ⌘ on a Mac, Ctrl elsewhere. */
  command: boolean
  repeat: boolean
  defaultPrevented: boolean
  /** Focus is in a field (input, textarea, select, editable text): the key is text. */
  typing: boolean
  /** The key happened inside an open dialog, which owns it. */
  inDialog: boolean
  /** The focus is on no control while a field on screen takes stray typing: the key is text for that field. */
  stray: boolean
}

/** A command combination's name: "mod+d", "mod+shift+e". */
const commandKey = (e: KeyLike) => `mod+${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`

/**
 * The shortcut an event stands for, or null when it must not act: a lowercase letter or digit, or a command
 * combination ("mod+d"). Alt, a repeat, a dialog and a key already handled never act.
 */
export function shortcutKey(e: KeyLike): string | null {
  if (e.defaultPrevented || e.repeat || e.altKey || e.inDialog || e.key.length !== 1) return null
  if (e.command) return commandKey(e)
  if (e.metaKey || e.ctrlKey || e.typing || e.stray) return null
  return e.key.toLowerCase()
}

/** How a shortcut reads in a tip: "Ctrl+Shift+E", or "⇧⌘E" on a Mac; a single key as itself. */
export function keyLabel(combo: string, mac: boolean): string {
  const parts = combo.split('+')
  const key = (parts.at(-1) ?? '').toUpperCase()
  if (parts[0] !== 'mod') return key
  const shift = parts.includes('shift')
  return mac ? `${shift ? '⇧' : ''}⌘${key}` : ['Ctrl', ...(shift ? ['Shift'] : []), key].join('+')
}

/** A Mac (or an iPad with a keyboard) names its command key ⌘. */
export const onMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** A key that types a character: one printable key, with no modifier that makes it a command. */
export function typesText(e: Pick<KeyLike, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  return e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
}

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Where stray typing goes: the chat's foot on screen, and only while the focus is on no control at all. */
function strayField(target: HTMLElement | null): HTMLElement | null {
  if (target && target !== document.body && target !== document.documentElement) return null
  const field = document.querySelector<HTMLElement>('[data-typing-sink]')
  return field?.checkVisibility() ? field : null
}

function keyLike(e: KeyboardEvent): KeyLike {
  const el = e.target instanceof HTMLElement ? e.target : null
  return {
    key: e.key,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    command: onMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey,
    repeat: e.repeat,
    defaultPrevented: e.defaultPrevented,
    typing: !!el && (el.isContentEditable || FIELDS.has(el.tagName)),
    inDialog: !!el?.closest('[role="dialog"]'),
    stray: !!strayField(el),
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
      // Stray typing: the character lands in the field, because the focus moves there before it is typed. A button
      // in the field's place takes no character, and is not focused (a space would press it).
      const sink = typesText(e) ? strayField(e.target instanceof HTMLElement ? e.target : null) : null
      if (sink && FIELDS.has(sink.tagName)) sink.focus()
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
