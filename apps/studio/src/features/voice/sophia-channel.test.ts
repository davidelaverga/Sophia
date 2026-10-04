import assert from 'node:assert/strict'
import { it } from 'node:test'
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import {
  CHAT_INPUT_TOPIC,
  CHAT_REPLY_TOPIC,
  encodeChatPacket,
  type ChatCaption,
  type ChatNotice,
  type ChatPacket,
  type ChatReply,
} from '@sophia/contracts/room-chat'
import type { RoomCallbacks } from './livekit-room.ts'
import { listenToSophia } from './sophia-channel.ts'

const EXCHANGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID = '55555555-5555-4555-8555-555555555555'
const TASK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const SOPHIA = { identity: 'sophia', metadata: JSON.stringify({ sophia: true }) } as Participant
const MEMBER = { identity: '11111111-1111-4111-8111-111111111111', metadata: '{}' } as Participant
/** Someone named sophia without the standing only the API signs. */
const IMPOSTOR = { identity: 'sophia', metadata: '{}' } as Participant

/** A room that only keeps its listeners, to call them as LiveKit would. */
function fakeRoom() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
  }
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }
  return { room: room as unknown as Pick<Room, 'on'>, emit }
}

function listening() {
  const got: string[] = []
  const cb: RoomCallbacks = {
    onChat: (p: ChatReply) => got.push(`chat:${p.kind}`),
    onNotice: (p: ChatNotice) => got.push(`notice:${p.taskId}`),
    onCaption: (p: ChatCaption) => got.push(`caption:${p.text}`),
    onCaptionsLost: () => got.push('lost'),
    onChange: () => undefined,
    onStatus: () => undefined,
    onEnded: () => undefined,
  }
  const { room, emit } = fakeRoom()
  listenToSophia(room, cb)
  const data = (packet: ChatPacket, who: Participant = SOPHIA, topic = CHAT_REPLY_TOPIC) =>
    emit(RoomEvent.DataReceived, encodeChatPacket(packet), who, undefined, topic)
  return { got, emit, data }
}

const caption: ChatCaption = {
  kind: 'caption',
  id: ID,
  exchangeId: EXCHANGE,
  speaker: 'sophia',
  actorId: null,
  sequence: 1,
  state: 'partial',
  text: 'Synthetic words',
}

it('each of Sophia’s packets reaches its own callback; what Studio sends itself reaches none (CX-0023)', () => {
  const { got, data } = listening()
  data(caption)
  data({ kind: 'delta', id: ID, exchangeId: EXCHANGE, text: 'Typed answer', sequence: 1 })
  data({ kind: 'notice', id: ID, exchangeId: EXCHANGE, taskId: TASK, taskKind: 'research', resultRevision: 1 })
  data({ kind: 'input', id: ID, exchangeId: EXCHANGE, inputEpoch: 1, text: 'Typed request' })
  data({ kind: 'mode', textMode: true })
  assert.deepEqual(got, ['caption:Synthetic words', 'chat:delta', `notice:${TASK}`])
})

it('takes nothing from anyone else, or on another topic', () => {
  const { got, data } = listening()
  data(caption, MEMBER)
  data(caption, IMPOSTOR)
  data(caption, SOPHIA, CHAT_INPUT_TOPIC)
  assert.deepEqual(got, [])
})

it('Sophia leaving or joining again, or this connection reconnecting, tells the captions; a member coming or going does not', () => {
  const { got, emit } = listening()
  emit(RoomEvent.ParticipantDisconnected, MEMBER)
  emit(RoomEvent.ParticipantConnected, MEMBER)
  assert.deepEqual(got, [])
  emit(RoomEvent.ParticipantDisconnected, SOPHIA)
  emit(RoomEvent.ParticipantConnected, SOPHIA)
  emit(RoomEvent.Reconnecting)
  assert.deepEqual(got, ['lost', 'lost', 'lost'])
})
