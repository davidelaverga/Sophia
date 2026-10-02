// LiveKit's place on the fixture page: the fixtures' Vite config resolves the room controller's
// `import('./livekit-room.ts')` (useProjectRoom) to this module, so the real controller runs over a connection
// that reaches no server. It records what it is asked, in order, and can refuse a device or drop the call, as
// LiveKit would report them. Nothing else in the Studio is replaced.
import type { RoomCallbacks, RoomConnection } from '../src/features/voice/livekit-room.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'

/** What the room's connection was asked, in order: `connect`, `microphone:on`, `text:off`, `leave`… */
export const asked: string[] = []

/** `refuse=camera`: the browser refuses the camera, as a blocked permission does. */
const refused = new URLSearchParams(window.location.search).get('refuse')

let ended: RoomCallbacks['onEnded'] | null = null

/** The call is lost, as LiveKit reports a connection gone. */
export function dropCall(): void {
  ended?.('dropped')
}

const blocked = () => new DOMException('Permission denied', 'NotAllowedError')

export function connectRoom(_serverUrl: string, _token: string, cb: RoomCallbacks): Promise<RoomConnection> {
  asked.push('connect')
  const me: RoomParticipant = {
    identity: '00000000-0000-4000-8000-0000000000a1',
    name: 'Fixture viewer',
    speaking: false,
    micOn: false,
    cameraOn: false,
    screenOn: false,
    local: true,
    standing: 'admin',
  }
  let textOnly = false
  let open = true
  ended = (why) => {
    if (!open) return
    open = false
    cb.onEnded(why)
  }
  const device =
    (name: 'microphone' | 'camera' | 'screen', key: 'micOn' | 'cameraOn' | 'screenOn') => (on: boolean) => {
      asked.push(`${name}:${on ? 'on' : 'off'}`)
      if (on && refused === name) return Promise.reject(blocked())
      me[key] = on
      cb.onChange()
      return Promise.resolve()
    }
  return Promise.resolve({
    sendChat: () => {
      asked.push('chat')
      return Promise.resolve()
    },
    setTextMode: (on) => {
      asked.push(`text:${on ? 'on' : 'off'}`)
      textOnly = on
    },
    textMode: () => textOnly,
    participants: () => [{ ...me }],
    sophia: () => null,
    audioBlocked: () => false,
    startAudio: () => Promise.resolve(),
    feeds: () => [],
    setMicrophone: device('microphone', 'micOn'),
    setCamera: device('camera', 'cameraOn'),
    setScreenShare: device('screen', 'screenOn'),
    leave: () => {
      asked.push('leave')
      open = false
      return Promise.resolve()
    },
  })
}
