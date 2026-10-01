import { useEffect, useState } from 'react'
import type { ChatInput, ChatReply } from '@sophia/contracts/room-chat'
import { receiveChat, type ChatTurn } from '../conversation/chat-view.ts'
import type { RoomConnection } from './livekit-room.ts'

type Connection = { current: RoomConnection | null }
const unknown = (t: ChatTurn): ChatTurn =>
  t.state === 'sending' || t.state === 'responding'
    ? { ...t, state: 'unknown', reason: 'Reply unconfirmed. Nothing is resent automatically.' }
    : t

export const MIC_STILL_ON = 'Your microphone couldn’t be turned off, so typing to Sophia didn’t start. Try again.'

interface TextModePorts {
  remember: (on: boolean) => void
  connection: { current: { setTextMode: (on: boolean) => void } | null }
  /** Resolves true once the microphone is off (or there is no call), false when it couldn't be turned off. */
  silence: () => Promise<boolean>
}

/**
 * Text mode promises the microphone is off. When it can't be turned off, text mode goes back off and the caller is
 * told, so a chat is neither started nor sent while the microphone still publishes.
 */
export async function switchTextMode(on: boolean, { remember, connection, silence }: TextModePorts): Promise<void> {
  remember(on)
  connection.current?.setTextMode(on)
  if (!on || (await silence())) return
  remember(false)
  connection.current?.setTextMode(false)
  throw new Error(MIC_STILL_ON)
}

interface MicrophonePorts {
  textMode: boolean
  /** Turns the microphone on or off; true when it took (or there is no call), false when it failed and says so. */
  setDevice: (on: boolean) => Promise<boolean>
  leaveTextMode: () => Promise<void>
}

/**
 * Speaking is voice: a microphone that came on leaves text mode, so Sophia is heard again. Only once it came on: a
 * press the browser or LiveKit refused keeps text mode, and Sophia muted, with the microphone still off.
 */
export async function switchMicrophone(on: boolean, { textMode, setDevice, leaveTextMode }: MicrophonePorts) {
  const took = await setDevice(on)
  if (on && took && textMode) await leaveTextMode()
}

/**
 * Ephemeral typed messages are bounded and never written to storage or logs. Text mode turns the microphone off
 * through `silence`, which the room provides: it is done for the person, so it is not remembered as their choice.
 */
export function useTypedChat(connection: Connection, silence: () => Promise<boolean>) {
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [textMode, rememberTextMode] = useState(false)
  const setTextMode = (on: boolean) => switchTextMode(on, { remember: rememberTextMode, connection, silence })
  const sendChat = async (packet: ChatInput) => {
    const c = connection.current
    if (!c) throw new Error('Join the conversation first.')
    setChat((turns) => [
      ...turns.slice(-99),
      {
        id: packet.id,
        exchangeId: packet.exchangeId,
        text: packet.text,
        reply: '',
        sequence: -1,
        state: 'sending',
        reason: null,
      },
    ])
    try {
      await c.sendChat(packet)
    } catch {
      setChat((turns) => turns.map((t) => (t.id === packet.id ? unknown(t) : t)))
      throw new Error('Delivery unconfirmed. Nothing is resent automatically.')
    }
  }
  useEffect(() => {
    if (!chat.some((t) => t.state === 'sending' || t.state === 'responding')) return undefined
    const timer = setTimeout(() => setChat((turns) => turns.map(unknown)), 60000)
    return () => clearTimeout(timer)
  }, [chat])
  const onChat = (packet: ChatReply) => setChat((turns) => receiveChat(turns, packet))
  const interrupted = () => setChat((turns) => turns.map(unknown))
  return { chat, textMode, rememberTextMode, setTextMode, sendChat, onChat, interrupted }
}
