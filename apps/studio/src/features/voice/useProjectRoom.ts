import type { ChatInput } from '@sophia/contracts/room-chat'
import type { CaptionTurn } from '../conversation/captions.ts'
import { arrivals, type ChatNoticeItem, type ChatTurn } from '../conversation/chat-view.ts'
import { useCaptions } from './useCaptions.ts'
import { arriveWithMicrophone, enterCall, switchMicrophone, useTypedChat } from './useTypedChat.ts'
// The room's state for the Studio: join (token from the API, then LiveKit), microphone, camera, screen,
// leave. Members join their project's room; an admitted guest joins with their lobby entry. Leaving the
// page leaves the room; nothing here touches goals or work.
import { useEffect, useRef, useState } from 'react'
import type { RoomToken, Snapshot } from '@sophia/contracts'
import { ApiError, issueRoomToken } from '../../api/client.ts'
import { CALL_END, keepsTextMode, type CallEnd } from './call-end.ts'
import { CallFence } from './call-fence.ts'
import type { RoomCallbacks, RoomConnection, VideoFeed } from './livekit-room.ts'
import { micOnJoin, rememberMic } from './mic-preference.ts'
import { mediaMessage, type Device, type DockStatus, type RoomParticipant } from './room-view.ts'
import type { SophiaSignal } from './sophia-view.ts'

export type { VideoFeed } from './livekit-room.ts'

export interface LeaveHow {
  pressed: true
}

export interface ProjectRoom {
  chat: ChatTurn[]
  /** Finished results' cards, one per task, for this member whether they hear or read Sophia (SMC-M03 S6, CX-0022). */
  notices: ChatNoticeItem[]
  /** Live captions of what is said aloud, for this page only (CX-0023): they never mark Chat as something new. */
  captions: CaptionTurn[]
  textMode: boolean
  /** Text mode as it is this moment, for code that awaited (a chat start, once its join settled): `textMode` is the render's. */
  textModeNow: () => boolean
  setTextMode: (on: boolean) => Promise<void>
  sendChat: (packet: ChatInput) => Promise<void>
  status: DockStatus
  error: string | null
  /** Which call this is: it moves when a new one begins, so what belonged to the last (a chat error) goes with it. */
  call: number
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
  /**
   * Out of the call. `pressed`: the person's own Leave, which counts in `leftByPress`; any other leave (another
   * project's call, the project closing) is quiet.
   */
  leave: (how?: LeaveHow) => Promise<void>
  /** How many calls this person was in and left by their own press: what the meeting left opens on each. */
  leftByPress: number
  /** When this person's latest call went live (ms): what a late join is measured from; null before any. */
  liveSince: number | null
  setMicrophone: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
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

const SWITCH: Record<Device, (c: RoomConnection, on: boolean) => Promise<void>> = {
  microphone: (c, on) => c.setMicrophone(on),
  camera: (c, on) => c.setCamera(on),
  screen: (c, on) => c.setScreenShare(on),
}

/**
 * How one device change went: it took (or there was no call to change: the choice stands for the next join), it
 * failed and the note says so, or its call went while it was under way, and it says nothing about the next one.
 */
type Outcome = 'took' | 'failed' | 'gone'

/**
 * The call's devices: each change clears the note on success or says what stopped it. The microphone
 * choice a person makes is remembered for their next join; the ones made for them are not (on arrival, and
 * off when they start typing to Sophia).
 */
function useDevices(connection: { current: RoomConnection | null }, refresh: () => void) {
  const [mediaError, setMediaError] = useState<string | null>(null)
  /** One device in call `c` turned on or off; the note says why it failed, for the way it was going. */
  const change = async (c: RoomConnection | null, device: Device, on: boolean): Promise<Outcome> => {
    if (!c) return 'took'
    if (connection.current !== c) return 'gone'
    try {
      await SWITCH[device](c, on)
    } catch (err: unknown) {
      if (connection.current !== c) return 'gone'
      setMediaError(mediaMessage(err, device, on))
      refresh()
      return 'failed'
    }
    if (connection.current !== c) return 'gone'
    setMediaError(null)
    return 'took'
  }
  const media = (device: Device, on: boolean) => change(connection.current, device, on)
  return {
    mediaError,
    clearNote: () => setMediaError(null),
    /** The microphone a join turns on, in that join's call: false when text mode began meanwhile and it stayed on. */
    arrive: () => {
      const c = connection.current
      return arriveWithMicrophone({
        enable: async () => (await change(c, 'microphone', true)) === 'took',
        textMode: () => !!c?.textMode(),
        disable: async () => (await change(c, 'microphone', false)) !== 'failed',
      })
    },
    /** Text mode's own switch: it needs to know the microphone really went off (useTypedChat). */
    silence: async () => (await media('microphone', false)) !== 'failed',
    /** The person's own choice, remembered for their next join; true when it took in this call. */
    setMicrophone: async (on: boolean): Promise<boolean> => {
      rememberMic(on)
      return (await media('microphone', on)) === 'took'
    },
    setCamera: async (on: boolean) => {
      await media('camera', on)
    },
    setScreenShare: async (on: boolean) => {
      await media('screen', on)
    },
  }
}

interface JoinPorts {
  calls: CallFence<RoomConnection>
  issue: IssueToken | null
  typedChat: ReturnType<typeof useConversation>
  setStatus: (status: DockStatus) => void
  setError: (error: string | null) => void
  refresh: () => void
  /** False when text mode began while the microphone arrived and it couldn't go off again. */
  arrive: () => Promise<boolean>
  outOfCall: (why: CallEnd | null) => void
  /** A new call began. */
  onLive: () => void
}

/**
 * Resolves to whether this person is in the call once it settles. `textOnly` is how a new join starts; a call already
 * under way keeps its text mode, which only its own switches change.
 */
async function joinConnection(ports: JoinPorts, options?: { textOnly?: boolean }): Promise<boolean> {
  const { calls, issue, typedChat, setStatus, setError, refresh, arrive, outOfCall, onLive } = ports
  // Already in the call: a second connection would be a second microphone nobody sees.
  if (calls.current) return true
  if (!issue) return false
  typedChat.rememberTextMode(options?.textOnly ?? typedChat.textModeNow())
  const call = calls.begin()
  setStatus('joining')
  setError(null)
  try {
    const opened = await openRoom(issue, {
      onChange: refresh,
      onChat: (packet) => {
        if (calls.isCurrent(call)) typedChat.onChat(packet)
      },
      onNotice: (packet) => {
        if (calls.isCurrent(call)) typedChat.onNotice(packet)
      },
      onCaption: (packet) => {
        if (calls.isCurrent(call)) typedChat.onCaption(packet)
      },
      onCaptionsLost: () => {
        if (calls.isCurrent(call)) typedChat.captionsLost()
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
    await enterCall({
      textModeNow: typedChat.textModeNow,
      applyTextMode: opened.setTextMode,
      shown: () => {
        setStatus('live')
        onLive()
        refresh()
      },
      micOnArrival,
      arrive,
      leaveTextMode: () => typedChat.setTextMode(false),
    })
    // Left, or the connection lost, while the microphone arrived: out of the call, whatever this join began as.
    return calls.holds(opened)
  } catch (err: unknown) {
    if (!calls.isCurrent(call)) return false
    setStatus('failed')
    setError(joinMessage(err))
    return false
  }
}

/**
 * One join at a time: a second connection for the same person makes LiveKit drop the first, and the call would say
 * it moved elsewhere. A join asked for while one is under way waits on that one, until its call ends (`joining` is
 * then let go: a join still settling, its microphone still arriving, answers for its own call and no later one).
 * `call` moves with each call begun.
 */
function useJoin(ports: Omit<JoinPorts, 'onLive'>, joining: { current: Promise<boolean> | null }) {
  const [call, setCall] = useState(0)
  const [liveSince, setLiveSince] = useState<number | null>(null)
  const join = (options?: { textOnly?: boolean }) => {
    if (joining.current) return joining.current
    const onLive = () => {
      setCall((n) => n + 1)
      setLiveSince(Date.now())
    }
    const attempt: Promise<boolean> = joinConnection({ ...ports, onLive }, options).finally(() => {
      if (joining.current === attempt) joining.current = null
    })
    joining.current = attempt
    return attempt
  }
  return { call, liveSince, join }
}

/**
 * The conversation's state: typed turns and cards (useTypedChat) and live captions (useCaptions), on one arrival count
 * so the chat reads as one conversation. Out of the call, both cut off what was still under way; captions also when
 * theirs may never end here (`captionsLost`).
 */
function useConversation(connection: { current: RoomConnection | null }, silence: () => Promise<boolean>) {
  const [arrival] = useState(arrivals)
  const typedChat = useTypedChat(connection, silence, arrival)
  const live = useCaptions(arrival)
  const interrupted = () => {
    typedChat.interrupted()
    live.interrupted()
  }
  return {
    ...typedChat,
    captions: live.captions,
    onCaption: live.onCaption,
    captionsLost: live.interrupted,
    interrupted,
  }
}

/** Leaving, and how many calls the person was in and left by their own press (ProjectRoom.leftByPress). */
function useLeave(calls: CallFence<RoomConnection>, outOfCall: (why: CallEnd | null) => void) {
  const [leftByPress, setLeftByPress] = useState(0)
  const leave = async (how?: LeaveHow) => {
    // A second press while the call is still ending (a slow disconnect) does nothing: the first ends it and says so,
    // so no Join shows meanwhile, and no join it began could be ended by the first press's late finish.
    if (how?.pressed && calls.current === null) return
    // A teardown that fails (LiveKit's disconnect rejecting) still leaves this person out of the call here: the call
    // is no longer theirs, and the room says so instead of staying live with a Leave that does nothing.
    await calls.end().catch(() => undefined)
    outOfCall(null)
    if (how?.pressed) setLeftByPress((n) => n + 1)
  }
  return { leave, leftByPress }
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
  const joining = useRef<Promise<boolean> | null>(null)

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
  const typedChat = useConversation(calls, silence)

  /**
   * Out of the call: nobody is shown as still here. A call that ended without this person leaving says why
   * (call-end.ts) instead of silently resetting: a lost connection offers to try again; a call that moved to
   * another tab, or was ended on purpose, offers the plain way back. Text mode ends with the call, unless the
   * connection was lost (keepsTextMode): the next join says how it starts (the dock by voice, the chat by text).
   */
  const outOfCall = (why: CallEnd | null) => {
    typedChat.interrupted()
    if (!keepsTextMode(why)) typedChat.rememberTextMode(false)
    calls.current = null
    joining.current = null
    setPeople(NOBODY)
    clearNote()
    setStatus(why && CALL_END[why].failed ? 'failed' : 'idle')
    setError(why ? CALL_END[why].note : null)
  }

  const joined = useJoin({ calls, issue, typedChat, setStatus, setError, refresh, arrive, outOfCall }, joining)

  const { leave, leftByPress } = useLeave(calls, outOfCall)

  // Speaking is voice: a microphone that came on leaves text mode, so Sophia is heard again (switchMicrophone).
  const setMicrophone = (on: boolean) =>
    switchMicrophone(on, {
      textMode: typedChat.textModeNow,
      setDevice: devices.setMicrophone,
      leaveTextMode: () => typedChat.setTextMode(false),
    })

  const startAudio = () => calls.current?.startAudio() ?? Promise.resolve()

  return {
    status,
    error,
    ...joined,
    ...people,
    ...devices,
    setMicrophone,
    chat: typedChat.chat,
    notices: typedChat.notices,
    captions: typedChat.captions,
    textMode: typedChat.textMode,
    textModeNow: typedChat.textModeNow,
    setTextMode: typedChat.setTextMode,
    sendChat: typedChat.sendChat,
    startAudio,
    ready: issue !== null,
    leave,
    leftByPress,
  }
}
