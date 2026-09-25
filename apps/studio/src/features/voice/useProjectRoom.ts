// The room's state for the Studio: join (token from the API, then LiveKit), microphone, camera, screen,
// leave. Members join their project's room; an admitted guest joins with their lobby entry. Leaving the
// page leaves the room; nothing here touches goals or work.
import { useEffect, useRef, useState } from 'react'
import type { RoomToken, Snapshot } from '@sophia/contracts'
import { ApiError, issueRoomToken } from '../../api/client.ts'
import type { RoomCallbacks, RoomConnection, VideoFeed } from './livekit-room.ts'
import { micOnJoin, rememberMic } from './mic-preference.ts'
import type { DockStatus, RoomParticipant } from './room-view.ts'
import type { SophiaSignal } from './sophia-view.ts'

export type { VideoFeed } from './livekit-room.ts'

export interface ProjectRoom {
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
  join: () => Promise<void>
  leave: () => Promise<void>
  setMicrophone: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
}

type Device = 'microphone' | 'camera' | 'screen'

const KEY_OF: Record<Exclude<Device, 'screen'>, string> = { microphone: 'M', camera: 'V' }

/**
 * What stopped a device, and what to do about it. Null when there is nothing to say: cancelling the screen
 * picker is a choice, not an error. The note stays until the device works or the call ends.
 */
function mediaMessage(err: unknown, device: Device): string | null {
  const name = err instanceof Error ? err.name : ''
  if (device === 'screen') {
    return name === 'NotAllowedError' || name === 'AbortError' ? null : 'Screen sharing couldn’t start. Try again.'
  }
  const listen = device === 'microphone' ? ' You can still listen.' : ''
  const Device = device.charAt(0).toUpperCase() + device.slice(1)
  if (name === 'NotAllowedError') {
    return `${Device} blocked. Allow it from the icon in the address bar, then press ${KEY_OF[device]}.${listen}`
  }
  if (name === 'NotFoundError') return `No ${device} found.${listen}`
  if (name === 'NotReadableError') return `Another app is using your ${device}. Close it and try again.`
  return `The ${device} couldn’t start. Try again.${listen}`
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
 * choice a person makes is remembered for their next join; the one made for them on arrival is not.
 */
function useDevices(connection: { current: RoomConnection | null }, refresh: () => void) {
  const [mediaError, setMediaError] = useState<string | null>(null)
  const media = (device: Device, change: (c: RoomConnection) => Promise<void>) => async () => {
    const c = connection.current
    if (!c) return
    try {
      await change(c)
      setMediaError(null)
    } catch (err: unknown) {
      setMediaError(mediaMessage(err, device))
      refresh()
    }
  }
  return {
    mediaError,
    clearNote: () => setMediaError(null),
    arrive: media('microphone', (c) => c.setMicrophone(true)),
    setMicrophone: (on: boolean) => {
      rememberMic(on)
      return media('microphone', (c) => c.setMicrophone(on))()
    },
    setCamera: (on: boolean) => media('camera', (c) => c.setCamera(on))(),
    setScreenShare: (on: boolean) => media('screen', (c) => c.setScreenShare(on))(),
  }
}

/** Null `issue` while nobody may join yet (the project has not loaded): Join waits. */
export function useRoomConnection(issue: IssueToken | null): ProjectRoom {
  const connection = useRef<RoomConnection | null>(null)
  /** Which call is current: an 'ended' from a call this person already left is expected, not a drop. */
  const calls = useRef(0)
  const [status, setStatus] = useState<DockStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<People>(NOBODY)

  useEffect(() => () => void connection.current?.leave(), [])

  const refresh = () => {
    const c = connection.current
    setPeople(
      c
        ? { participants: c.participants(), feeds: c.feeds(), sophia: c.sophia(), audioBlocked: c.audioBlocked() }
        : NOBODY,
    )
  }
  const { clearNote, arrive, ...devices } = useDevices(connection, refresh)

  /**
   * Out of the call: nobody is shown as still here. A call that ended without this person leaving (a
   * network drop, the room taken away) says so and offers to rejoin, instead of silently resetting.
   */
  const outOfCall = (dropped: boolean) => {
    connection.current = null
    setPeople(NOBODY)
    clearNote()
    setStatus(dropped ? 'failed' : 'idle')
    setError(dropped ? 'You were disconnected from the room.' : null)
  }

  const join = async () => {
    if (!issue) return
    const call = ++calls.current
    setStatus('joining')
    setError(null)
    try {
      connection.current = await openRoom(issue, {
        onChange: refresh,
        onStatus: (s) => {
          if (call !== calls.current) return
          if (s === 'ended') outOfCall(true)
          else setStatus(s)
        },
      })
      setStatus('live')
      refresh()
      if (micOnArrival()) await arrive()
    } catch (err: unknown) {
      connection.current = null
      setStatus('failed')
      setError(joinMessage(err))
    }
  }

  const leave = async () => {
    calls.current += 1
    await connection.current?.leave()
    outOfCall(false)
  }

  const startAudio = async () => {
    await connection.current?.startAudio()
  }

  return { status, error, ...people, ...devices, startAudio, join, leave }
}
