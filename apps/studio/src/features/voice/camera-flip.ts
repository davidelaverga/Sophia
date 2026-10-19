// Switch camera on a phone, in a call (docs/plans/camera-flip.md): the camera after the one in use, round, and the
// press that moves to it while your camera is on and there are two.
import { useEffect, useState } from 'react'
import { chosenDevices, deviceInUse, type MediaDevice } from './device-preference.ts'

/** The camera after the one in use, round (a phone's front, then its back); null with fewer than two. */
export function nextCamera(cameras: readonly MediaDevice[], chosen: string | undefined): string | null {
  if (cameras.length < 2) return null
  const now = deviceInUse(cameras, chosen)
  const at = cameras.findIndex((c) => c.id === now)
  return cameras[(at + 1) % cameras.length]?.id ?? null
}

/**
 * Whether the browser has the top layer your tile's menu stands in on a phone's strip (the Popover API; TileMenu.tsx).
 * Safari before 17 has none, and the build targets Safari 16.4: showing the menu there threw and took the call down, so
 * the press stays Switch camera, as before the menu (a review's P1, phone-tiles-follow-ups.md).
 */
export const hasTopLayer = (
  proto: object | undefined = typeof HTMLElement === 'undefined' ? undefined : HTMLElement.prototype,
): boolean => proto !== undefined && 'showPopover' in proto

/** A press of one call's switch, given the cameras listed and the switch, which says whether the call took it. */
export type CameraPress = (cameras: readonly MediaDevice[], switchTo: (id: string) => Promise<boolean>) => Promise<void>

/**
 * One call's presses, from the camera it began on (`kept`, as chosen for calls). The kept choice isn't read again: it
 * can part from the call's, where storage can't be written or a refused switch was kept all the same (Codex P2 on #422).
 */
export function cameraPresses(kept: string | undefined): CameraPress {
  let inUse = kept
  return async (cameras, switchTo) => {
    const from = inUse
    const next = nextCamera(cameras, from)
    if (next === null) return
    // Moved on at the press, so a second press before the first is answered goes on from it; back if refused.
    inUse = next
    if (!(await switchTo(next)) && inUse === next) inUse = from
  }
}

/**
 * The presses of the call under way here, by when it went live: one call at a time in a tab (a second join drops the
 * first), and kept past the video view, which goes while nobody's camera is on.
 */
let presses: { call: number | null; press: CameraPress } | null = null

interface Devices {
  listDevices: (kind: 'videoinput') => Promise<MediaDevice[]>
  /** Resolves true once the call switched to it. */
  switchDevice: (kind: 'videoinput', id: string) => Promise<boolean>
  /** When the call went live: each call's presses start again from the camera kept for calls. */
  liveSince: number | null
}

/**
 * The press that switches to the next camera, or null: your camera off, or fewer than two cameras listed. The cameras
 * are listed again each time yours comes on (a phone may give their names only once it has asked).
 */
export function useCameraFlip(devices: Devices, cameraOn: boolean): (() => void) | null {
  const { listDevices, switchDevice, liveSince } = devices
  const [cameras, setCameras] = useState<readonly MediaDevice[]>([])
  useEffect(() => {
    if (!cameraOn) return undefined
    let live = true
    listDevices('videoinput').then(
      (list) => {
        if (live) setCameras(list)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [listDevices, cameraOn])
  if (!cameraOn || cameras.length < 2) return null
  return () => {
    // The kept choice, read at the call's first press: no switch of its own has been kept yet.
    const call =
      presses?.call === liveSince ? presses : { call: liveSince, press: cameraPresses(chosenDevices().videoinput) }
    presses = call
    void call.press(cameras, (id) => switchDevice('videoinput', id))
  }
}
