import { useEffect, useState } from 'react'
import type { ChatInput, ChatReply } from '@sophia/contracts/room-chat'
import { receiveChat, type ChatTurn } from '../conversation/chat-view.ts'
import type { RoomConnection } from './livekit-room.ts'

type Connection = { current: RoomConnection | null }
const unknown = (t: ChatTurn): ChatTurn =>
  t.state === 'sending' || t.state === 'responding'
    ? { ...t, state: 'unknown', reason: 'Reply unconfirmed. Nothing is resent automatically.' }
    : t

/** Ephemeral typed messages are bounded and never written to storage or logs. */
export function useTypedChat(connection: Connection, microphone: (on: boolean) => Promise<void>) {
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [textMode, rememberTextMode] = useState(false)
  const setTextMode = async (on: boolean) => {
    rememberTextMode(on)
    connection.current?.setTextMode(on)
    if (on) await microphone(false)
  }
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
