// The room's state for the Studio: join (token from the API, then LiveKit), microphone, camera, screen,
// leave. Leaving the page leaves the room; nothing here touches goals or work.
import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { issueRoomToken } from '../../api/client.ts'
import type { RoomCallbacks, RoomConnection, VideoFeed } from './livekit-room.ts'
import type { DockStatus, RoomParticipant } from './room-view.ts'

export type { VideoFeed } from './livekit-room.ts'

export interface ProjectRoom {
  status: DockStatus
  error: string | null
  /** Why a microphone, camera or screen did not start, in words a person can act on. */
  mediaError: string | null
  participants: RoomParticipant[]
  feeds: VideoFeed[]
  join: () => Promise<void>
  leave: () => Promise<void>
  setMicrophone: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
}

type Device = 'microphone' | 'camera' | 'screen'

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/** Null when there is nothing to say: cancelling the screen picker is a choice, not an error. */
function mediaMessage(err: unknown, device: Device): string | null {
  const name = err instanceof Error ? err.name : ''
  if (device === 'screen') {
    return name === 'NotAllowedError' || name === 'AbortError' ? null : message(err, 'Screen sharing could not start.')
  }
  const listen = device === 'microphone' ? ' You can still listen.' : ''
  if (name === 'NotAllowedError') return `Your browser blocked the ${device}.${listen} Allow it and try again.`
  if (name === 'NotFoundError') return `No ${device} found.${listen}`
  return message(err, `The ${device} could not start.${listen}`)
}

interface People {
  participants: RoomParticipant[]
  feeds: VideoFeed[]
}
const NOBODY: People = { participants: [], feeds: [] }
const MEDIA_NOTE_MS = 8000

/** A token for this project's room from the API, then LiveKit, which loads only now: it is most of the Studio's weight. */
async function openRoom(token: string, projectId: string, snapshot: Snapshot, cb: RoomCallbacks) {
  const req = { roomId: snapshot.room.id, expectedAudienceRevision: snapshot.audienceRevision }
  const issued = await issueRoomToken(token, projectId, crypto.randomUUID(), req)
  const { connectRoom } = await import('./livekit-room.ts')
  return connectRoom(issued.serverUrl, issued.token, cb)
}

/** A media note is read once, then steps aside; the toggle still shows the device is off. */
function useMediaNote(): [string | null, (note: string | null) => void] {
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    if (!note) return undefined
    const t = setTimeout(() => setNote(null), MEDIA_NOTE_MS)
    return () => clearTimeout(t)
  }, [note])
  return [note, setNote]
}

export function useProjectRoom(projectId: string, token: string, snapshot: Snapshot | undefined): ProjectRoom {
  const connection = useRef<RoomConnection | null>(null)
  const [status, setStatus] = useState<DockStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [mediaError, setMediaError] = useMediaNote()
  const [people, setPeople] = useState<People>(NOBODY)

  useEffect(() => () => void connection.current?.leave(), [])

  const refresh = () =>
    setPeople({ participants: connection.current?.participants() ?? [], feeds: connection.current?.feeds() ?? [] })

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

  const join = async () => {
    if (!snapshot) return
    setStatus('joining')
    setError(null)
    try {
      connection.current = await openRoom(token, projectId, snapshot, {
        onChange: refresh,
        onStatus: (s) => setStatus(s === 'ended' ? 'idle' : s),
      })
      setStatus('live')
      refresh()
      await media('microphone', (c) => c.setMicrophone(true))()
    } catch (err: unknown) {
      connection.current = null
      setStatus('failed')
      setError(message(err, 'Could not join the room.'))
    }
  }

  const leave = async () => {
    await connection.current?.leave()
    connection.current = null
    setPeople(NOBODY)
    setMediaError(null)
    setStatus('idle')
  }

  return {
    status,
    error,
    mediaError,
    ...people,
    join,
    leave,
    setMicrophone: (on) => media('microphone', (c) => c.setMicrophone(on))(),
    setCamera: (on) => media('camera', (c) => c.setCamera(on))(),
    setScreenShare: (on) => media('screen', (c) => c.setScreenShare(on))(),
  }
}
