// Video in the room: a shared screen takes the stage with the tiles beside it; cameras alone make a gallery. Sophia
// keeps a tile of her own: it is transparent, and her light shines in it from behind. A report shown to everyone takes
// the shared screen's place (PresentedReport, docs/plans/room-present.md). Past a few people the tiles stop, and «+N»
// opens everyone in the call (tile-view.ts, docs/plans/room-tiles-overflow.md).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { VideoFeed } from './livekit-room.ts'
import { Sheet } from '../../app/Sheet.tsx'
import {
  presenceRole,
  screenCaption,
  shortName,
  type FloorView,
  type RoomParticipant,
  type StageMode,
} from './room-view.ts'
import { arrivalOrder, GALLERY_TILES, STRIP_TILES, tilesFor } from './tile-view.ts'

function VideoView({ feed, fit }: { feed: VideoFeed; fit: 'cover' | 'contain' }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = video.current
    if (!el) return undefined
    feed.attach(el)
    return () => feed.detach(el)
  }, [feed])
  // Your own camera is mirrored, as in a mirror; a shared screen never is.
  const mirrored = feed.local && feed.source === 'camera'
  return <video ref={video} className={`video ${fit}${mirrored ? ' mirrored' : ''}`} autoPlay playsInline muted />
}

interface TileProps {
  person: RoomParticipant
  camera: VideoFeed | undefined
  holds: boolean
}

function PersonTile({ person, camera, holds }: TileProps) {
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
      <span className="tile-name" data-anchor>
        {shortName(person.name)}
        {person.local && ' · you'}
        {person.standing === 'guest' && ' · guest'}
        {holds && <span className="tile-floor"> · floor</span>}
      </span>
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
}

export function VideoStage({ mode, people, feeds, floor, shown }: Props) {
  const screen = feeds.find((f) => f.source === 'screen')
  const cameraOf = (identity: string) => feeds.find((f) => f.identity === identity && f.source === 'camera')
  const present = mode === 'present' && (screen !== undefined || shown !== undefined)
  const arrived = arrivalOrder(people)
  const { kept, more, count } = useKeptTiles(people, { floor, showing: screen?.identity ?? null, arrived }, present)
  // Held here, not in «+N»: the tiles move between the strip and the gallery, and the sheet stays open across.
  const [everyone, setEveryone] = useState(false)
  const tiles = (
    <>
      <li className="tile sophia-tile" data-sophia-tile>
        <span className="tile-name">Sophia</span>
      </li>
      {kept.map((p) => (
        <PersonTile
          key={p.identity}
          person={p}
          camera={cameraOf(p.identity)}
          holds={floor.holder?.identity === p.identity}
        />
      ))}
      {more.length > 0 && <MoreTile count={more.length} onOpen={() => setEveryone(true)} />}
    </>
  )
  if (present) {
    const presenter = screen ? people.find((p) => p.identity === screen.identity) : undefined
    return (
      <div className="present">
        {screen ? (
          <figure className="screen-main">
            <VideoView feed={screen} fit="contain" />
            <figcaption>{screenCaption(presenter)}</figcaption>
          </figure>
        ) : (
          shown
        )}
        <ul className="tile-strip" aria-label="In the room">
          {tiles}
        </ul>
        {everyone && <InTheCall people={people} floor={floor} onClose={() => setEveryone(false)} />}
      </div>
    )
  }
  return (
    <ul className="gallery" data-count={count} aria-label="In the room">
      {tiles}
      {everyone && <InTheCall people={people} floor={floor} onClose={() => setEveryone(false)} />}
    </ul>
  )
}

/** The people with a tile, the rest past them («+N»), and how many tiles the gallery lays out (Sophia's too). */
function useKeptTiles(
  people: RoomParticipant[],
  stage: { floor: FloorView; showing: string | null; arrived: readonly string[] },
  present: boolean,
) {
  const spokeAt = useSpokeAt(people)
  const order = { floor: stage.floor.holder?.identity ?? null, showing: stage.showing, spokeAt, arrived: stage.arrived }
  const { shown: kept, more } = tilesFor(people, order, present ? STRIP_TILES : GALLERY_TILES)
  return { kept, more, count: kept.length + 1 + (more.length > 0 ? 1 : 0) }
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

/** Everyone in the call, with what sets them apart (the floor, a guest, speaking), and you. */
function InTheCall(props: { people: readonly RoomParticipant[]; floor: FloorView; onClose: () => void }) {
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
              </li>
            )
          })}
        </ul>
      </Sheet>,
      document.body,
    )
  )
}
