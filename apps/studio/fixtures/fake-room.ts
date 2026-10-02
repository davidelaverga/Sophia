// A room the fixture page holds itself, in place of LiveKit (useProjectRoom): in or out of a call, its devices, text
// mode, the chat and an error. Every device or text-mode request is recorded, so a check can say that typing a letter
// turned nothing on.
import { useState } from 'react'
import type { ChatTurn } from '../src/features/conversation/chat-view.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'
import type { ProjectRoom } from '../src/features/voice/useProjectRoom.ts'

/** What the room was asked to do, in order: `microphone:on`, `camera:off`, `text:on`, `leave`… */
export const asked: string[] = []

export interface Scenario {
  inCall: boolean
  /** Why the room failed, shown by the dock and the panel. */
  error: string | null
  /** Why a device didn't start. */
  mediaError: string | null
}

const me = (devices: Pick<RoomParticipant, 'micOn' | 'cameraOn' | 'screenOn'>): RoomParticipant => ({
  identity: '00000000-0000-4000-8000-0000000000a1',
  name: 'Fixture viewer',
  speaking: false,
  local: true,
  standing: 'admin',
  ...devices,
})

export function useFakeRoom(scenario: Scenario): ProjectRoom {
  const [inCall, setInCall] = useState(scenario.inCall)
  const [devices, setDevices] = useState({ micOn: scenario.inCall, cameraOn: false, screenOn: false })
  const [textMode, setText] = useState(false)
  const [chat, setChat] = useState<ChatTurn[]>([])
  const device = (name: 'microphone' | 'camera' | 'screen', key: keyof typeof devices) => (on: boolean) => {
    asked.push(`${name}:${on ? 'on' : 'off'}`)
    setDevices((d) => ({ ...d, [key]: on }))
    return Promise.resolve()
  }
  return {
    chat,
    textMode,
    textModeNow: () => textMode,
    setTextMode: (on) => {
      asked.push(`text:${on ? 'on' : 'off'}`)
      setText(on)
      return Promise.resolve()
    },
    sendChat: (packet) => {
      asked.push('chat')
      const turn: ChatTurn = {
        id: packet.id,
        exchangeId: packet.exchangeId,
        text: packet.text,
        reply: '',
        sequence: 0,
        state: 'sending',
        reason: null,
      }
      setChat((turns) => [...turns, turn])
      return Promise.resolve()
    },
    status: inCall ? 'live' : 'idle',
    error: scenario.error,
    call: 1,
    mediaError: scenario.mediaError,
    participants: inCall ? [me(devices)] : [],
    feeds: [],
    sophia: null,
    audioBlocked: false,
    startAudio: () => Promise.resolve(),
    ready: true,
    join: () => {
      asked.push('join')
      setInCall(true)
      return Promise.resolve(true)
    },
    leave: () => {
      asked.push('leave')
      setInCall(false)
      return Promise.resolve()
    },
    setMicrophone: device('microphone', 'micOn'),
    setCamera: device('camera', 'cameraOn'),
    setScreenShare: device('screen', 'screenOn'),
  }
}
