// Video in the room: a shared screen takes the stage with the tiles beside it; cameras alone make a gallery. Sophia
// keeps a tile of her own: it is transparent, and her light shines in it from behind. A report shown to everyone takes
// the shared screen's place (PresentedReport, docs/plans/room-present.md). Past a few people the tiles stop, and «+N»
// opens everyone in the call (tile-view.ts, docs/plans/room-tiles-overflow.md).
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import type { VideoFeed } from './livekit-room.ts'
import { Sheet } from '../../app/Sheet.tsx'
import {
  mutedMic,
  presenceRole,
  screenCaption,
  showScreenLabel,
  shortName,
  type FloorView,
  type RoomParticipant,
  type StageMode,
} from './room-view.ts'
import { arrivalOrder, peopleTiles, tilesFor } from './tile-view.ts'
import { TileMenu } from './TileMenu.tsx'
import { useMirror } from './mirror-preference.ts'

function VideoView({ feed, fit }: { feed: VideoFeed; fit: 'cover' | 'contain' }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = video.current
    if (!el) return undefined
    feed.attach(el)
    return () => feed.detach(el)
  }, [feed])
  // Your own camera is mirrored, as in a mirror, unless you said otherwise here (room-basics.md); a screen never is.
  const mirror = useMirror().on
  const mirrored = feed.local && feed.source === 'camera' && mirror
  return <video ref={video} className={`video ${fit}${mirrored ? ' mirrored' : ''}`} autoPlay playsInline muted />
}

interface TileProps {
  person: RoomParticipant
  camera: VideoFeed | undefined
  holds: boolean
  /** Pin this person (the gallery's tiles): they take the stage for this viewer alone. */
  onPin?: (() => void) | undefined
  /** Your own tile: hide it from your own gallery, for this call (room-basics.md). */
  onHide?: (() => void) | undefined
  /** Your own tile, on a phone with two cameras: switch to the next (camera-flip.md). */
  onFlip?: (() => void) | null | undefined
}

/**
 * A round press at a tile's corner, shown under the pointer or the focus: Pin on others', Hide on yours; Switch camera on
 * yours too, at the other corner (`left`).
 */
function TileAct(props: { label: string; icon: 'expand' | 'eyeOff' | 'flip'; onPress: () => void; left?: boolean }) {
  const { label, icon, onPress, left = false } = props
  return (
    <button
      type="button"
      className={`round tile-pin has-tip${left ? ' tile-flip' : ''}`}
      aria-label={label}
      onClick={onPress}
    >
      <Icon name={icon} />
      <Tip label={label} align={left ? 'start' : 'end'} />
    </button>
  )
}

/**
 * A tile's presses: Pin on others', Hide my tile and Switch camera on yours. A phone's strip holds one press a tile
 * (theme.css): with both of yours, the press that opens them as a menu (TileMenu, Luis 2026-10-18).
 */
function TilePresses({
  name,
  onPin,
  onHide,
  onFlip,
}: Pick<TileProps, 'onPin' | 'onHide' | 'onFlip'> & { name: string }) {
  return (
    <>
      {onHide ? (
        <TileAct label="Hide my tile" icon="eyeOff" onPress={onHide} />
      ) : (
        onPin && <TileAct label={`Pin ${name}`} icon="expand" onPress={onPin} />
      )}
      {onFlip && <TileAct label="Switch camera" icon="flip" onPress={onFlip} left />}
      {onHide && onFlip && <TileMenu onFlip={onFlip} onHide={onHide} />}
    </>
  )
}

/** Where your tile was, hidden for this call: it says so, and «Show» brings it back (room-basics.md). */
function HiddenSelf({ onShow }: { onShow: () => void }) {
  return (
    <li className="tile tile-hidden-self">
      {/* In a fifth of a phone the words give way to an eye struck through; a screen reader still hears them. */}
      <Icon name="eyeOff" size={14} />
      <span className="tile-hidden-words">Your tile is hidden</span>
      <button type="button" className="text-button" onClick={onShow}>
        Show
      </button>
    </li>
  )
}

/**
 * Full screen for the stage's main view (room-pin-fullscreen.md): a shared screen or a person pinned. Esc leaves it as
 * the browser's own does; where the browser has none it isn't offered.
 */
function FullScreen({ target }: { target: RefObject<HTMLElement | null> }) {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const said = () => setFull(target.current !== null && document.fullscreenElement === target.current)
    document.addEventListener('fullscreenchange', said)
    return () => document.removeEventListener('fullscreenchange', said)
  }, [target])
  if (!document.fullscreenEnabled) return null
  const label = full ? 'Exit full screen' : 'Full screen'
  return (
    <button
      type="button"
      className="round has-tip"
      aria-label={label}
      onClick={() => void (full ? document.exitFullscreen() : target.current?.requestFullscreen())}
    >
      <Icon name={full ? 'collapse' : 'expand'} />
      <Tip label={label} align="end" />
    </button>
  )
}

/** A person pinned, on the stage: their camera or their initial, their name, Unpin and full screen. */
function Spotlight(props: { person: RoomParticipant; camera: VideoFeed | undefined; onUnpin: () => void }) {
  const { person, camera, onUnpin } = props
  const figure = useRef<HTMLElement>(null)
  const name = shortName(person.name)
  return (
    <figure ref={figure} className="screen-main spotlight-main">
      {camera ? (
        <VideoView feed={camera} fit="contain" />
      ) : (
        <span className="tile-initial spotlight-initial">{name.charAt(0)}</span>
      )}
      <figcaption>{person.local ? `${name} · you` : name}</figcaption>
      <span className="stage-acts">
        <button type="button" className="round has-tip" aria-label={`Unpin ${name}`} onClick={onUnpin}>
          <Icon name="close" />
          <Tip label={`Unpin ${name}`} align="end" />
        </button>
        <FullScreen target={figure} />
      </span>
    </figure>
  )
}

/** The other screens shared, each a press that puts it on the stage, for this viewer (two-screens.md). */
function AlsoSharing(props: {
  others: readonly VideoFeed[]
  people: readonly RoomParticipant[]
  onShow: (id: string) => void
}) {
  if (props.others.length === 0) return null
  return (
    <span className="screen-also" role="group" aria-label="Also sharing">
      {props.others.map((s) => (
        <button
          key={s.identity}
          type="button"
          className="text-button"
          onClick={(e) => {
            // The press goes with the screen it showed: the focus stays in the offer (Codex P2 on #358).
            const group = e.currentTarget.parentElement
            props.onShow(s.identity)
            requestAnimationFrame(() => group?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }))
          }}
        >
          {showScreenLabel(props.people.find((p) => p.identity === s.identity))}
        </button>
      ))}
    </span>
  )
}

/** A shared screen, on the stage, with full screen; and the others shared, a press away. */
function SharedScreen({ feed, caption, also }: { feed: VideoFeed; caption: string; also: React.ReactNode }) {
  const figure = useRef<HTMLElement>(null)
  return (
    <figure ref={figure} className="screen-main">
      <VideoView feed={feed} fit="contain" />
      <figcaption>
        {caption}
        {also}
      </figcaption>
      <span className="stage-acts">
        <FullScreen target={figure} />
      </span>
    </figure>
  )
}

/** What sets someone apart, after their name: « · you», « · guest», « · floor» (on a phone, theme.css). */
function TileMark({ mark }: { mark: 'you' | 'guest' | 'floor' }) {
  return (
    <span className={mark === 'floor' ? 'tile-floor' : 'tile-mark'} data-mark={mark}>
      <span className="tile-sep">{' · '}</span>
      {mark}
    </span>
  )
}

function PersonTile({ person, camera, holds, onPin, onHide, onFlip }: TileProps) {
  return (
    <li
      className="tile"
      data-actor={person.identity}
      data-floor={holds || undefined}
      data-speaking={person.speaking || undefined}
    >
      {camera ? (
        <VideoView feed={camera} fit="cover" />
      ) : (
        <span className="tile-initial">{shortName(person.name).charAt(0)}</span>
      )}
      {/* The name, then what sets them apart: on a short tile the name is cut, never what follows it. */}
      <span className="tile-name" data-anchor>
        <span className="tile-who">{shortName(person.name)}</span>
        {person.local && <TileMark mark="you" />}
        {person.standing === 'guest' && <TileMark mark="guest" />}
        {holds && <TileMark mark="floor" />}
        {/* First in the chip, as Meet's (order in theme.css); heard after the name and its marks. */}
        {mutedMic(person) && (
          <span className="tile-muted">
            <Icon name="micOff" size={12} />
            <span className="sr-only">muted</span>
          </span>
        )}
      </span>
      {/* On a phone's strip the chip has no room for it: the mute shows in the tile's corner (theme.css). */}
      {mutedMic(person) && (
        <span className="tile-muted-corner" aria-hidden>
          <Icon name="micOff" size={10} />
        </span>
      )}
      <TilePresses name={shortName(person.name)} onPin={onPin} onHide={onHide} onFlip={onFlip} />
    </li>
  )
}

interface Props {
  mode: Exclude<StageMode, 'light'>
  people: RoomParticipant[]
  feeds: VideoFeed[]
  floor: FloorView
  /** A report shown to everyone, where a shared screen goes when none is shared. */
  shown?: ReactNode
  /** Your camera's switch, on a phone with two (camera-flip.md): on your own tile. */
  flip?: (() => void) | null
}

/**
 * The screens shared and the one on the stage (two-screens.md): the newest, as this browser saw them begin, unless this
 * viewer chose another that still shares.
 */
function useScreenChoice(feeds: readonly VideoFeed[]) {
  const screens = feeds.filter((f) => f.source === 'screen')
  const ids = screens.map((s) => s.identity)
  const [seen, setSeen] = useState<readonly string[]>([])
  const order = [...seen.filter((id) => ids.includes(id)), ...ids.filter((id) => !seen.includes(id))]
  // Stamped in the render that sees the change, as the tiles' order is (useSpokeAt).
  if (order.join(' ') !== seen.join(' ')) setSeen(order)
  const [chosen, choose] = useState<string | null>(null)
  const shownId = chosen !== null && ids.includes(chosen) ? chosen : order.at(-1)
  const screen = screens.find((s) => s.identity === shownId)
  return { screen, others: screens.filter((s) => s !== screen), choose }
}

/**
 * Your tile hidden from your own gallery, for this call (room-basics.md): the people with a tile, and the presses that
 * hide it and bring it back. Hidden, the focus waits on «Show», where the press was.
 */
function useSelfHidden(people: RoomParticipant[]) {
  const [hidden, setHidden] = useState(false)
  const hide = () => {
    setHidden(true)
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.tile-hidden-self button')?.focus())
  }
  return { hidden, tiled: hidden ? people.filter((p) => !p.local) : people, hide, show: () => setHidden(false) }
}

/** Sophia's tile, then the people kept, yours or where it was, then «+N». */
function Tiles(props: {
  kept: readonly RoomParticipant[]
  cameraOf: (identity: string) => VideoFeed | undefined
  floor: FloorView
  onPin: ((identity: string) => void) | undefined
  self: { hidden: boolean; hide: () => void; show: () => void }
  /** Your camera's switch, on a phone with two (camera-flip.md); null otherwise. */
  flip: (() => void) | null | undefined
  more: number
  onMore: () => void
}) {
  const { onPin, self } = props
  return (
    <>
      <li className="tile sophia-tile" data-sophia-tile>
        <span className="tile-name">Sophia</span>
      </li>
      {props.kept.map((p) => (
        <PersonTile
          key={p.identity}
          person={p}
          camera={props.cameraOf(p.identity)}
          holds={props.floor.holder?.identity === p.identity}
          onPin={onPin && (() => onPin(p.identity))}
          onHide={p.local ? self.hide : undefined}
          onFlip={p.local ? props.flip : undefined}
        />
      ))}
      {self.hidden && <HiddenSelf onShow={self.show} />}
      {props.more > 0 && <MoreTile count={props.more} onOpen={props.onMore} />}
    </>
  )
}

export function VideoStage({ mode, people: everyoneHere, feeds, floor, shown, flip }: Props) {
  const { tiled: people, ...self } = useSelfHidden(everyoneHere)
  const { screen, others, choose } = useScreenChoice(feeds)
  const cameraOf = (identity: string) => feeds.find((f) => f.identity === identity && f.source === 'camera')
  const present = mode === 'present' && (screen !== undefined || shown !== undefined)
  const [pinned, setPinned] = usePin(people, present)
  const stage = {
    floor,
    showing: screen?.identity ?? null,
    arrived: arrivalOrder(everyoneHere),
    pinned: pinned?.identity,
  }
  const strip = present || pinned !== undefined
  const { kept, more, count } = useKeptTiles(
    people.filter((p) => p !== pinned),
    stage,
    strip,
    self.hidden,
  )
  const everyone = useEveryone(everyoneHere, floor, { kept, flip })
  const tiles = (
    <Tiles
      kept={kept}
      cameraOf={cameraOf}
      floor={floor}
      onPin={present ? undefined : setPinned}
      self={self}
      flip={flip}
      more={more.length}
      onMore={everyone.show}
    />
  )
  if (!strip) {
    return (
      <ul className="gallery" data-count={count} aria-label="In the room">
        {tiles}
        {everyone.sheet}
      </ul>
    )
  }
  return (
    <div className={pinned ? 'present spotlight' : 'present'}>
      <StageMain
        pinned={pinned}
        cameraOf={cameraOf}
        onUnpin={() => setPinned(null)}
        screen={screen}
        people={everyoneHere}
        shown={shown}
        also={<AlsoSharing others={others} people={everyoneHere} onShow={choose} />}
      />
      <ul className="tile-strip" aria-label="In the room">
        {tiles}
      </ul>
      {everyone.sheet}
    </div>
  )
}

/**
 * «In the call», which «+N» opens: held here, not in «+N», as the tiles move between the strip and the gallery and the
 * sheet stays open across. Your camera's switch goes with your tile: off the stage (in «+N», or hidden), your line in
 * the sheet has it (Codex P2 on #422).
 */
function useEveryone(
  people: readonly RoomParticipant[],
  floor: FloorView,
  mine: { kept: readonly RoomParticipant[]; flip: (() => void) | null | undefined },
) {
  const [open, setOpen] = useState(false)
  const flip = mine.kept.some((p) => p.local) ? null : mine.flip
  const sheet = open && <InTheCall people={people} floor={floor} flip={flip} onClose={() => setOpen(false)} />
  return { sheet, show: () => setOpen(true) }
}

/** What takes the stage: a person pinned, else a shared screen, else a report shown. */
function StageMain(props: {
  pinned: RoomParticipant | undefined
  cameraOf: (identity: string) => VideoFeed | undefined
  onUnpin: () => void
  screen: VideoFeed | undefined
  people: readonly RoomParticipant[]
  shown: ReactNode
  also: ReactNode
}) {
  const { pinned, screen } = props
  if (pinned) return <Spotlight person={pinned} camera={props.cameraOf(pinned.identity)} onUnpin={props.onUnpin} />
  if (!screen) return props.shown
  const presenter = props.people.find((p) => p.identity === screen.identity)
  return <SharedScreen feed={screen} caption={screenCaption(presenter)} also={props.also} />
}

/** Whom this viewer pinned, while they are here and no screen or report takes the stage; this viewer's alone. */
function usePin(people: readonly RoomParticipant[], present: boolean) {
  const [pinnedId, setPinned] = useState<string | null>(null)
  const pinned = present ? undefined : people.find((p) => p.identity === pinnedId)
  return [pinned, setPinned] as const
}

/**
 * The people with a tile, the rest past them («+N»), and how many tiles the gallery lays out: Sophia's, «Your tile is
 * hidden» when it stands in your place, and «+N» too.
 */
function useKeptTiles(
  people: RoomParticipant[],
  stage: { floor: FloorView; showing: string | null; arrived: readonly string[]; pinned: string | undefined },
  present: boolean,
  selfHidden: boolean,
) {
  const spokeAt = useSpokeAt(people)
  const order = {
    floor: stage.floor.holder?.identity ?? null,
    showing: stage.showing,
    spokeAt,
    arrived: stage.arrived,
    pinned: stage.pinned ?? null,
  }
  const { shown: kept, more } = tilesFor(people, order, peopleTiles(present, selfHidden))
  return { kept, more, count: kept.length + 1 + (selfHidden ? 1 : 0) + (more.length > 0 ? 1 : 0) }
}

/** Who spoke when, in turns (each change in who speaks is one): who spoke last keeps a tile next (tile-view.ts). */
function useSpokeAt(people: readonly RoomParticipant[]): ReadonlyMap<string, number> {
  const speaking = people
    .filter((p) => p.speaking)
    .map((p) => p.identity)
    .join(' ')
  const [seen, setSeen] = useState(() => ({ speaking: '', turn: 0, spokeAt: new Map<string, number>() }))
  // Each change in who speaks stamps those still speaking: whoever talked last, not whoever began last, ranks first.
  // Stamped in the render that sees the change, so the tiles follow at once.
  if (seen.speaking !== speaking) {
    const turn = seen.turn + 1
    const spokeAt = new Map(seen.spokeAt)
    for (const identity of speaking.split(' ').filter(Boolean)) spokeAt.set(identity, turn)
    setSeen({ speaking, turn, spokeAt })
  }
  return seen.spokeAt
}

/** The people past the tiles: «+N», which opens everyone in the call; its name says what it shows. */
function MoreTile({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <li className="tile tile-more">
      <button type="button" data-more-tile aria-label={`+${String(count)} more in the call`} onClick={onOpen}>
        {`+${String(count)}`}
      </button>
    </li>
  )
}

/** Where the focus goes when «+N» went while the sheet was open (the call fell under the cap): the room's Leave. */
const backToRoom = () =>
  document.querySelector<HTMLElement>('[data-more-tile]') ??
  document.querySelector<HTMLElement>('button[aria-label="Leave the room"]')

/**
 * Everyone in the call, with what sets them apart (the floor, a guest, speaking), and you: on a phone, with your
 * camera's switch while your tile isn't on the stage (camera-flip.md).
 */
function InTheCall(props: {
  people: readonly RoomParticipant[]
  floor: FloorView
  flip: (() => void) | null | undefined
  onClose: () => void
}) {
  const id = useId()
  return (
    // Over the whole page, never inside the stage: its layers (the dock, the captions) would draw over a sheet held
    // in the gallery's own stacking.
    createPortal(
      <Sheet id={id} title="In the call" onClose={props.onClose} returnTo={backToRoom}>
        <ul className="in-the-call">
          {props.people.map((p) => {
            const role = presenceRole(p, props.floor.holder?.identity === p.identity)
            return (
              <li key={p.identity}>
                <span className="in-the-call-name">{`${shortName(p.name)}${p.local ? ' · you' : ''}`}</span>
                {role && <span className="in-the-call-role">{role}</span>}
                {p.local && props.flip && (
                  <button type="button" className="text-button in-the-call-flip" onClick={props.flip}>
                    Switch camera
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </Sheet>,
      document.body,
    )
  )
}
