// The call's commands wherever its switches show beyond the dock (docs/plans/call-keys-anywhere.md): the mini dock on
// every project view but the Studio's, and the places' bar. They do what the switches there do, no more: the
// microphone both ways, the camera and the screen only off (nothing starts sending out of the room), and Leave.
import type { Command } from '../../app/commands.ts'
import type { CallControls, Sending } from './CallSwitches.tsx'
import { ROOM_KEYS } from './room-keys.ts'

/** A command's action only while its switch shows there; none otherwise, so it is not offered. */
const when = (ok: boolean, run: () => void) => (ok ? run : undefined)

export function callCommands(sending: Sending, controls: CallControls): Command[] {
  const { leave } = controls
  return [
    {
      id: 'microphone',
      words: `Microphone ${sending.microphone ? 'off' : 'on'}`,
      group: 'room',
      key: ROOM_KEYS.microphone,
      run: () => controls.setMicrophone(!sending.microphone),
    },
    {
      id: 'camera',
      words: 'Camera off',
      group: 'room',
      key: ROOM_KEYS.camera,
      run: when(sending.camera, () => controls.setCamera(false)),
    },
    {
      id: 'screen',
      words: 'Stop sharing the screen',
      group: 'room',
      key: ROOM_KEYS.screen,
      run: when(sending.screen, () => controls.setScreenShare(false)),
    },
    {
      id: 'leave',
      words: 'Leave the room',
      group: 'room',
      run: leave,
    },
  ]
}
