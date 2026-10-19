// The check before joining (docs/plans/device-check.md): what the browser is asked for, and how loud the voice is.
// Pure of the browser, so the rules are unit-tested.
import type { DeviceKind } from './device-preference.ts'

/** The meter's steps: it redraws only when the voice moves it by one. */
const STEPS = 20

/**
 * How loud the microphone is, 0 to 1 in steps: the samples' spread around silence (128, as an analyser gives them),
 * scaled so a speaking voice fills most of the meter.
 */
export function levelOf(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) sum += ((s - 128) / 128) ** 2
  const loud = Math.min(1, Math.sqrt(sum / samples.length) * 4)
  return Math.round(loud * STEPS) / STEPS
}

const micAsked = (chosen: Partial<Record<DeviceKind, string>>) =>
  chosen.audioinput ? { deviceId: { ideal: chosen.audioinput } } : true

/** The chosen microphone and camera, wanted and not required (one unplugged since gives way), else the defaults. */
export function previewConstraints(chosen: Partial<Record<DeviceKind, string>>): MediaStreamConstraints {
  return {
    audio: micAsked(chosen),
    video: { width: { ideal: 640 }, ...(chosen.videoinput && { deviceId: { ideal: chosen.videoinput } }) },
  }
}

/** The microphone alone, as previewConstraints asks for it: after the camera was missing or busy. */
export function micConstraints(chosen: Partial<Record<DeviceKind, string>>): MediaStreamConstraints {
  return { audio: micAsked(chosen) }
}

/** The browser's reasons for no camera: none plugged in (or none that fits), or another app holding it. */
const NO_CAMERA = new Set(['NotFoundError', 'OverconstrainedError'])
const CAMERA_BUSY = new Set(['NotReadableError', 'AbortError'])

/**
 * Whether the browser's reason for turning down the camera and microphone together (a request is all or nothing) lets
 * the check ask again for the microphone alone: a camera missing or busy, never a refusal, which would prompt twice.
 */
export const asksMicAlone = (name: string): boolean => NO_CAMERA.has(name) || CAMERA_BUSY.has(name)

/**
 * What may bring the camera back while the microphone is checked alone, by the browser's reason for no camera: the
 * person returning to the page after closing the app that held it, or a camera plugged in. The check then asks again,
 * so its line lasts only while it is true. A refusal or an unknown reason waits for the sheet to open again: asking on
 * its own would prompt.
 */
export function cameraBackOn(name: string): 'return' | 'plug' | null {
  if (CAMERA_BUSY.has(name)) return 'return'
  if (NO_CAMERA.has(name)) return 'plug'
  return null
}

/**
 * The sheet's one line in the picture's place, by the browser's reason (the error's name, as room-view.ts's
 * mediaMessage reads it in a call) and whether the microphone is checked alone (seam #5). Site settings are named for a
 * refusal only: a camera missing or busy has nothing to allow. With the microphone failing too, the camera isn't blamed.
 */
export function previewMessage(name: string, micChecked: boolean): string {
  if (name === 'NotAllowedError')
    return 'Allow the camera and microphone in your browser’s site settings to check them here.'
  if (micChecked && NO_CAMERA.has(name)) return 'No camera found, so this checks your microphone only.'
  if (micChecked && CAMERA_BUSY.has(name))
    return 'Another app is using your camera. Close it to see yourself here; you can still join.'
  return 'The camera and microphone couldn’t start here. You can still join.'
}
