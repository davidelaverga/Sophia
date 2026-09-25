// An admitted guest in the room: the same stage as the members' (the light, the people, video), with only
// what a guest can do: microphone, camera, screen and leave. No lens, no floor, no project records.
import { useEffect, useRef, useState } from 'react'
import type { LobbyEntry } from '@sophia/contracts'
import { getLobbyEntry, issueGuestRoomToken } from '../../api/access.ts'
import { currentToken, endGuestSession } from '../../app/auth.ts'
import { useDocumentTitle } from '../../app/document-title.ts'
import { Centered, HomeLink } from '../../app/SignIn.tsx'
import { VOICE_NOTE } from '../voice/room-view.ts'
import { RoomStage } from '../voice/RoomStage.tsx'
import { useRoomConnection } from '../voice/useProjectRoom.ts'

interface Props {
  accessToken: string
  entry: LobbyEntry
  projectTitle: string
  /** No account: the visit is an anonymous session, which ends with it. */
  anonymous: boolean
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
    void currentToken(accessToken)
      .then((token) => getLobbyEntry(token, entryId))
      .then((e) => setRemoved(e.status === 'denied'))
      .catch(() => undefined) // unknown: the Join button stays, and the API explains a refusal
  }, [live, accessToken, entryId, leaving])
  return removed
}

/**
 * The end of a visit. A guest without an account has nowhere else in Sophia to go (the member home would
 * refuse them), so their anonymous session ends and the page says the tab can close.
 */
export function VisitEnd({ title, body, anonymous }: { title: string; body: string; anonymous: boolean }) {
  useEffect(() => {
    if (anonymous) void endGuestSession()
  }, [anonymous])
  return (
    <Centered title={title}>
      <p>{body}</p>
      {anonymous ? <p className="muted">You can close this tab.</p> : <HomeLink />}
    </Centered>
  )
}

/** The tab changes the moment a guest is let in, names the project once they are in, and lets go at the end. */
function guestTitle(projectTitle: string, live: boolean, ended: boolean): string | null {
  if (ended) return null
  return live ? `${projectTitle} · Sophia` : 'You’re let in · Sophia'
}

export function GuestRoom({ accessToken, entry, projectTitle, anonymous }: Props) {
  // Each join asks with the session's current token: an admitted guest may join long after knocking.
  const room = useRoomConnection(async () => issueGuestRoomToken(await currentToken(accessToken), entry.id))
  const live = room.status === 'live' || room.status === 'reconnecting'
  const [leaving, setLeaving] = useState(false)
  const [left, setLeft] = useState(false)
  const removed = useRemoved(live, accessToken, entry.id, leaving)
  useDocumentTitle(guestTitle(projectTitle, live, left || removed))
  const leave = async () => {
    setLeaving(true)
    await room.leave()
    setLeft(true)
  }
  if (removed) {
    return (
      <VisitEnd
        title="Your visit has ended"
        body={`Someone in “${projectTitle}” closed your place in the room. If that seems wrong, ask whoever invited you.`}
        anonymous={anonymous}
      />
    )
  }
  if (left) {
    return (
      <VisitEnd title="You left the room" body="To come back, open the invitation link again." anonymous={anonymous} />
    )
  }
  return (
    <div className="shell" data-view="studio">
      <header className="topbar">
        <span className="mark">
          <span className="mark-dot" data-live={live || undefined} aria-hidden />
          <span className="mark-word">Sophia</span>
        </span>
        <span className="crumb-sep" aria-hidden>
          /
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
          text: live ? 'You’re in the room' : 'You’ve been let in',
          note: live ? VOICE_NOTE : 'Your microphone turns on when you join.',
        }}
      />
    </div>
  )
}
