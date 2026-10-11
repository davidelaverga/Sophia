import { useEffect, useRef, useState } from 'react'
import type { ChatInput, ChatNotice, ChatReply } from '@sophia/contracts/room-chat'
import {
  DELIVERY_NOT_CONFIRMED,
  receiveChat,
  receiveNotice,
  type Arrivals,
  type ChatNoticeItem,
  type ChatTurn,
} from '../conversation/chat-view.ts'
import type { RoomConnection } from './livekit-room.ts'

type Connection = { current: RoomConnection | null }
const unknown = (t: ChatTurn): ChatTurn =>
  t.state === 'sending' || t.state === 'responding'
    ? { ...t, state: 'unknown', reason: 'Not confirmed: her reply may not come. Nothing is sent again on its own.' }
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
  /** Text mode as it is this moment: it may begin while the browser still asks for the microphone. */
  textMode: () => boolean
  /** Turns the microphone on or off; true when it took in this call, false when it failed (and says so) or the call went. */
  setDevice: (on: boolean) => Promise<boolean>
  leaveTextMode: () => Promise<void>
}

/**
 * Speaking is voice: a microphone that came on leaves text mode, so Sophia is heard again, also text mode that began
 * while the browser was still asking for it (read once it came on). Only once it came on: a press the browser or
 * LiveKit refused keeps text mode, and Sophia muted, with the microphone still off.
 */
export async function switchMicrophone(on: boolean, { textMode, setDevice, leaveTextMode }: MicrophonePorts) {
  const took = await setDevice(on)
  if (on && took && textMode()) await leaveTextMode()
}

interface ArrivalPorts {
  /** Turns the microphone on: true when it took (or its call is gone). */
  enable: () => Promise<boolean>
  /** Whether text mode holds in the microphone's call now. */
  textMode: () => boolean
  /** Turns it off again: true when it took (or its call is gone), false when it failed and says so. */
  disable: () => Promise<boolean>
}

/**
 * The microphone a join turns on. Text mode may begin while it comes on, behind the browser's prompt: LiveKit's own
 * turn-off waits 10 s at most for it, so a microphone that took longer is still published when it arrives. Text mode
 * wins, so it goes off again. False when it couldn't: text mode can't hold with it on, and the room goes back to voice.
 */
export async function arriveWithMicrophone({ enable, textMode, disable }: ArrivalPorts): Promise<boolean> {
  if (!(await enable()) || !textMode()) return true
  return disable()
}

interface EnterPorts {
  /** Text mode as it is this moment. */
  textModeNow: () => boolean
  /** The connection's own text mode: Sophia muted or heard. */
  applyTextMode: (on: boolean) => void
  /** The call is on screen. */
  shown: () => void
  /** Whether this device joins with its microphone on. */
  micOnArrival: () => boolean
  /** The microphone on arrival (arriveWithMicrophone): false when text mode began meanwhile and it stayed on. */
  arrive: () => Promise<boolean>
  leaveTextMode: () => Promise<void>
}

/**
 * A join that got in. Text mode as it is now, not as the join began: its pill can go back to voice while the join is
 * under way. By voice, the microphone comes on as this device left it; text mode that began meanwhile and couldn't
 * keep it off goes back to voice, Sophia heard, and the room's note says the microphone stayed on.
 */
export async function enterCall(p: EnterPorts): Promise<void> {
  const typed = p.textModeNow()
  p.applyTextMode(typed)
  p.shown()
  if (!typed && p.micOnArrival() && !(await p.arrive())) await p.leaveTextMode()
}

/**
 * Ephemeral typed messages are bounded and never written to storage or logs. Text mode turns the microphone off
 * through `silence`, which the room provides: it is done for the person, so it is not remembered as their choice.
 * `arrival` places each turn and card in the one chat it shares with the captions (chat-view.ts).
 */
export function useTypedChat(connection: Connection, silence: () => Promise<boolean>, arrival: Arrivals) {
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [notices, setNotices] = useState<ChatNoticeItem[]>([])
  const [textMode, setShown] = useState(false)
  // Text mode as it is this moment, for code that awaited: a join reads it as it gets in (the pill may have gone back
  // to voice meanwhile), and a chat start once its join has settled.
  const now = useRef(false)
  const rememberTextMode = (on: boolean) => {
    now.current = on
    setShown(on)
  }
  const setTextMode = (on: boolean) => switchTextMode(on, { remember: rememberTextMode, connection, silence })
  const sendChat = async (packet: ChatInput) => {
    const c = connection.current
    if (!c) throw new Error('Join the conversation first.')
    const at = arrival.next()
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
        at,
      },
    ])
    try {
      await c.sendChat(packet)
    } catch {
      setChat((turns) => turns.map((t) => (t.id === packet.id ? unknown(t) : t)))
      throw new Error(DELIVERY_NOT_CONFIRMED)
    }
  }
  useEffect(() => {
    if (!chat.some((t) => t.state === 'sending' || t.state === 'responding')) return undefined
    const timer = setTimeout(() => setChat((turns) => turns.map(unknown)), 60000)
    return () => clearTimeout(timer)
  }, [chat])
  const onChat = (packet: ChatReply) => setChat((turns) => receiveChat(turns, packet))
  // Cards come whether this person hears or reads Sophia, and again after each mode signal (CX-0022): one per task,
  // and a repeat leaves the list as it was.
  const onNotice = (packet: ChatNotice) => {
    const at = arrival.next()
    setNotices((list) => receiveNotice(list, packet, at))
  }
  const interrupted = () => setChat((turns) => turns.map(unknown))
  const textModeNow = () => now.current
  return {
    chat,
    notices,
    textMode,
    textModeNow,
    rememberTextMode,
    setTextMode,
    sendChat,
    onChat,
    onNotice,
    interrupted,
  }
}
