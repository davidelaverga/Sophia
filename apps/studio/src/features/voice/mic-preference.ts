// Whether this device joins the room with its microphone on: the last choice made here, on by default. A
// person who muted before leaving joins muted next time. One store (docs/plans/settings-follow-ups.md): a join reads
// it as it starts, and Settings' box and Join's tip follow it as it changes, here or in another tab.
import { useSyncExternalStore } from 'react'

const KEY = 'sophia.mic.v1'
const heard = new Set<() => void>()
/** The choice where the browser keeps nothing: it lasts this page. */
let unkept: boolean | null = null

export function micOnJoin(): boolean {
  if (unkept !== null) return unkept
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true // storage unavailable: the default
  }
}

export function rememberMic(on: boolean): void {
  unkept = null
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    unkept = on
  }
  for (const listener of heard) listener()
}

// Another tab's choice comes as a `storage` event; the store reads it again (the snapshot is the same unless it moved).
const subscribe = (listener: () => void) => {
  heard.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    heard.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/** Whether the next join starts with the microphone on, drawn again whenever it changes. */
export function useMicOnJoin(): boolean {
  return useSyncExternalStore(subscribe, micOnJoin)
}
