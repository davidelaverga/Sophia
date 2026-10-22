// The check before joining (docs/plans/device-check.md), as Meet's waiting screen: the camera's picture, a meter that
// moves with the voice, a row per device to choose another, and Join. Opened beside the dock's Join; its camera and
// microphone are let go when it closes or joins, so the call opens its own. With access refused it says how to give
// it, and Join still enters; with the camera missing or busy it says so and checks the microphone alone
// (device-check-no-camera.md). On the picture, the microphone and the camera are chosen for the join
// (prejoin-toggles.md): the preview follows them by disabling a track, never asking again, and Join enters with them.
import { useEffect, useRef, useState } from 'react'
import { Button, Icon, Tip, type IconName } from '@sophia/ui'
import { Sheet } from '../../app/Sheet.tsx'
import { canChooseOutput, chosenDevices, KIND_WORD, type DeviceKind } from './device-preference.ts'
import { micOnJoin, rememberMic } from './mic-preference.ts'
import { DeviceChoice, useDevices, type List } from './DeviceMenu.tsx'
import { StalePart } from './StalePart.tsx'
import { useDevicePreview, type Preview } from './useDevicePreview.ts'

const KINDS: readonly DeviceKind[] = ['audioinput', 'audiooutput', 'videoinput']

interface Props {
  list: List
  /** A device chosen: kept for the next call (the room's own switch). */
  onChoose: (kind: DeviceKind, id: string) => void
  /** Join with the microphone and the camera chosen here; the microphone's choice is also kept (rememberMic). */
  onJoin: (options: { mic: boolean; camera: boolean }) => void
  onClose: () => void
}

interface Chosen {
  mic: boolean
  camera: boolean
}

/** An off switch disables its tracks: the meter rests, the picture goes, and nothing is asked of the browser again. */
function useTracksFollow(preview: Preview, { mic, camera }: Chosen) {
  useEffect(() => {
    if (preview.state !== 'live') return
    for (const track of preview.stream.getAudioTracks()) track.enabled = mic
    for (const track of preview.stream.getVideoTracks()) track.enabled = camera
  }, [preview, mic, camera])
}

/** A switch on the picture: its name says what it controls, aria-pressed whether it is on, as the dock's do. */
function Switch(props: { on: boolean; label: string; icons: readonly [IconName, IconName]; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="round has-tip"
      aria-pressed={props.on}
      aria-label={props.label}
      onClick={props.onToggle}
    >
      <Icon name={props.on ? props.icons[0] : props.icons[1]} />
      <Tip label={props.label} side="top" />
    </button>
  )
}

/** The microphone's switch, and the camera's where there is a picture for it to turn on. */
function Switches({ chosen, onChosen, camera }: { chosen: Chosen; onChosen: (next: Chosen) => void; camera: boolean }) {
  return (
    <div className="device-preview-switches">
      <Switch
        on={chosen.mic}
        label="Microphone"
        icons={['mic', 'micOff']}
        onToggle={() => {
          rememberMic(!chosen.mic)
          onChosen({ ...chosen, mic: !chosen.mic })
        }}
      />
      {camera && (
        <Switch
          on={chosen.camera}
          label="Camera"
          icons={['camera', 'cameraOff']}
          onToggle={() => onChosen({ ...chosen, camera: !chosen.camera })}
        />
      )}
    </div>
  )
}

function Picture({
  preview,
  chosen,
  onChosen,
}: {
  preview: Preview
  chosen: Chosen
  onChosen: (next: Chosen) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = preview.state === 'live' ? preview.stream : null
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])
  // Why there is no picture, in its place: one line, so «Your camera is off» doesn't show under it.
  const line = preview.state === 'asking' ? undefined : preview.line
  return (
    <div className="device-preview" data-camera={chosen.camera ? 'on' : 'off'}>
      {line ? (
        <p role="status">{line}</p>
      ) : (
        <video ref={video} className="device-preview-video" autoPlay muted playsInline aria-label="Your camera" />
      )}
      {!line && !chosen.camera && <p className="device-preview-off">Your camera is off</p>}
      {preview.state !== 'unavailable' && <Switches chosen={chosen} onChosen={onChosen} camera={!line} />}
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
  // As the join would start: the microphone as last chosen on this device, the camera off.
  const [media, setMedia] = useState<Chosen>(() => ({ mic: micOnJoin(), camera: false }))
  useTracksFollow(preview, media)
  const choose = (kind: DeviceKind, id: string) => {
    setChosen((c) => ({ ...c, [kind]: id }))
    onChoose(kind, id)
  }
  return (
    <Sheet id="device-check-title" title="Check your audio and video" onClose={onClose} className="device-check-sheet">
      <div className="device-check">
        <Picture preview={preview} chosen={media} onChosen={setMedia} />
        <div className="device-rows">
          {KINDS.filter((k) => k !== 'audiooutput' || canChooseOutput()).map((kind) => (
            <div key={kind} className="device-row">
              <span className="device-row-label">{KIND_WORD[kind]}</span>
              <DeviceChoice kind={kind} found={found} chosen={chosen[kind]} onChoose={(id) => choose(kind, id)} />
              {kind === 'audioinput' && <Meter level={level} />}
            </div>
          ))}
        </div>
        {/* Their part gone after a deploy (stale-part-call.md): said once here, with Reload. */}
        {found.state === 'stale' && (
          <p className="device-check-stale" role="status">
            <StalePart />
          </p>
        )}
        <div className="device-check-foot">
          <Button kind="primary" onClick={() => onJoin(media)}>
            Join the room
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
