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

/** One call's presses, told of each switch of its camera that took, whichever control made it (Codex P2 on #464). */
export type CameraPresses = CameraPress & { took: (id: string) => void }

/**
 * One call's presses, from the camera it began on (`kept`, as chosen for calls). The kept choice isn't read again: it
 * can part from the call's, where storage can't be written or a refused switch was kept all the same (Codex P2 on #422).
 * The call's camera is then the last switch that took, a press's or one made elsewhere (`took`): Video settings, which
 * a phone turned sideways shows.
 */
export function cameraPresses(kept: string | undefined): CameraPresses {
  let on = kept
  /** The latest press still waiting for its answer: the next press goes on from the camera it asked for. */
  let waiting: { id: string } | null = null
  const press: CameraPress = async (cameras, switchTo) => {
    const next = nextCamera(cameras, waiting?.id ?? on)
    if (next === null) return
    const asked = { id: next }
    waiting = asked
    // Refused, the call stays on its camera, and the next press asks for the same one again.
    if (await switchTo(next)) on = next
    if (waiting === asked) waiting = null
  }
  return Object.assign(press, {
    took: (id: string) => {
      on = id
    },
  })
}

/**
 * The presses of the call under way here, by when it went live: one call at a time in a tab (a second join drops the
 * first), and kept past the video view, which goes while nobody's camera is on.
 */
let presses: { call: number | null; presses: CameraPresses } | null = null

/**
 * The presses of the call that went live at `call`, from the camera kept for calls at its first press or its first
 * switch that took, whichever comes first.
 */
function callPresses(call: number | null): CameraPresses {
  if (presses?.call !== call) presses = { call, presses: cameraPresses(chosenDevices().videoinput) }
  return presses.presses
}

/**
 * A switch of the camera that took in the call that went live at `call`, made anywhere (your tile, Video settings, «In
 * the call»): the next press goes on from it. The room tells every one (useProjectRoom.ts).
 */
export const cameraTaken = (call: number | null, id: string): void => {
  callPresses(call).took(id)
}

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
  return () => void callPresses(liveSince)(cameras, (id) => switchDevice('videoinput', id))
}
