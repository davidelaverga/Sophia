// The check's camera and microphone (docs/plans/device-check.md): asked for with the chosen devices, and again when one
// is chosen; the picture for the sheet's video, and the voice's level for its meter. Both are let go when the check
// closes, so the call opens its own. With the camera missing or busy, the microphone is asked for alone, and a line
// says why there is no picture (device-check-no-camera.md).
import { useEffect, useState } from 'react'
import type { DeviceKind } from './device-preference.ts'
import { asksMicAlone, levelOf, micConstraints, previewConstraints, previewMessage } from './device-check.ts'

/** `line`: why there is no picture, in its place; when live, the microphone is checked alone. */
export type Preview =
  { state: 'asking' } | { state: 'unavailable'; line: string } | { state: 'live'; stream: MediaStream; line?: string }

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
    return { state: 'live', stream, line: previewMessage(name, true) }
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

export function useDevicePreview(chosen: Chosen): { preview: Preview; level: number } {
  const [preview, setPreview] = useState<Preview>({ state: 'asking' })
  const [level, setLevel] = useState(0)
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
  }, [audioinput, videoinput])
  return { preview, level }
}
