// The check before joining (docs/plans/device-check.md), as Meet's waiting screen: the camera's picture, a meter that
// moves with the voice, a row per device to choose another, and Join. Opened beside the dock's Join; its camera and
// microphone are let go when it closes or joins, so the call opens its own. With access refused it says how to give
// it, and Join still enters.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@sophia/ui'
import { Sheet } from '../../app/Sheet.tsx'
import { canChooseOutput, chosenDevices, KIND_WORD, type DeviceKind } from './device-preference.ts'
import { DeviceChoice, useDevices, type List } from './DeviceMenu.tsx'
import { useDevicePreview, type Preview } from './useDevicePreview.ts'

const KINDS: readonly DeviceKind[] = ['audioinput', 'audiooutput', 'videoinput']

interface Props {
  list: List
  /** A device chosen: kept for the next call (the room's own switch). */
  onChoose: (kind: DeviceKind, id: string) => void
  onJoin: () => void
  onClose: () => void
}

function Picture({ preview }: { preview: Preview }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = preview.state === 'live' ? preview.stream : null
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])
  return (
    <div className="device-preview">
      {preview.state === 'refused' ? (
        <p>Allow the camera and microphone in your browser’s site settings to check them here.</p>
      ) : (
        <video ref={video} className="device-preview-video" autoPlay muted playsInline aria-label="Your camera" />
      )}
    </div>
  )
}

function Meter({ level }: { level: number }) {
  const percent = Math.round(level * 100)
  return (
    <div
      className="device-meter"
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: `${String(percent)}%` }} />
    </div>
  )
}

export function DeviceCheck({ list, onChoose, onJoin, onClose }: Props) {
  const [chosen, setChosen] = useState(chosenDevices)
  const found = useDevices(true, KINDS, list)
  const { preview, level } = useDevicePreview(chosen)
  const choose = (kind: DeviceKind, id: string) => {
    setChosen((c) => ({ ...c, [kind]: id }))
    onChoose(kind, id)
  }
  return (
    <Sheet id="device-check-title" title="Check your audio and video" onClose={onClose} className="device-check-sheet">
      <div className="device-check">
        <Picture preview={preview} />
        <div className="device-rows">
          {KINDS.filter((k) => k !== 'audiooutput' || canChooseOutput()).map((kind) => (
            <div key={kind} className="device-row">
              <span className="device-row-label">{KIND_WORD[kind]}</span>
              <DeviceChoice kind={kind} found={found} chosen={chosen[kind]} onChoose={(id) => choose(kind, id)} />
              {kind === 'audioinput' && <Meter level={level} />}
            </div>
          ))}
        </div>
        <div className="device-check-foot">
          <Button kind="primary" onClick={onJoin}>
            Join the room
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
