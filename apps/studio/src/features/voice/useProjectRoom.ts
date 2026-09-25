// The dock's room state: join (token from the API, then LiveKit), microphone, leave. Leaving the page
// leaves the room; nothing here touches goals or work.
import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { issueRoomToken } from '../../api/client.ts'
import type { RoomConnection } from './livekit-room.ts'
import type { RoomParticipant } from './room-view.ts'

export type DockStatus = 'idle' | 'joining' | 'live' | 'reconnecting' | 'failed'

export interface ProjectRoom {
  status: DockStatus
  error: string | null
  /** Set when the microphone could not start (blocked, missing, or a viewer): you can still listen. */
  micError: string | null
  participants: RoomParticipant[]
  join: () => Promise<void>
  leave: () => Promise<void>
  setMicrophone: (on: boolean) => Promise<void>
}

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/** Why the microphone did not start, in words a person can act on. Listening still works. */
function micMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError')
    return 'Your browser blocked the microphone. You can still listen; allow it and unmute.'
  if (name === 'NotFoundError') return 'No microphone found. You can still listen.'
  return message(err, 'The microphone could not start. You can still listen.')
}

export function useProjectRoom(projectId: string, token: string, snapshot: Snapshot | undefined): ProjectRoom {
  const connection = useRef<RoomConnection | null>(null)
  const [status, setStatus] = useState<DockStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<RoomParticipant[]>([])

  useEffect(() => () => void connection.current?.leave(), [])

  const refresh = () => setParticipants(connection.current?.participants() ?? [])

  const setMicrophone = async (on: boolean) => {
    try {
      await connection.current?.setMicrophone(on)
      setMicError(null)
    } catch (err: unknown) {
      setMicError(micMessage(err))
    }
  }

  const join = async () => {
    if (!snapshot) return
    setStatus('joining')
    setError(null)
    try {
      const req = { roomId: snapshot.room.id, expectedAudienceRevision: snapshot.audienceRevision }
      const issued = await issueRoomToken(token, projectId, crypto.randomUUID(), req)
      // LiveKit loads only when someone joins: it is most of the Studio's weight.
      const { connectRoom } = await import('./livekit-room.ts')
      connection.current = await connectRoom(issued.serverUrl, issued.token, {
        onChange: refresh,
        onStatus: (s) => setStatus(s === 'ended' ? 'idle' : s),
      })
      setStatus('live')
      refresh()
      await setMicrophone(true)
    } catch (err: unknown) {
      connection.current = null
      setStatus('failed')
      setError(message(err, 'Could not join the room.'))
    }
  }

  const leave = async () => {
    await connection.current?.leave()
    connection.current = null
    setParticipants([])
    setStatus('idle')
  }

  return { status, error, micError, participants, join, leave, setMicrophone }
}
