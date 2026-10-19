// The check's camera and microphone (docs/plans/device-check.md): asked for with the chosen devices, and again when one
// is chosen; the picture for the sheet's video, and the voice's level for its meter. Both are let go when the check
// closes, so the call opens its own. With the camera missing or busy, the microphone is asked for alone, and a line
// says why there is no picture until the camera may be back, when both are asked for again (device-check-no-camera.md).
import { useCallback, useEffect, useState } from 'react'
import type { DeviceKind } from './device-preference.ts'
import {
  asksMicAlone,
  cameraBackOn,
  levelOf,
  micConstraints,
  previewConstraints,
  previewMessage,
} from './device-check.ts'

/**
 * `line`: why there is no picture, in its place; when live, the microphone is checked alone, and `reason` is the
 * browser's for no camera.
 */
export type Preview =
  | { state: 'asking' }
  | { state: 'unavailable'; line: string }
  | { state: 'live'; stream: MediaStream; line?: string; reason?: string }

type Chosen = Partial<Record<DeviceKind, string>>

const nameOf = (err: unknown) => (err instanceof Error ? err.name : '')

const letGo = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop()
}

/** The voice's level from a stream's microphone, in the meter's steps; stops with the returned function. */
function meter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  if (stream.getAudioTracks().length === 0) return () => undefined
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Uint8Array(analyser.fftSize)
  let frame = 0
  const read = () => {
    analyser.getByteTimeDomainData(samples)
    onLevel(levelOf(samples))
    frame = requestAnimationFrame(read)
  }
  read()
  return () => {
    cancelAnimationFrame(frame)
    void context.close()
  }
}

/** The microphone alone, after the browser's reason `name` for no camera: the line says why there is no picture. */
async function micAlone(chosen: Chosen, name: string): Promise<Preview> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints(chosen))
    return { state: 'live', stream, line: previewMessage(name, true), reason: name }
  } catch (err) {
    return { state: 'unavailable', line: previewMessage(nameOf(err), false) }
  }
}

/**
 * The camera and microphone together; with the camera missing or busy, the microphone alone, unless the check has
 * closed meanwhile (`wanted`), so no prompt shows after the sheet has gone.
 */
async function ask(chosen: Chosen, wanted: () => boolean): Promise<Preview> {
  try {
    return { state: 'live', stream: await navigator.mediaDevices.getUserMedia(previewConstraints(chosen)) }
  } catch (err) {
    const name = nameOf(err)
    if (asksMicAlone(name) && wanted()) return micAlone(chosen, name)
    return { state: 'unavailable', line: previewMessage(name, false) }
  }
}

/** `then` once, on the first of these events heard while `counts`; returns the stop. */
function once(heard: readonly (readonly [EventTarget, string])[], then: () => void, counts = () => true): () => void {
  let done = false
  const hear = () => {
    if (done || !counts()) return
    done = true
    then()
  }
  for (const [target, type] of heard) target.addEventListener(type, hear)
  return () => {
    for (const [target, type] of heard) target.removeEventListener(type, hear)
  }
}

/**
 * While the microphone is checked alone, both asked for `again` when the camera may be back (cameraBackOn): the page
 * shown again after the app holding it closed, or a device plugged in. Once per answer, so one return the browser tells
 * twice (focus, then the tab shown) asks once; the next answer listens again while the line is still true.
 */
function useCameraBack(preview: Preview, again: () => void) {
  useEffect(() => {
    const back = preview.state === 'live' && preview.reason ? cameraBackOn(preview.reason) : null
    if (back === 'plug') return once([[navigator.mediaDevices, 'devicechange']], again)
    if (back !== 'return') return undefined
    const shown = () => document.visibilityState === 'visible'
    return once(
      [
        [window, 'focus'],
        [document, 'visibilitychange'],
      ],
      again,
      shown,
    )
  }, [preview, again])
}

export function useDevicePreview(chosen: Chosen): { preview: Preview; level: number } {
  const [preview, setPreview] = useState<Preview>({ state: 'asking' })
  const [level, setLevel] = useState(0)
  // Each time the camera may be back, the request is made again with the same devices.
  const [round, setRound] = useState(0)
  const again = useCallback(() => setRound((r) => r + 1), [])
  useCameraBack(preview, again)
  const { audioinput, videoinput } = chosen
  useEffect(() => {
    let live = true
    let stream: MediaStream | null = null
    let stopMeter = () => undefined as void
    void ask({ ...(audioinput && { audioinput }), ...(videoinput && { videoinput }) }, () => live).then((p) => {
      if (!live) {
        if (p.state === 'live') letGo(p.stream)
        return
      }
      setPreview(p)
      if (p.state !== 'live') return
      stream = p.stream
      stopMeter = meter(p.stream, setLevel)
    })
    return () => {
      live = false
      stopMeter()
      if (stream) letGo(stream)
      setLevel(0)
    }
  }, [audioinput, videoinput, round])
  return { preview, level }
}
