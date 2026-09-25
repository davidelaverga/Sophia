// Video in the room: a shared screen takes the stage with the tiles beside it; cameras alone make a
// gallery. Sophia keeps a tile of her own: it is transparent, and her light shines in it from behind.
import { useEffect, useRef } from 'react'
import type { VideoFeed } from './livekit-room.ts'
import { shortName, type FloorView, type RoomParticipant, type StageMode } from './room-view.ts'

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
}

export function VideoStage({ mode, people, feeds, floor }: Props) {
  const screen = feeds.find((f) => f.source === 'screen')
  const cameraOf = (identity: string) => feeds.find((f) => f.identity === identity && f.source === 'camera')
  const tiles = (
    <>
      <li className="tile sophia-tile" data-sophia-tile>
        <span className="tile-name">Sophia</span>
      </li>
      {people.map((p) => (
        <PersonTile
          key={p.identity}
          person={p}
          camera={cameraOf(p.identity)}
          holds={floor.holder?.identity === p.identity}
        />
      ))}
    </>
  )
  if (mode === 'present' && screen) {
    const presenter = people.find((p) => p.identity === screen.identity)
    return (
      <div className="present">
        <figure className="screen-main">
          <VideoView feed={screen} fit="contain" />
          <figcaption>{presenter ? `${shortName(presenter.name)}’s screen` : 'Shared screen'}</figcaption>
        </figure>
        <ul className="tile-strip" aria-label="In the room">
          {tiles}
        </ul>
      </div>
    )
  }
  return (
    <ul className="gallery" data-count={Math.min(people.length + 1, 6)} aria-label="In the room">
      {tiles}
    </ul>
  )
}
