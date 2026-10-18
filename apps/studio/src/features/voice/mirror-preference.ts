// Whether this device shows its own camera mirrored (docs/plans/room-basics.md): the last choice made here, on by
// default, as a mirror is. Others always see it as the camera does. One store, read by the dock's menu and the stage.
import { useSyncExternalStore } from 'react'

const KEY = 'sophia.mirror.v1'
const heard = new Set<() => void>()

function mirrorOwnCamera(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true // storage unavailable: the default
  }
}

let mirrored = mirrorOwnCamera()

function setMirror(on: boolean): void {
  mirrored = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable: the choice lasts this page only
  }
  for (const listener of heard) listener()
}

const subscribe = (listener: () => void) => {
  heard.add(listener)
  return () => heard.delete(listener)
}

/** Whether your own camera shows mirrored here, and the way to change it. */
export function useMirror(): { on: boolean; toggle: () => void } {
  const on = useSyncExternalStore(subscribe, () => mirrored)
  return { on, toggle: () => setMirror(!on) }
}
