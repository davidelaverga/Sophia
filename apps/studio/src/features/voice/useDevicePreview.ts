// The check's camera and microphone (docs/plans/device-check.md): asked for with the chosen devices, and again when one
// is chosen; the picture for the sheet's video, and the voice's level for its meter. Both are let go when the check
// closes, so the call opens its own.
import { useEffect, useState } from 'react'
import type { DeviceKind } from './device-preference.ts'
import { levelOf, previewConstraints } from './device-check.ts'

export type Preview = { state: 'asking' } | { state: 'refused' } | { state: 'live'; stream: MediaStream }

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

export function useDevicePreview(chosen: Partial<Record<DeviceKind, string>>): { preview: Preview; level: number } {
  const [preview, setPreview] = useState<Preview>({ state: 'asking' })
  const [level, setLevel] = useState(0)
  const { audioinput, videoinput } = chosen
  useEffect(() => {
    let live = true
    let stream: MediaStream | null = null
    let stopMeter = () => undefined as void
    const asked = previewConstraints({ ...(audioinput && { audioinput }), ...(videoinput && { videoinput }) })
    navigator.mediaDevices.getUserMedia(asked).then(
      (s) => {
        if (!live) return letGo(s)
        stream = s
        setPreview({ state: 'live', stream: s })
        stopMeter = meter(s, setLevel)
      },
      () => {
        if (live) setPreview({ state: 'refused' })
      },
    )
    return () => {
      live = false
      stopMeter()
      if (stream) letGo(stream)
      setLevel(0)
    }
  }, [audioinput, videoinput])
  return { preview, level }
}
