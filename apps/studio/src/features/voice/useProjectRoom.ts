import type { ChatInput } from '@sophia/contracts/room-chat'
import type { ChatTurn } from '../conversation/chat-view.ts'
import { useTypedChat } from './useTypedChat.ts'
// The room's state for the Studio: join (token from the API, then LiveKit), microphone, camera, screen,
// leave. Members join their project's room; an admitted guest joins with their lobby entry. Leaving the
// page leaves the room; nothing here touches goals or work.
import { useEffect, useState } from 'react'
import type { RoomToken, Snapshot } from '@sophia/contracts'
import { ApiError, issueRoomToken } from '../../api/client.ts'
import { CALL_END, type CallEnd } from './call-end.ts'
import { CallFence } from './call-fence.ts'
import type { RoomCallbacks, RoomConnection, VideoFeed } from './livekit-room.ts'
import { micOnJoin, rememberMic } from './mic-preference.ts'
import type { DockStatus, RoomParticipant } from './room-view.ts'
import type { SophiaSignal } from './sophia-view.ts'

export type { VideoFeed } from './livekit-room.ts'

export interface ProjectRoom {
  chat: ChatTurn[]
  textMode: boolean
  setTextMode: (on: boolean) => Promise<void>
  sendChat: (packet: ChatInput) => Promise<void>
  status: DockStatus
  error: string | null
  /** Why a microphone, camera or screen did not start, in words a person can act on. */
  mediaError: string | null
  participants: RoomParticipant[]
  feeds: VideoFeed[]
  /** Sophia's participant as this browser observes it; null when she is not in the room. */
  sophia: SophiaSignal | null
  audioBlocked: boolean
  startAudio: () => Promise<void>
  /** The project has loaded, so Join can run. Until then the room says it is opening and Join waits. */
  ready: boolean
  /** Resolves to whether this person is in the call once it settles. */
  join: (options?: { textOnly?: boolean }) => Promise<boolean>
  leave: () => Promise<void>
  setMicrophone: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
}

type Device = 'microphone' | 'camera' | 'screen'

/**
 * What stopped a device, and what to do about it. Null when there is nothing to say: cancelling the screen
 * picker is a choice, not an error. The note stays until the device works or the call ends.
 */
function mediaMessage(err: unknown, device: Device): string | null {
  const name = err instanceof Error ? err.name : ''
  if (device === 'screen') {
    return name === 'NotAllowedError' || name === 'AbortError' ? null : 'Screen sharing couldn’t start. Try again.'
  }
  const Device = device.charAt(0).toUpperCase() + device.slice(1)
  if (name === 'NotAllowedError') return `${Device} blocked. Allow it in the address bar.`
  if (name === 'NotFoundError') return `No ${device} found.`
  if (name === 'NotReadableError') return `Another app is using your ${device}. Close it and try again.`
  return `The ${device} couldn’t start. Try again.`
}

/** A failed join in words: the API's own refusal, or what to check when the room could not be reached. */
function joinMessage(err: unknown): string {
  if (err instanceof ApiError && err.status > 0 && err.status < 500) return err.message
  if (err instanceof ApiError) return 'The room isn’t available right now. Try again in a moment.'
  return 'Couldn’t connect to the room. Check your connection and try again.'
}

interface People {
  participants: RoomParticipant[]
  feeds: VideoFeed[]
  sophia: SophiaSignal | null
  audioBlocked: boolean
}
const NOBODY: People = { participants: [], feeds: [], sophia: null, audioBlocked: false }

/** How this person gets a room token: as a member of the project, or as a guest the lobby admitted. */
export type IssueToken = () => Promise<RoomToken>

/** A token from the API, then LiveKit, which loads only now: it is most of the Studio's weight. */
async function openRoom(issue: IssueToken, cb: RoomCallbacks) {
  const issued = await issue()
  const { connectRoom } = await import('./livekit-room.ts')
  return connectRoom(issued.serverUrl, issued.token, cb)
}

/**
 * The microphone on joining: as this device left it last time. Changed by amendment A06 (S1-05A): viewers
 * publish too, so no one is left without a microphone.
 */
const micOnArrival = () => micOnJoin()

/** A member's room: the token names this project's room and the audience revision the member saw. */
export function useProjectRoom(projectId: string, token: string, snapshot: Snapshot | undefined): ProjectRoom {
  const req = snapshot ? { roomId: snapshot.room.id, expectedAudienceRevision: snapshot.audienceRevision } : null
  return useRoomConnection(req ? () => issueRoomToken(token, projectId, crypto.randomUUID(), req) : null)
}

/**
 * The call's devices: each change clears the note on success or says what stopped it. The microphone
 * choice a person makes is remembered for their next join; the ones made for them are not (on arrival, and
 * off when they start typing to Sophia).
 */
function useDevices(connection: { current: RoomConnection | null }, refresh: () => void) {
  const [mediaError, setMediaError] = useState<string | null>(null)
  const media = (device: Device, change: (c: RoomConnection) => Promise<void>) => async () => {
    const c = connection.current
    if (!c) return
    try {
      await change(c)
      if (connection.current === c) setMediaError(null)
    } catch (err: unknown) {
      // A call left while the browser was still asking for the device says nothing about the next one.
      if (connection.current !== c) return
      setMediaError(mediaMessage(err, device))
      refresh()
    }
  }
  return {
    mediaError,
    clearNote: () => setMediaError(null),
    arrive: media('microphone', (c) => c.setMicrophone(true)),
    silence: media('microphone', (c) => c.setMicrophone(false)),
    setMicrophone: (on: boolean) => {
      rememberMic(on)
      return media('microphone', (c) => c.setMicrophone(on))()
    },
    setCamera: (on: boolean) => media('camera', (c) => c.setCamera(on))(),
    setScreenShare: (on: boolean) => media('screen', (c) => c.setScreenShare(on))(),
  }
}

interface JoinPorts {
  calls: CallFence<RoomConnection>
  issue: IssueToken | null
  typedChat: ReturnType<typeof useTypedChat>
  setStatus: (status: DockStatus) => void
  setError: (error: string | null) => void
  refresh: () => void
  arrive: () => Promise<void>
  outOfCall: (why: CallEnd | null) => void
}

async function joinConnection(ports: JoinPorts, options?: { textOnly?: boolean }): Promise<boolean> {
  const { calls, issue, typedChat, setStatus, setError, refresh, arrive, outOfCall } = ports
  const typed = options?.textOnly ?? typedChat.textMode
  typedChat.rememberTextMode(typed)
  if (!issue) return false
  // Already in the call: a second connection would be a second microphone nobody sees.
  if (calls.current) return true
  const call = calls.begin()
  setStatus('joining')
  setError(null)
  try {
    const opened = await openRoom(issue, {
      onChange: refresh,
      onChat: (packet) => {
        if (calls.isCurrent(call)) typedChat.onChat(packet)
      },
      onStatus: (s) => {
        if (calls.isCurrent(call)) setStatus(s)
      },
      onEnded: (why) => {
        if (calls.isCurrent(call)) outOfCall(why)
      },
    })
    // Left, gone or joined again while this join was under way: it has been left, and the screen stays as it is.
    if (!calls.adopt(call, opened)) return false
    opened.setTextMode(typed)
    setStatus('live')
    refresh()
    if (!typed && micOnArrival()) await arrive()
    return true
  } catch (err: unknown) {
    if (!calls.isCurrent(call)) return false
    setStatus('failed')
    setError(joinMessage(err))
    return false
  }
}

/** Null `issue` while nobody may join yet (the project has not loaded): Join waits. */
export function useRoomConnection(issue: IssueToken | null): ProjectRoom {
  /**
   * The call, and which join is current. An 'ended' from a call this person already left is expected, not a drop;
   * a join that Leave, the page going away or a newer join overtook is left as soon as it connects.
   */
  const [calls] = useState(() => new CallFence<RoomConnection>())
  const [status, setStatus] = useState<DockStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<People>(NOBODY)

  useEffect(() => () => void calls.end(), [calls])

  const refresh = () => {
    const c = calls.current
    setPeople(
      c
        ? { participants: c.participants(), feeds: c.feeds(), sophia: c.sophia(), audioBlocked: c.audioBlocked() }
        : NOBODY,
    )
  }
  const { clearNote, arrive, silence, ...devices } = useDevices(calls, refresh)
  const typedChat = useTypedChat(calls, silence)

  /**
   * Out of the call: nobody is shown as still here. A call that ended without this person leaving says why
   * (call-end.ts) instead of silently resetting: a lost connection offers to try again; a call that moved to
   * another tab, or was ended on purpose, offers the plain way back.
   */
  const outOfCall = (why: CallEnd | null) => {
    typedChat.interrupted()
    calls.current = null
    setPeople(NOBODY)
    clearNote()
    setStatus(why && CALL_END[why].failed ? 'failed' : 'idle')
    setError(why ? CALL_END[why].note : null)
  }

  const join = (options?: { textOnly?: boolean }) =>
    joinConnection({ calls, issue, typedChat, setStatus, setError, refresh, arrive, outOfCall }, options)

  // Leaving on purpose ends text mode: the next join says how it starts (the dock by voice, the chat by text).
  // A call that drops keeps the mode, so rejoining does not turn on a microphone that was off.
  const leave = async () => {
    await calls.end()
    typedChat.rememberTextMode(false)
    outOfCall(null)
  }

  // Speaking is voice: turning the microphone on leaves text mode, so Sophia is heard again.
  const setMicrophone = async (on: boolean) => {
    if (on && typedChat.textMode) await typedChat.setTextMode(false)
    await devices.setMicrophone(on)
  }

  const startAudio = async () => {
    await calls.current?.startAudio()
  }

  return {
    status,
    error,
    ...people,
    ...devices,
    setMicrophone,
    chat: typedChat.chat,
    textMode: typedChat.textMode,
    setTextMode: typedChat.setTextMode,
    sendChat: typedChat.sendChat,
    startAudio,
    ready: issue !== null,
    join,
    leave,
  }
}
