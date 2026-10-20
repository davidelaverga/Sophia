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
import { useOnline } from '../personal/online.ts'
import { CALL_END, joinHeld, keepsTextMode, keptNote, noteFor, type CallEnd } from './call-end.ts'
import { CallFence, keptIfStill } from './call-fence.ts'
import { LIVE_BEAT_MS, Rejoin, rejoinLine, type RejoinStep } from './call-rejoin.ts'
import { browserTabs } from './call-tabs.ts'
import { switchCamera } from './camera-flip.ts'
import type { RoomCallbacks, RoomConnection, VideoFeed } from './livekit-room.ts'
import { rememberBackground, type BackgroundId } from './background-preference.ts'
import { rememberDevice, type DeviceKind, type MediaDevice } from './device-preference.ts'
import { micOnJoin, rememberMic } from './mic-preference.ts'
import type { Heard } from './reaction-channel.ts'
import { paced, shownAfter, SHOWN_FOR_MS, type Reaction, type ReactionEmoji } from './reactions.ts'
import type { Level } from './people-volume.ts'
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
  /**
   * A dropped call's one try back in waits for the network or is under way (call-rejoin.md): Leave stays, and stops
   * it; the room still reports the call as on, so its project stays mounted out of sight.
   */
  rejoining: boolean
  /**
   * Which call this is: it moves when a new one begins, so what belonged to the last (a chat error, what it followed)
   * goes with it. Never another call's, even once the room is mounted again (newCall).
   */
  call: number
  /** Why a microphone, camera or screen did not start, in words a person can act on. */
  mediaError: string | null
  participants: RoomParticipant[]
  feeds: VideoFeed[]
  /** Sophia's participant as this browser observes it; null when she is not in the room. */
  sophia: SophiaSignal | null
  audioBlocked: boolean
  /** How loud this person is now, 0…1, read in this browser only (voice-levels.ts); 0 out of a call. */
  voiceLevel: (identity: string) => number
  /** How loud Sophia is now, 0…1; 0 out of a call. */
  sophiaLevel: () => number
  startAudio: () => Promise<void>
  /** The project has loaded, so Join can run. Until then the room says it is opening and Join waits. */
  ready: boolean
  /** Resolves to whether this person is in the call once it settles. */
  /** `mic`: the microphone this join starts with, as chosen before it (prejoin-toggles.md); else as last left here. */
  /** `still`: asked right before LiveKit; false ends the join there, said as a failed one (a try back in, call-rejoin.md). */
  join: (options?: JoinOptions, still?: () => boolean) => Promise<boolean>
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
  /**
   * A fence on the microphone choices: true until the next one is made, or the call is another. Push to talk's late
   * turn-off answers to it (Codex P2s on #381).
   */
  chosenStill: () => () => boolean
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
  /**
   * The person's choice of microphone, speaker or camera: kept for their next call, and this one switched to it;
   * resolves true once this call did.
   */
  switchDevice: (kind: DeviceKind, id: string) => Promise<boolean>
  /** The devices of a kind, through LiveKit (loaded only now); rejects where the browser refuses access. */
  listDevices: (kind: DeviceKind) => Promise<MediaDevice[]>
  /** The person's camera background: kept for their next call, and drawn in this one (call-backgrounds.md). */
  setBackground: (id: BackgroundId) => Promise<void>
  /** Whether this device can draw a camera background. */
  backgroundsSupported: () => Promise<boolean>
  /** Reactions on screen, this person's own and the room's, each for a few seconds (call-reactions.md). */
  reactions: Reaction[]
  /** Speech was just heard on this person's muted microphone: «You're muted», for a few seconds (muted-speech.md). */
  mutedHint: boolean
  /** React: shown here at once and sent to everyone in the call; at most one every 400 ms. */
  react: (emoji: ReactionEmoji) => void
  /** What this person follows, said to the members in the call (A14, following-signal.ts); null for nothing. */
  setFollowing: (versionId: string | null) => Promise<void>
  /** How loud each other person is here alone, by identity, full when not listed (people-volume.md). */
  volumes: ReadonlyMap<string, Level>
  setVolume: (identity: string, level: Level) => void
  /** Others' cameras come to this browser (incoming-video.md): off for this call only; a shared screen still comes. */
  incomingVideo: boolean
  setIncomingVideo: (on: boolean) => void
  /**
   * The dock's «This browser blocked the call’s sound» was put away (Not now) in this call: it says nothing more until
   * the next call (sound-view.ts).
   */
  soundNoticeAway: boolean
  putSoundNoticeAway: () => void
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

/**
 * A token from the API, then LiveKit, which loads only now: it is most of the Studio's weight. A join overtaken while
 * they came (a Leave during a try back in, the page going) goes no further, so once its token is back the room never
 * sees it flash in and out. Nor does a join no longer wanted (`still`): a try back in whose token came too late.
 */
async function openRoom(issue: IssueToken, ports: Pick<JoinPorts, 'scoped'>, cb: RoomCallbacks, gate: Gate) {
  const issued = await issue()
  ports.scoped(scopeOf(issued))
  const { connectRoom } = await import('./livekit-room.ts')
  if (!gate.current()) throw new Error('This join was overtaken before it connected')
  if (gate.still && !gate.still()) throw new Error('This try back in came too late to connect')
  // Asked again once connected, before it becomes the call and its microphone starts.
  return keptIfStill(await connectRoom(issued.serverUrl, issued.token, cb), gate.still)
}

/** What a join asks before LiveKit: whether it is still the current one, and still wanted (a try back in). */
interface Gate {
  current: () => boolean
  still: (() => boolean) | undefined
}

/**
 * The call a token names, for this browser's other tabs (call-tabs.ts): its LiveKit room and the person in it, read
 * from the token's subject (LiveKit's identity) without trusting it for anything else; the room alone where the token
 * says none.
 */
function scopeOf(issued: RoomToken): string {
  try {
    const body = issued.token.split('.')[1] ?? ''
    const claims: unknown = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    const sub = typeof claims === 'object' && claims !== null && 'sub' in claims ? claims.sub : null
    return typeof sub === 'string' ? `${issued.roomId}:${sub}` : issued.roomId
  } catch {
    return issued.roomId
  }
}

/** A kind's devices, through the room's own module: the one import of LiveKit, which the fixtures replace. */
async function listDevices(kind: DeviceKind): Promise<MediaDevice[]> {
  const room = await import('./livekit-room.ts')
  return room.listDevices(kind)
}

/** Whether this device can draw a camera background, as the room's module asks it (call-backgrounds.md). */
async function backgroundsSupported(): Promise<boolean> {
  const room = await import('./livekit-room.ts')
  return room.backgroundsSupported()
}

/**
 * The microphone on joining: as this device left it last time. Changed by amendment A06 (S1-05A): viewers
 * publish too, so no one is left without a microphone.
 */
const micOnArrival = () => micOnJoin()

/** How a new join starts: in text mode or not, and with the microphone chosen before it. */
export interface JoinOptions {
  textOnly?: boolean
  mic?: boolean
  /**
   * `mic` is a dropped call's (call-rejoin.md): never on unless this device's own choice is on as the join begins, so a
   * «join with the microphone off» chosen since the drop holds, whenever the join comes.
   */
  capped?: boolean
  /** The camera on once in, as chosen before joining (prejoin-toggles.md). */
  camera?: boolean
}

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

/** What stopped a switch, in words a person can act on (call-devices.md). */
const SWITCH_REFUSED: Record<DeviceKind, string> = {
  audioinput: 'Couldn’t switch to that microphone. Another app may be using it.',
  audiooutput: 'Couldn’t switch to that speaker.',
  videoinput: 'Couldn’t switch to that camera. Another app may be using it.',
}

/** A background chosen: kept for the next call; in this one, drawn, the note saying it if the device refused. */
function backgroundSwitch(connection: { current: RoomConnection | null }, say: (note: string | null) => void) {
  return async (id: BackgroundId) => {
    rememberBackground(id)
    const c = connection.current
    if (!c) return
    try {
      await c.setBackground(id)
    } catch {
      if (connection.current === c) say('Couldn’t draw that background on this device.')
      return
    }
    if (connection.current === c) say(null)
  }
}

/**
 * A device chosen: kept for the next call; in this one, switched, the note saying it if the browser refused. It
 * resolves true once this call switched: kept, even refused, is not taken (camera-flip.ts follows the call's camera).
 */
function deviceSwitch(connection: { current: RoomConnection | null }, say: (note: string | null) => void) {
  return async (kind: DeviceKind, id: string) => {
    rememberDevice(kind, id)
    const c = connection.current
    if (!c) return false
    try {
      await c.switchDevice(kind, id)
    } catch {
      if (connection.current === c) say(SWITCH_REFUSED[kind])
      return false
    }
    if (connection.current !== c) return false
    say(null)
    return true
  }
}

/**
 * The room's device switch, each camera switch in the call that went live at `liveSince` told to your tile's presses,
 * whichever control made it: Video settings, which a phone turned sideways shows, or the tile itself. The next press
 * goes on from the camera the call is on (camera-flip.ts; Codex P2 on #464).
 */
function tellingCamera(
  switchDevice: ProjectRoom['switchDevice'],
  liveSince: number | null,
): ProjectRoom['switchDevice'] {
  return (kind, id) =>
    kind === 'videoinput' ? switchCamera(liveSince, id, () => switchDevice(kind, id)) : switchDevice(kind, id)
}

/**
 * The call's devices: each change clears the note on success or says what stopped it. The microphone
 * choice a person makes is remembered for their next join; the ones made for them are not (on arrival, and
 * off when they start typing to Sophia).
 */
function useDevices(connection: { current: RoomConnection | null }, refresh: () => void) {
  const [mediaError, setMediaError] = useState<string | null>(null)
  /** The microphone choices made, counted as each is asked (before its first wait). */
  const choices = useRef(0)
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
      choices.current += 1
      rememberMic(on)
      return (await media('microphone', on)) === 'took'
    },
    chosenStill: () => {
      const [c, n] = [connection.current, choices.current]
      return () => c !== null && connection.current === c && choices.current === n
    },
    setCamera: async (on: boolean) => {
      await media('camera', on)
    },
    setScreenShare: async (on: boolean) => {
      await media('screen', on)
    },
    switchDevice: deviceSwitch(connection, setMediaError),
    setBackground: backgroundSwitch(connection, setMediaError),
  }
}

/** Others' cameras, taken or let go for this call (incoming-video.md); out of the call, the next one takes them again. */
function useIncomingVideo(connection: { current: RoomConnection | null }) {
  const [incomingVideo, setIncoming] = useState(true)
  return {
    incomingVideo,
    setIncomingVideo: (on: boolean) => {
      setIncoming(on)
      connection.current?.setIncomingVideo(on)
    },
    resetIncoming: () => setIncoming(true),
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
  outOfCall: (why: CallEnd | null, selfLeft?: boolean) => void
  /** The token named the call: its LiveKit room and the person (scopeOf). */
  scoped: (scope: string) => void
  /** A new call began. */
  onLive: () => void
}

/**
 * What a connection tells the room, heard only while its join is the current one: a superseded join's events are not
 * this person's call.
 */
function heardWhile(current: () => boolean, ports: JoinPorts): RoomCallbacks {
  const { typedChat, setStatus, refresh, outOfCall } = ports
  return {
    onChange: refresh,
    onChat: (packet) => {
      if (current()) typedChat.onChat(packet)
    },
    onNotice: (packet) => {
      if (current()) typedChat.onNotice(packet)
    },
    onCaption: (packet) => {
      if (current()) typedChat.onCaption(packet)
    },
    onCaptionsLost: () => {
      if (current()) typedChat.captionsLost()
    },
    onReaction: (heard) => {
      if (current()) typedChat.onReaction(heard)
    },
    onSpeakingMuted: () => {
      if (current()) typedChat.onSpeakingMuted()
    },
    onStatus: (s) => {
      if (current()) setStatus(s)
    },
    onEnded: (why, selfLeft) => {
      if (current()) outOfCall(why, selfLeft)
    },
  }
}

/**
 * Resolves to whether this person is in the call once it settles. `textOnly` is how a new join starts; a call already
 * under way keeps its text mode, which only its own switches change.
 */
async function joinConnection(ports: JoinPorts, options?: JoinOptions, still?: () => boolean): Promise<boolean> {
  const { calls, issue, typedChat, setStatus, setError, refresh, arrive, onLive } = ports
  // Already in the call: a second connection would be a second microphone nobody sees.
  if (calls.current) return true
  if (!issue) return false
  typedChat.rememberTextMode(options?.textOnly ?? typedChat.textModeNow())
  const call = calls.begin()
  const current = () => calls.isCurrent(call)
  setStatus('joining')
  setError(null)
  try {
    const opened = await openRoom(issue, ports, heardWhile(current, ports), { current, still })
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
      // The choice made before joining is carried, not only kept: a device that keeps nothing still honours it.
      micOnArrival:
        options?.mic === undefined ? micOnArrival : () => options.mic === true && (!options.capped || micOnJoin()),
      arrive,
      leaveTextMode: () => typedChat.setTextMode(false),
    })
    // Left, or the connection lost, while the microphone arrived: out of the call, whatever this join began as.
    return calls.holds(opened)
  } catch (err: unknown) {
    if (!current()) return false
    setStatus('failed')
    setError(joinMessage(err))
    return false
  }
}

/** Calls numbered on this page, by any room: a room mounted again starts from where the last left off. */
let callsNumbered = 0

/** A call's number, never another's: what a call keeps (what it followed) is never a later call's (Codex on #138). */
export const newCall = (): number => (callsNumbered += 1)

/**
 * One join at a time: a second connection for the same person makes LiveKit drop the first, and the call would say
 * it moved elsewhere. A join asked for while one is under way waits on that one, until its call ends (`joining` is
 * then let go: a join still settling, its microphone still arriving, answers for its own call and no later one).
 * `call` moves with each call begun.
 */
function useJoin(
  ports: Omit<JoinPorts, 'onLive'>,
  joining: { current: Promise<boolean> | null },
  startCamera: () => Promise<void>,
) {
  const [call, setCall] = useState(newCall)
  const [liveSince, setLiveSince] = useState<number | null>(null)
  // The choices of a join that failed stand for the next one asked without its own (Try again; Codex P1 on #361), and
  // so does the microphone of a call that dropped (`stand`): its try back in and Try again bring it back as it was.
  const failedWith = useRef<JoinOptions | undefined>(undefined)
  const join = (options?: JoinOptions, still?: () => boolean) => {
    if (joining.current) return joining.current
    const onLive = () => {
      setCall(newCall())
      setLiveSince(Date.now())
    }
    const used = options ?? failedWith.current
    const attempt: Promise<boolean> = joinConnection({ ...ports, onLive }, used, still)
      .then(async (inCall) => {
        // Only the join still current writes the next one's choices: one overtaken (a Leave, another project opened)
        // has had its end clear them (`stand`), and its late answer must not write them back.
        if (joining.current === attempt) failedWith.current = inCall ? undefined : used
        if (inCall && used?.camera) await startCamera()
        return inCall
      })
      .finally(() => {
        if (joining.current === attempt) joining.current = null
      })
    joining.current = attempt
    return attempt
  }
  const stand = (options: JoinOptions | undefined) => {
    failedWith.current = options
  }
  return { call, liveSince, join, stand }
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
  const reacting = useReactions(connection)
  const muted = useMutedHint()
  const interrupted = () => {
    typedChat.interrupted()
    live.interrupted()
    reacting.clear()
    // The hint is its call's: out of it, nothing is muted (Codex P2 on #357).
    muted.clear()
  }
  return {
    ...typedChat,
    captions: live.captions,
    onCaption: live.onCaption,
    captionsLost: live.interrupted,
    reactions: reacting.reactions,
    onReaction: reacting.onReaction,
    react: reacting.react,
    mutedHint: muted.shown,
    onSpeakingMuted: muted.heard,
    interrupted,
  }
}

/** How long «You're muted» stays said. */
const MUTED_HINT_MS = 5000

/** «You're muted» for a few seconds after speech was heard on the muted microphone (muted-speech.md). */
function useMutedHint() {
  const [shown, setShown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const heard = () => {
    clearTimeout(timer.current)
    setShown(true)
    timer.current = setTimeout(() => setShown(false), MUTED_HINT_MS)
  }
  const clear = () => {
    clearTimeout(timer.current)
    setShown(false)
  }
  return { shown, heard, clear }
}

/** What the conversation gives the room: the chat, the notices, the captions, the reactions, and text mode. */
function conversationParts(c: ReturnType<typeof useConversation>) {
  const { chat, notices, captions, reactions, react, mutedHint, textMode, textModeNow, setTextMode, sendChat } = c
  return { chat, notices, captions, reactions, react, mutedHint, textMode, textModeNow, setTextMode, sendChat }
}

/** Reactions on screen (call-reactions.md): this person's own and the room's, each for a few seconds, the newest twelve. */
function useReactions(connection: { current: RoomConnection | null }) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const last = useRef<number | null>(null)
  const show = (reaction: Omit<Reaction, 'id'>) => {
    const id = crypto.randomUUID()
    setReactions((now) => shownAfter(now, { ...reaction, id }))
    setTimeout(() => setReactions((now) => now.filter((r) => r.id !== id)), SHOWN_FOR_MS)
  }
  return {
    reactions,
    onReaction: (heard: Heard) => show({ name: heard.name, emoji: heard.emoji, local: false }),
    react: (emoji: ReactionEmoji) => {
      const c = connection.current
      const now = Date.now()
      if (!c || !paced(now, last.current)) return
      last.current = now
      show({ name: 'You', emoji, local: true })
      // Best effort, as a typing signal: a reaction lost on the way is gone with its few seconds.
      c.sendReaction(emoji).catch(() => undefined)
    },
    clear: () => setReactions([]),
  }
}

/** Each person's volume, here alone (people-volume.md): kept by person for the call; out of it, everyone is full again. */
function usePeopleVolume(connection: { current: RoomConnection | null }) {
  const [volumes, setVolumes] = useState<ReadonlyMap<string, Level>>(() => new Map())
  return {
    volumes,
    setVolume: (identity: string, level: Level) => {
      setVolumes((now) => new Map(now).set(identity, level))
      connection.current?.setVolume(identity, level)
    },
    resetVolumes: () => setVolumes(new Map()),
  }
}

/** The dock's line about a blocked sound, put away for this call alone (sound-blocked-others.md). */
function useSoundNotice() {
  const [soundNoticeAway, setAway] = useState(false)
  return { soundNoticeAway, putSoundNoticeAway: () => setAway(true), resetSoundNotice: () => setAway(false) }
}

/**
 * What this person chose for this call alone: each person's volume, others' cameras, and the blocked sound's line put
 * away. Out of it, all three reset.
 */
function useCallChoices(connection: { current: RoomConnection | null }) {
  const { resetVolumes, ...volume } = usePeopleVolume(connection)
  const { resetIncoming, ...incoming } = useIncomingVideo(connection)
  const { resetSoundNotice, ...sound } = useSoundNotice()
  const resetChoices = () => {
    resetVolumes()
    resetIncoming()
    resetSoundNotice()
  }
  return { choices: { ...volume, ...incoming, ...sound }, resetChoices }
}

/**
 * Leaving, and how many calls the person was in and left by their own press (ProjectRoom.leftByPress). Every leave,
 * pressed or quiet (another project opened, a shut door), first stops a dropped call's try back in (call-rejoin.md),
 * and then ends its join: the drop ended the call, so that Leave opens no recap.
 */
function useLeave(
  calls: CallFence<RoomConnection>,
  outOfCall: (why: CallEnd | null) => void,
  stopRejoin: () => boolean,
) {
  const [leftByPress, setLeftByPress] = useState(0)
  const leave = async (how?: LeaveHow) => {
    const pressed = !stopRejoin() && how?.pressed
    // A second press while the call is still ending (a slow disconnect) does nothing: the first ends it and says so,
    // so no Join shows meanwhile, and no join it began could be ended by the first press's late finish.
    if (pressed && calls.current === null) return
    // A teardown that fails (LiveKit's disconnect rejecting) still leaves this person out of the call here: the call
    // is no longer theirs, and the room says so instead of staying live with a Leave that does nothing.
    await calls.end().catch(() => undefined)
    outOfCall(null)
    if (pressed) setLeftByPress((n) => n + 1)
  }
  return { leave, leftByPress }
}

/**
 * What reaches through to the call this person is in, read live so a new call is its own: saying what they follow
 * (out of a call there is no one to tell), and how loud each voice is (out of a call, silence). Made once, so their
 * readers stay the same and nothing that takes them runs again.
 */
const relaysOf = (calls: CallFence<RoomConnection>) => ({
  setFollowing: (versionId: string | null) => calls.current?.setFollowing(versionId) ?? Promise.resolve(),
  voiceLevel: (identity: string) => calls.current?.voiceLevel(identity) ?? 0,
  sophiaLevel: () => calls.current?.sophiaLevel() ?? 0,
})

/**
 * The room's note as the browser's connection stands (noteFor, costuras seam #8): a call lost offline says so, and once
 * the network is back, that Try again rejoins. The call stays lost until a join gets back in. Offline, out of the call
 * (`inCall`: in it, or on the way into it), any join asks for nothing, since it could reach nothing, and says why
 * (joinHeld): after a lost call, the lost call's line; from rest, «You’re offline. Join once you’re back.», gone once
 * the network is back (offline-join-from-rest.md). In the call, a join goes to the call, which answers it. A join that
 * failed offline keeps the offline note (keptNote), whatever an earlier try said.
 */
function useRoomNote(inCall: () => boolean) {
  const [note, setNote] = useState<string | null>(null)
  const lost = useRef(false)
  const online = useOnline()
  return {
    error: noteFor(note, online),
    setError: (next: string | null) => {
      if (next === CALL_END.dropped.note) lost.current = true
      setNote(keptNote(next, { online: navigator.onLine, lost: lost.current }))
    },
    /** A leave: the room rests, no call lost, whatever ended before (a Leave during a try back in, call-rejoin.md). */
    rest: () => {
      lost.current = false
      setNote(null)
    },
    joinOnline:
      (join: ProjectRoom['join']) =>
      async (options?: JoinOptions, still?: () => boolean): Promise<boolean> => {
        const held = joinHeld({ online: navigator.onLine, lost: lost.current, inCall: inCall() })
        if (held !== null) {
          setNote(held)
          return false
        }
        const joined = await join(options, still)
        if (joined) lost.current = false
        return joined
      },
  }
}

/** The browser's side of a try back in: its clock, its `online`, and its timers. */
const BROWSER = {
  now: () => Date.now(),
  online: () => navigator.onLine,
  whenOnline: (back: () => void) => {
    window.addEventListener('online', back, { once: true })
    return () => window.removeEventListener('online', back)
  },
  after: (ms: number, run: () => void) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
}

/**
 * A dropped call's one try back in (call-rejoin.md), made with the latest render's join and note: Try again, pressed
 * for the person. The call is seen live every few seconds while it is; when the room goes, whatever waits or runs stops.
 */
function useRejoin(status: DockStatus, join: ProjectRoom['join'], say: (note: string) => void) {
  const [step, setStep] = useState<RejoinStep | null>(null)
  // This room among this browser's tabs (call-tabs.ts): what it claims is its own.
  const [room] = useState(() => crypto.randomUUID())
  const latest = useRef({ join, say })
  useEffect(() => {
    latest.current = { join, say }
  })
  const [rejoin] = useState(
    () =>
      new Rejoin({
        ...BROWSER,
        show: setStep,
        held: (scope) => browserTabs.held(scope),
        claim: (scope, state) => browserTabs.say(room, scope, state),
        join: (still) => latest.current.join(undefined, still),
        say: (note) => latest.current.say(note),
      }),
  )
  useEffect(
    () => () => {
      rejoin.stop()
      rejoin.status('idle')
    },
    [rejoin],
  )
  // Each status said to this browser's other tabs, so none of their tries takes this call (call-tabs.ts).
  useEffect(() => {
    rejoin.status(status)
    if (status !== 'live') return undefined
    const beat = setInterval(() => rejoin.beat(), LIVE_BEAT_MS)
    return () => clearInterval(beat)
  }, [status, rejoin])
  return { line: rejoinLine(step), rejoining: step === 'waiting' || step === 'trying', rejoin }
}

/**
 * Out of the call: nobody is shown as still here. A call that ended without this person leaving says why
 * (call-end.ts) instead of silently resetting: a lost connection offers to try again, and tries once on its own
 * (call-rejoin.md); a call that moved to another tab, or was ended on purpose, offers the plain way back. Text mode
 * ends with the call, unless the connection was lost (keepsTextMode): the next join says how it starts (the dock by
 * voice, the chat by text). So does the microphone: after a lost connection the next join brings it back as the call
 * had it, and never on unless this device's choice is on too (an admin's mute, «on» chosen in Settings meanwhile, or a
 * mute while LiveKit reconnected); any other end leaves it to the person's choice (`stand`).
 */
function outOfCallFor(room: {
  calls: CallFence<RoomConnection>
  joining: { current: Promise<boolean> | null }
  typedChat: ReturnType<typeof useConversation>
  stand: (options: JoinOptions | undefined) => void
  reset: () => void
  setStatus: (status: DockStatus) => void
  setError: (error: string | null) => void
  ended: (why: CallEnd | null, selfLeft: boolean) => void
}) {
  return (why: CallEnd | null, selfLeft = false) => {
    room.typedChat.interrupted()
    if (!keepsTextMode(why)) room.typedChat.rememberTextMode(false)
    // The call's microphone as last seen, capped as the next join begins by this person's choice then (a mute the call
    // missed, or «off» chosen since): never on unless both have it on.
    const micWas = room.calls.current?.micWas() ?? false
    room.stand(why === 'dropped' ? { mic: micWas, capped: true } : undefined)
    room.calls.current = null
    room.joining.current = null
    room.reset()
    room.setStatus(why && CALL_END[why].failed ? 'failed' : 'idle')
    room.setError(why ? CALL_END[why].note : null)
    room.ended(why, selfLeft)
  }
}

/** Who the call shows now: its people, feeds, Sophia and whether audio waits for a press; nobody out of a call. */
const peopleOf = (c: RoomConnection | null): People =>
  c ? { participants: c.participants(), feeds: c.feeds(), sophia: c.sophia(), audioBlocked: c.audioBlocked() } : NOBODY

/**
 * Null `issue` while nobody may join yet (the project has not loaded): Join waits. `calls` is the call, and which join
 * is current: an 'ended' from a call this person already left is expected, not a drop; a join that Leave, the page
 * going away or a newer join overtook is left as soon as it connects.
 */
export function useRoomConnection(issue: IssueToken | null): ProjectRoom {
  const [calls] = useState(() => new CallFence<RoomConnection>())
  const [status, setStatus] = useState<DockStatus>('idle')
  const joining = useRef<Promise<boolean> | null>(null)
  const { error, setError, rest, joinOnline } = useRoomNote(() => calls.current !== null || joining.current !== null)
  const [people, setPeople] = useState<People>(NOBODY)

  useEffect(() => () => void calls.end(), [calls])

  const refresh = () => setPeople(peopleOf(calls.current))
  const { clearNote, arrive, silence, ...devices } = useDevices(calls, refresh)
  const { choices, resetChoices } = useCallChoices(calls)
  const typedChat = useConversation(calls, silence)

  const reset = () => {
    setPeople(NOBODY)
    clearNote()
    resetChoices()
  }
  // The join (`joined`) and its try back in (`rejoin`) are made below; a call ends only after that.
  const ended = (why: CallEnd | null, selfLeft: boolean) => rejoin.ended(why, selfLeft)
  const stand = (options: JoinOptions | undefined) => joined.stand(options)
  const scoped = (scope: string) => rejoin.scoped(scope)
  const say = (note: string | null) => (note === null ? rest() : setError(note))
  const outOfCall = outOfCallFor({ calls, joining, typedChat, stand, reset, setStatus, setError: say, ended })

  const ports = { calls, issue, typedChat, setStatus, setError, refresh, arrive, outOfCall, scoped }
  const joined = useJoin(ports, joining, () => devices.setCamera(true))
  const join = joinOnline(joined.join)
  const { line, rejoining, rejoin } = useRejoin(status, join, setError)

  const { leave, leftByPress } = useLeave(calls, outOfCall, () => rejoin.stop())

  // Speaking is voice: a microphone that came on leaves text mode, so Sophia is heard again (switchMicrophone).
  const setMicrophone = (on: boolean) =>
    switchMicrophone(on, {
      textMode: typedChat.textModeNow,
      setDevice: devices.setMicrophone,
      leaveTextMode: () => typedChat.setTextMode(false),
    })

  const [relays] = useState(() => relaysOf(calls))

  return {
    status,
    error: line ?? error,
    rejoining,
    ...joined,
    join,
    ...people,
    ...devices,
    switchDevice: tellingCamera(devices.switchDevice, joined.liveSince),
    ...choices,
    setMicrophone,
    ...conversationParts(typedChat),
    startAudio: () => calls.current?.startAudio() ?? Promise.resolve(),
    listDevices,
    backgroundsSupported,
    ...relays,
    ready: issue !== null,
    leave,
    leftByPress,
  }
}
