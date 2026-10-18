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

interface Devices {
  listDevices: (kind: 'videoinput') => Promise<MediaDevice[]>
  switchDevice: (kind: 'videoinput', id: string) => Promise<void>
}

/**
 * The press that switches to the next camera, or null: your camera off, or fewer than two cameras listed. The cameras
 * are listed again each time yours comes on (a phone may give their names only once it has asked).
 */
export function useCameraFlip(devices: Devices, cameraOn: boolean): (() => void) | null {
  const { listDevices, switchDevice } = devices
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
    const next = nextCamera(cameras, chosenDevices().videoinput)
    if (next) void switchDevice('videoinput', next)
  }
}
