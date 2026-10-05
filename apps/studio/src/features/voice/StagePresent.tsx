// What the room shows to everyone, on this stage (docs/plans/room-present.md): the report presented where a shared
// screen goes, when I follow it or show it myself, or a card that says who shows what, with Follow. Following is this
// device's choice (01:41) and ends when nothing is shown. «Show everyone» is offered only under the vision flag.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { VISION } from '../../app/vision.ts'
import { focusChat, markShownHere } from './focus-arrival.ts'
import { PresentedReport } from './PresentedReport.tsx'
import { follows, presenting, showingWords, shownOf, showOffered, type Followed, type Shown } from './present-view.ts'
import { shortName } from './room-view.ts'
import { FocusButton, type FocusTarget, type ShowRender } from './ShowEveryone.tsx'
import type { ProjectRoom } from './useProjectRoom.ts'

type Room = Pick<ProjectRoom, 'status' | 'participants' | 'feeds'>

interface Context {
  projectId: string
  identity: Identity
  /** My actor id: the focus is mine when I guide it. */
  me: string
  names: ReadonlyMap<string, string>
}

/** Where the room's focus is written, once the snapshot is read. */
const targetOf = (snapshot: Snapshot | undefined, projectId: string, identity: Identity): FocusTarget | null =>
  snapshot ? { projectId, identity, roomId: snapshot.room.id, revision: snapshot.room.revision } : null

/** «Show everyone» where it may be offered (showOffered), for the pane's head and the made object's card. */
export function showRenderOf(
  snapshot: Snapshot | undefined,
  room: Pick<ProjectRoom, 'status' | 'participants'>,
  at: { projectId: string; identity: Identity },
): ShowRender | undefined {
  const target = targetOf(snapshot, at.projectId, at.identity)
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  const guest = room.participants.some((p) => p.local && p.standing === 'guest')
  if (!target || !showOffered({ vision: VISION, inCall, guest })) return undefined
  return (versionId, onShown) => (
    <FocusButton
      {...target}
      versionId={versionId}
      label="Show everyone"
      onShown={() => {
        markShownHere()
        onShown()
      }}
    />
  )
}

interface CardProps {
  words: string
  action: ReactNode
  /** I just stopped following: the focus goes to Follow, once. */
  focused: boolean
  onFocused: () => void
}

/** Who shows what, with its one control: Follow, or Stop showing for my own. */
function ShowingCard({ words, action, focused, onFocused }: CardProps) {
  const self = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focused) return
    self.current?.querySelector('button')?.focus({ preventScroll: true })
    onFocused()
  }, [focused, onFocused])
  return (
    <div ref={self} className="stage-showing" role="group" aria-label="Shown to everyone">
      <span className="showing-words">{words}</span>
      {action}
    </div>
  )
}

/**
 * Following is this device's, and of one thing: that version as that member shows it (follows). It begins with Follow
 * and ends with Stop following, or when something else, or nothing, is shown. Stopped, the focus goes to Follow.
 */
function useFollowing(shown: Shown | null) {
  const [followed, setFollowed] = useState<Followed | null>(null)
  const [stopped, setStopped] = useState(false)
  if (!shown && (followed || stopped)) {
    setFollowed(null)
    setStopped(false)
  }
  const focused = useCallback(() => setStopped(false), [])
  return {
    following: follows(followed, shown),
    stopped,
    focused,
    follow: () => {
      setStopped(false)
      if (shown?.version) setFollowed({ revision: shown.revision, versionId: shown.version.id })
    },
    unfollow: () => {
      setFollowed(null)
      setStopped(true)
    },
  }
}

/** The presented report for the stage (or null), and the card for the stage (or null). */
export function useStagePresent(snapshot: Snapshot | undefined, room: Room, context: Context) {
  const { projectId, identity, me, names } = context
  const shown = shownOf(snapshot?.sharedFocus, snapshot?.artifacts, me)
  const { following, stopped, focused, follow, unfollow } = useFollowing(shown)
  const screen = room.feeds.some((f) => f.source === 'screen')
  const target = targetOf(snapshot, projectId, identity)
  if (!shown) return { presented: null, card: null }
  const guide = shown.mine ? 'you' : shortName(names.get(shown.guideId) ?? 'A member')
  // Mine, I can always stop it: on the stage, or on my card when the stage can't present it.
  // Stopped, what holds the button leaves the stage: the focus goes to Chat, which stays.
  const stop =
    shown.mine && target ? <FocusButton {...target} versionId={null} label="Stop showing" onShown={focusChat} /> : null
  if (presenting(shown, { following, screen }) && shown.version) {
    const unfollowing = (
      <button type="button" className="pill" onClick={unfollow}>
        Stop following
      </button>
    )
    return {
      presented: (
        <PresentedReport version={shown.version} identity={identity} by={guide} action={stop ?? unfollowing} />
      ),
      card: null,
    }
  }
  return { presented: null, card: cardOf(shown, guide, { screen, stopped, focused, follow, stop }) }
}

/** The card: mine with Stop showing; another's with Follow, when the stage can present it. */
function cardOf(
  shown: Shown,
  guide: string,
  at: { screen: boolean; stopped: boolean; focused: () => void; follow: () => void; stop: ReactNode },
): ReactNode {
  const followable = shown.version && !at.screen
  const action = shown.mine ? (
    at.stop
  ) : followable ? (
    <button type="button" className="pill" onClick={at.follow}>
      Follow
    </button>
  ) : null
  const words = showingWords(guide, shown.version, shown.mine)
  return <ShowingCard words={words} action={action} focused={at.stopped} onFocused={at.focused} />
}
