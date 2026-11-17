// Keep the call in view (docs/plans/call-picture-in-picture.md): the dock's press that puts the call in picture in
// picture. Document Picture-in-Picture (Chromium) gets a small window that shows the stage's one view (pipShows), a
// portal of this render, so it follows the call; elsewhere the stage's video goes into the browser's own picture in
// picture. Ending it gives the page back; leaving the call (this button's unmount) closes it.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import type { VideoFeed } from './livekit-room.ts'
import { pipShows, pipWay, type PipShown } from './pip-view.ts'
import type { RoomParticipant } from './room-view.ts'
import type { ProjectRoom } from './useProjectRoom.ts'
import { VideoView } from './VideoStage.tsx'

/** Chromium's Document Picture-in-Picture, as far as the room asks it. */
interface DocumentPip {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}

/** Video picture in picture: Firefox has no `pictureInPictureEnabled` at all, whatever the types say. */
function videoPip(): boolean {
  const enabled: unknown = Reflect.get(document, 'pictureInPictureEnabled')
  return enabled === true
}

const isDocumentPip = (api: unknown): api is DocumentPip =>
  typeof api === 'object' && api !== null && typeof Reflect.get(api, 'requestWindow') === 'function'

/** The browser's Document Picture-in-Picture, or null where it has none. */
function documentPip(): DocumentPip | null {
  const api: unknown = Reflect.get(window, 'documentPictureInPicture')
  return isDocumentPip(api) ? api : null
}

/** The small window's size: a 16:9 view, as Chromium's own picture in picture opens. */
const SIZE = { width: 400, height: 225 }

/**
 * The page's styles and theme, carried into the small window: a stylesheet linked by its full address (the window has
 * no base of its own), a style as it is.
 */
function carryStyles(to: Document): void {
  for (const node of document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')) {
    if (node instanceof HTMLLinkElement) {
      const link = to.createElement('link')
      link.rel = 'stylesheet'
      link.href = node.href
      to.head.append(link)
    } else to.head.append(node.cloneNode(true))
  }
  for (const { name, value } of document.documentElement.attributes) to.documentElement.setAttribute(name, value)
  to.body.className = 'pip-body'
}

/** The stage's video for video picture in picture: the one `pipShows` picks where it is on the stage, else any. */
function stageVideo(shown: PipShown<VideoFeed> | null): HTMLVideoElement | null {
  const stage = document.querySelector('.room-stage')
  if (!stage) return null
  const own =
    shown?.feed?.source === 'screen'
      ? stage.querySelector<HTMLVideoElement>('.screen-main video')
      : shown && stage.querySelector<HTMLVideoElement>(`.tile[data-actor="${CSS.escape(shown.person.identity)}"] video`)
  return own ?? stage.querySelector<HTMLVideoElement>('video')
}

/** What the small window shows: the view's video, or the person's initial, and its caption. */
function PipView({ shown }: { shown: PipShown<VideoFeed> | null }) {
  if (!shown) return null
  return (
    <figure className="pip-call">
      {shown.feed ? (
        <VideoView feed={shown.feed} fit="contain" />
      ) : (
        <span className="tile-initial">{shown.caption.charAt(0)}</span>
      )}
      <figcaption>{shown.caption}</figcaption>
    </figure>
  )
}

/** The small window this page holds, if any, and how to open and close it in either way. */
function usePip(people: readonly RoomParticipant[], feeds: readonly VideoFeed[]) {
  const [small, setSmall] = useState<Window | null>(null)
  const [inVideo, setInVideo] = useState(false)
  const latest = useRef({ small, inVideo })
  useEffect(() => {
    latest.current = { small, inVideo }
  })
  // Leaving the call unmounts the dock's live controls: what is open closes with them.
  useEffect(
    () => () => {
      latest.current.small?.close()
      if (latest.current.inVideo && document.pictureInPictureElement) void document.exitPictureInPicture()
    },
    [],
  )
  const openWindow = async (api: DocumentPip) => {
    const opened = await api.requestWindow(SIZE)
    carryStyles(opened.document)
    // Closed from the small window (its close, or back to the tab): the page is as it was.
    opened.addEventListener('pagehide', () => setSmall(null), { once: true })
    setSmall(opened)
  }
  const openVideo = async () => {
    const video = stageVideo(pipShows(people, feeds))
    if (!video) return
    await video.requestPictureInPicture()
    video.addEventListener('leavepictureinpicture', () => setInVideo(false), { once: true })
    setInVideo(true)
  }
  const open = () => {
    const api = documentPip()
    // A browser that refuses (no press it counts, a window already open elsewhere) leaves the page as it is.
    void (api ? openWindow(api) : openVideo()).catch(() => undefined)
  }
  const close = () => {
    small?.close()
    setSmall(null)
    if (inVideo && document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
    setInVideo(false)
  }
  return { small, on: small !== null || inVideo, open, close }
}

/** «Keep the call in view», help «Picture in picture»: offered only where the browser has a way (pipWay). */
export function CallPip({ room }: { room: ProjectRoom }) {
  const { participants, feeds } = room
  const pip = usePip(participants, feeds)
  const has = { document: documentPip() !== null, video: videoPip() }
  if (!pip.on && pipWay(has, feeds.length > 0) === null) return null
  return (
    <>
      <button
        type="button"
        className="round has-tip dock-pip"
        aria-pressed={pip.on}
        aria-label="Keep the call in view"
        onClick={pip.on ? pip.close : pip.open}
      >
        <Icon name="pip" />
        <Tip label="Picture in picture" />
      </button>
      {pip.small && createPortal(<PipView shown={pipShows(participants, feeds)} />, pip.small.document.body)}
    </>
  )
}
