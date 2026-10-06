// Video in the room: a shared screen takes the stage with the tiles beside it; cameras alone make a gallery. Sophia
// keeps a tile of her own: it is transparent, and her light shines in it from behind. A report shown to everyone takes
// the shared screen's place (PresentedReport, docs/plans/room-present.md). Past a few people the tiles stop, and «+N»
// opens everyone in the call (tile-view.ts, docs/plans/room-tiles-overflow.md).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
import { GALLERY_TILES, STRIP_TILES, tilesFor } from './tile-view.ts'

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
  const { kept, more, count } = useKeptTiles(people, floor, screen?.identity ?? null, present)
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
      {more.length > 0 && <MoreTile people={people} count={more.length} floor={floor} />}
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
      </div>
    )
  }
  return (
    <ul className="gallery" data-count={count} aria-label="In the room">
      {tiles}
    </ul>
  )
}

/** The people with a tile, the rest past them («+N»), and how many tiles the gallery lays out (Sophia's too). */
function useKeptTiles(people: RoomParticipant[], floor: FloorView, showing: string | null, present: boolean) {
  const spokeAt = useSpokeAt(people)
  const order = { floor: floor.holder?.identity ?? null, showing, spokeAt }
  const { shown: kept, more } = tilesFor(people, order, present ? STRIP_TILES : GALLERY_TILES)
  return { kept, more, count: kept.length + 1 + (more.length > 0 ? 1 : 0) }
}

/** When each person last spoke, on this page's clock: who spoke most recently keeps a tile next (tile-view.ts). */
function useSpokeAt(people: readonly RoomParticipant[]): ReadonlyMap<string, number> {
  const spokeAt = useRef(new Map<string, number>())
  const speaking = people
    .filter((p) => p.speaking)
    .map((p) => p.identity)
    .join(' ')
  useEffect(() => {
    for (const identity of speaking.split(' ').filter(Boolean)) spokeAt.current.set(identity, Date.now())
  }, [speaking])
  return spokeAt.current
}

/** The people past the tiles: «+N», which opens everyone in the call (and Close gives the focus back to it). */
function MoreTile(props: { people: readonly RoomParticipant[]; count: number; floor: FloorView }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="tile tile-more">
      <button type="button" aria-label={`${String(props.count)} more in the call`} onClick={() => setOpen(true)}>
        {`+${String(props.count)}`}
      </button>
      {open && <InTheCall people={props.people} floor={props.floor} onClose={() => setOpen(false)} />}
    </li>
  )
}

/** Everyone in the call, with what sets them apart (the floor, a guest, speaking), and you. */
function InTheCall(props: { people: readonly RoomParticipant[]; floor: FloorView; onClose: () => void }) {
  const id = useId()
  return (
    <Sheet id={id} title="In the call" onClose={props.onClose}>
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
    </Sheet>
  )
}
