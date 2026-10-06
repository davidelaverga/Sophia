// What the room shows to everyone, on this stage (docs/plans/room-present.md): the report presented where a shared
// screen goes, when I follow it or show it myself, or a card that says who shows what, with Follow. Following is this
// device's choice (01:41) and ends when nothing is shown. «Show everyone» is offered only under the vision flag.
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { getRoomFocus, type RoomFocus } from '../../api/vision.ts'
import { VISION } from '../../app/vision.ts'
import { focusChat, forgetShownHere, markShownHere } from './focus-arrival.ts'
import { PresentedReport } from './PresentedReport.tsx'
import {
  carriesOver,
  follows,
  mayCarry,
  presenting,
  showingWords,
  shownOf,
  showOffered,
  type FocusAt,
  type Followed,
  type Shown,
} from './present-view.ts'
import { shortName } from './room-view.ts'
import { FocusButton, type FocusTarget, type ShowRender } from './ShowEveryone.tsx'
import type { ProjectRoom } from './useProjectRoom.ts'

type Room = Pick<ProjectRoom, 'status' | 'participants' | 'feeds' | 'setFollowing' | 'call'>

interface Context {
  projectId: string
  identity: Identity
  /** My actor id: the focus is mine when I guide it. */
  me: string
  names: ReadonlyMap<string, string>
  /** What Sophia is saying now (latestSpoken): the report on the stage lights it. */
  spoken: string | null
  /** The project is kept out of sight (home, Personal), the call still on: nothing on its stage is followed. */
  background?: boolean
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
      onPress={() => markShownHere(versionId)}
      onShown={onShown}
      onRefused={() => forgetShownHere(versionId)}
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
  // Only under the vision flag, where the focus read can settle it; without it, any change asks again (#110).
  const may = VISION && mayCarry(followed, shown)
  // Something else shown (another report, another member): what I chose is over, and nothing re-arms it.
  if (followed && shown && !follows(followed, shown) && !may) setFollowed(null)
  const focused = useCallback(() => setStopped(false), [])
  return {
    // The focus moved on within what I follow: followed still until its read says otherwise, so the report doesn't
    // leave the stage for a round trip, nor for a read that failed.
    following: follows(followed, shown) || may,
    /** The focus moved on within what I follow: the read says whether it was Sophia walking it. */
    mayCarry: may,
    /** The read for the focus as it is now: Sophia's walk carries following over; anything else ends it. */
    carry: (at: FocusAt | undefined) => {
      if (!followed || !shown || !may || at?.revision !== shown.revision) return
      setFollowed(carriesOver(followed, shown, at) ? { ...followed, revision: shown.revision } : null)
    },
    stopped,
    focused,
    follow: () => {
      setStopped(false)
      if (shown?.version) setFollowed({ revision: shown.revision, versionId: shown.version.id, guideId: shown.guideId })
    },
    unfollow: () => {
      setFollowed(null)
      setStopped(true)
    },
  }
}

/**
 * The room's focus as A14's proposed read has it (with its section, and who put it there), read again as it moves;
 * only while the shown report is on this stage, or may still be (the focus moved within what I follow), so whoever
 * doesn't follow it sees nothing move and reads nothing. Only under the vision flag.
 */
function useFocusAt(snapshot: Snapshot | undefined, wanted: boolean, identity: Identity) {
  const focus = snapshot?.sharedFocus
  const roomId = snapshot?.room.id
  return useQuery({
    queryKey: ['vision', 'room-focus', identity.name, roomId, focus?.revision],
    queryFn: ({ signal }) => getRoomFocus(identity.token, roomId ?? '', signal),
    enabled: VISION && wanted && roomId !== undefined && focus !== null && focus !== undefined,
    staleTime: Infinity,
    retry: 1,
  }).data
}

/** Where Sophia walked the shown report (A14): the focus as it is now, hers, on the version shown. */
function walkOf(at: RoomFocus | undefined, focus: Snapshot['sharedFocus'] | undefined) {
  const hers =
    at?.by === 'sophia' && at.revision === focus?.revision && at.artifactVersionId === focus.artifactVersionId
  return hers && at.anchor ? { anchor: at.anchor, revision: at.revision } : null
}

/**
 * What this person follows, said to the members in the call (A14's «N following», following-signal.ts): the version
 * while they follow it, nothing otherwise. Said again on each call joined. Only under the vision flag.
 */
function useSayFollowing(room: Room, shown: Shown | null, following: boolean) {
  const followed = following && shown ? (shown.version?.id ?? null) : null
  const { setFollowing, call } = room
  const live = room.status === 'live'
  useEffect(() => {
    if (VISION && live) void setFollowing(followed)
  }, [setFollowing, followed, live, call])
  // The stage going (another view, the call still on) is following nothing: never counted for what isn't in sight.
  useEffect(
    () => () => {
      if (VISION) void setFollowing(null)
    },
    [setFollowing],
  )
}

/** How many others in the call said they follow the version shown. */
const followersOf = (room: Room, versionId: string) =>
  room.participants.filter((p) => !p.local && p.following === versionId).length

/** Where Sophia walked what is on this stage (A14), carrying following over her moves. */
function useWalked(
  snapshot: Snapshot | undefined,
  on: { shown: Shown | null; screen: boolean; followed: ReturnType<typeof useFollowing> },
  identity: Identity,
) {
  const { shown, screen, followed } = on
  const at = useFocusAt(snapshot, onStageOf(shown, followed.following, screen) || followed.mayCarry, identity)
  followed.carry(at)
  return walkOf(at, snapshot?.sharedFocus)
}

/** Whether the shown report is on this stage: shown from here, or followed, and no screen shared over it. */
const onStageOf = (shown: Shown | null, following: boolean, screen: boolean) =>
  shown !== null && shown.version !== null && presenting(shown, { following, screen })

/** The presented report for the stage (or null), and the card for the stage (or null). */
export function useStagePresent(snapshot: Snapshot | undefined, room: Room, context: Context) {
  const { projectId, identity, me, names, spoken } = context
  const shown = shownOf(snapshot?.sharedFocus, snapshot?.artifacts, me)
  const followed = useFollowing(shown)
  const { following, stopped, focused, follow, unfollow } = followed
  const screen = room.feeds.some((f) => f.source === 'screen')
  const target = targetOf(snapshot, projectId, identity)
  const walk = useWalked(snapshot, { shown, screen, followed }, identity)
  useSayFollowing(room, shown, following && !context.background)
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
    const on = { version: shown.version, identity, by: guide, action: stop ?? unfollowing, spoken, walk }
    return { presented: presentedOf(on, room, shown.mine), card: null }
  }
  return { presented: null, card: cardOf(shown, guide, { screen, stopped, focused, follow, stop }) }
}

/** The report on the stage; to whoever shows it, how many others follow it (A14, the vision flag's). */
function presentedOf(on: Omit<ComponentProps<typeof PresentedReport>, 'followers'>, room: Room, mine: boolean) {
  return <PresentedReport {...on} followers={VISION && mine ? followersOf(room, on.version.id) : 0} />
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
