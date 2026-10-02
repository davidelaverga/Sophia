// The call's switches wherever the call shows beyond the dock: the microphone, text mode while it holds, the camera and
// the shared screen while they are on (from here they only turn off: nothing starts sending out of the room), and Leave
// where it is offered. Each is the dock's own Toggle, so the chat panel's head, the mini dock and the places' bar say
// the same and do the same. What is on is never out of sight: whatever this person sends shows here with its off
// switch, and a switch that goes away when pressed hands the focus to the microphone beside it, not to the page.
import { Icon, Tip } from '@sophia/ui'
import { TextMode, Toggle } from './RoomDock.tsx'
import { roomKey } from './room-keys.ts'
import type { RoomParticipant } from './room-view.ts'

export interface Sending {
  microphone: boolean
  camera: boolean
  screen: boolean
}

/** What this person sends, read from their own presence in the call. */
export const sendingOf = (me: RoomParticipant | undefined): Sending => ({
  microphone: !!me?.micOn,
  camera: !!me?.cameraOn,
  screen: !!me?.screenOn,
})

export interface CallControls {
  setMicrophone: (on: boolean) => void
  setCamera: (on: boolean) => void
  setScreenShare: (on: boolean) => void
  /** Offered where the dock isn't: the mini dock and the places' bar. */
  leave?: () => void
}

interface Props {
  sending: Sending
  controls: CallControls
  /** Text mode: said while it holds, and one press goes back to voice. */
  textMode: { on: boolean; onVoice: () => void }
  /** The room's keys work here (the room is on screen), so the tips show them. */
  keys: boolean
  /** Where the tips open: above at the foot of the screen, below in a bar. */
  side?: 'top' | 'bottom'
}

/** After a switch that goes away when pressed: the focus goes to the microphone beside it. */
function toMicrophone() {
  const pressed = document.activeElement
  const group = pressed instanceof HTMLElement ? pressed.parentElement : null
  requestAnimationFrame(() => group?.querySelector<HTMLElement>('[data-call-anchor]')?.focus({ preventScroll: true }))
}

export function CallSwitches({ sending, controls, textMode, keys, side = 'top' }: Props) {
  const key = (action: 'microphone' | 'camera' | 'screen') => (keys ? roomKey(action) : undefined)
  return (
    <>
      <Toggle
        on={sending.microphone}
        label="Microphone"
        keys={key('microphone')}
        icons={['mic', 'micOff']}
        side={side}
        anchor
        onToggle={() => controls.setMicrophone(!sending.microphone)}
      />
      <TextMode on={textMode.on} onVoice={textMode.onVoice} />
      {sending.camera && (
        <Toggle
          on
          label="Camera"
          keys={key('camera')}
          icons={['camera', 'cameraOff']}
          side={side}
          onToggle={() => {
            toMicrophone()
            controls.setCamera(false)
          }}
        />
      )}
      {sending.screen && (
        <Toggle
          on
          label="Stop sharing"
          keys={key('screen')}
          icons={['screen', 'screen']}
          side={side}
          onToggle={() => {
            toMicrophone()
            controls.setScreenShare(false)
          }}
        />
      )}
      {controls.leave && (
        <button type="button" className="round leave has-tip" aria-label="Leave the room" onClick={controls.leave}>
          <Icon name="leave" />
          <Tip label="Leave the room" side={side} align="end" />
        </button>
      )}
    </>
  )
}
