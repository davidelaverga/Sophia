// An admitted guest in the room: the same stage as the members' (the light, the people, video), with only
// what a guest can do: microphone, camera, screen and leave. No lens, no floor, no project records.
import { useEffect, useRef, useState } from 'react'
import type { LobbyEntry } from '@sophia/contracts'
import { getLobbyEntry, issueGuestRoomToken } from '../../api/access.ts'
import { endGuestSession } from '../../app/auth.ts'
import { Centered } from '../../app/SignIn.tsx'
import { RoomStage } from '../voice/RoomStage.tsx'
import { useRoomConnection } from '../voice/useProjectRoom.ts'

interface Props {
  accessToken: string
  entry: LobbyEntry
  projectTitle: string
}

/**
 * A call that ends without the guest leaving may mean the room took them out: ask the lobby, and if their
 * entry was denied, say so instead of offering a door that will not open.
 */
function useRemoved(live: boolean, accessToken: string, entryId: string, leaving: boolean): boolean {
  const [removed, setRemoved] = useState(false)
  const wasLive = useRef(false)
  useEffect(() => {
    if (live) wasLive.current = true
    if (live || !wasLive.current || leaving) return
    wasLive.current = false
    void getLobbyEntry(accessToken, entryId)
      .then((e) => setRemoved(e.status === 'denied'))
      .catch(() => undefined) // unknown: the Join button stays, and the API explains a refusal
  }, [live, accessToken, entryId, leaving])
  return removed
}

export function GuestRoom({ accessToken, entry, projectTitle }: Props) {
  const room = useRoomConnection(() => issueGuestRoomToken(accessToken, entry.id))
  const live = room.status === 'live' || room.status === 'reconnecting'
  const [leaving, setLeaving] = useState(false)
  const removed = useRemoved(live, accessToken, entry.id, leaving)
  const leave = async () => {
    setLeaving(true)
    await room.leave()
    await endGuestSession()
  }
  if (removed) {
    return (
      <Centered title="Your visit has ended">
        <p>Someone in “{projectTitle}” closed your place in the room. You can ask whoever invited you.</p>
      </Centered>
    )
  }
  return (
    <div className="shell" data-view="studio">
      <header className="topbar">
        <span className="mark">
          <span className="mark-dot" data-live={live || undefined} aria-hidden />
          <span className="mark-word">Sophia</span>
        </span>
        <h1 className="project-name">{projectTitle}</h1>
        <span className="topbar-end guest-tag">Guest · {entry.displayName}</span>
      </header>
      <RoomStage
        room={{ ...room, leave }}
        snapshot={undefined}
        projectId=""
        identity={{ name: entry.displayName, role: 'guest', token: accessToken }}
        lensBar={null}
        lensBody={null}
        line={{
          text: live ? 'You’re in the room' : 'You’re let in',
          note: live ? 'Sophia’s voice arrives with S1-05. Today the room carries yours.' : 'Join when you’re ready.',
        }}
      />
    </div>
  )
}
