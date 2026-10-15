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

/** The chosen microphone and camera, wanted and not required (one unplugged since gives way), else the defaults. */
export function previewConstraints(chosen: Partial<Record<DeviceKind, string>>): MediaStreamConstraints {
  return {
    audio: chosen.audioinput ? { deviceId: { ideal: chosen.audioinput } } : true,
    video: { width: { ideal: 640 }, ...(chosen.videoinput && { deviceId: { ideal: chosen.videoinput } }) },
  }
}
