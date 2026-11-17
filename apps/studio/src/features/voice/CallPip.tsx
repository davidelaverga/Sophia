// Keep the call in view (docs/plans/call-picture-in-picture.md): the dock's press that puts the call in picture in
// picture. Document Picture-in-Picture (Chromium) gets a small window that shows the stage's one view (pipShows), a
// portal of this render, so it follows the call; elsewhere the stage's video goes into the browser's own picture in
// picture. Ending it gives the page back; leaving the call (this button's unmount) closes it, a window still on its
// way included.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import type { VideoFeed } from './livekit-room.ts'
import { pipShows, pipWay, type PipShown } from './pip-view.ts'
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

/** The page's root attributes (its theme among them), the same on the small window's root. */
function copyRoot(to: Document): void {
  const from = document.documentElement
  for (const name of to.documentElement.getAttributeNames())
    if (!from.hasAttribute(name)) to.documentElement.removeAttribute(name)
  for (const { name, value } of from.attributes) to.documentElement.setAttribute(name, value)
}

/**
 * The page's styles and theme, carried into the small window: a stylesheet linked by its full address (the window has
 * no base of its own), a style as it is. A theme changed while it is open follows it there; the stop returned ends that.
 */
function carryStyles(to: Document): () => void {
  for (const node of document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')) {
    if (node instanceof HTMLLinkElement) {
      const link = to.createElement('link')
      link.rel = 'stylesheet'
      link.href = node.href
      to.head.append(link)
    } else to.head.append(node.cloneNode(true))
  }
  copyRoot(to)
  to.body.className = 'pip-body'
  const watch = new MutationObserver(() => copyRoot(to))
  watch.observe(document.documentElement, { attributes: true })
  return () => watch.disconnect()
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

/**
 * Whether the stage has a video for video picture in picture, followed as the stage changes (a tile hidden, a camera
 * off). Where Document Picture-in-Picture is there, it isn't needed, and nothing is watched.
 */
function useStageVideo(shown: PipShown<VideoFeed> | null): boolean {
  const subscribe = useCallback((changed: () => void) => {
    if (documentPip() !== null) return () => undefined
    const watch = new MutationObserver(changed)
    watch.observe(document.body, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  return useSyncExternalStore(subscribe, () => stageVideo(shown) !== null)
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

/** Picture in picture for this button's life: what is open closes with it, and what comes after it is closed at once. */
function useOpenUntilGone() {
  const [small, setSmall] = useState<Window | null>(null)
  const [inVideo, setInVideo] = useState(false)
  const latest = useRef({ small, inVideo })
  const mounted = useRef(true)
  useEffect(() => {
    latest.current = { small, inVideo }
  })
  // Leaving the call unmounts the dock's live controls: what is open closes with them.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      latest.current.small?.close()
      if (latest.current.inVideo && document.pictureInPictureElement)
        void document.exitPictureInPicture().catch(() => undefined)
    }
  }, [])
  return { small, setSmall, inVideo, setInVideo, mounted }
}

/** The small window this page holds, if any, and how to open and close it in either way. */
function usePip(shown: PipShown<VideoFeed> | null) {
  const { small, setSmall, inVideo, setInVideo, mounted } = useOpenUntilGone()
  /** A request under way: a press meanwhile asks for nothing more. */
  const opening = useRef(false)
  const openWindow = async (api: DocumentPip) => {
    const opened = await api.requestWindow(SIZE)
    // The call was left while the browser opened it: it closes at once, never left behind.
    if (!mounted.current) {
      opened.close()
      return
    }
    const stop = carryStyles(opened.document)
    // Closed from the small window (its close, or back to the tab): the page is as it was.
    const closed = () => {
      stop()
      setSmall((now) => (now === opened ? null : now))
    }
    opened.addEventListener('pagehide', closed, { once: true })
    setSmall(opened)
  }
  const openVideo = async () => {
    const video = stageVideo(shown)
    if (!video) return
    await video.requestPictureInPicture()
    if (!mounted.current) {
      void document.exitPictureInPicture().catch(() => undefined)
      return
    }
    video.addEventListener('leavepictureinpicture', () => setInVideo(false), { once: true })
    setInVideo(true)
  }
  const open = () => {
    if (opening.current) return
    opening.current = true
    const api = documentPip()
    // A browser that refuses (no press it counts, a window already open elsewhere) leaves the page as it is.
    void (api ? openWindow(api) : openVideo())
      .catch(() => undefined)
      .finally(() => {
        opening.current = false
      })
  }
  const close = () => {
    small?.close()
    setSmall(null)
    if (inVideo && document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
    setInVideo(false)
  }
  return { small, on: small !== null || inVideo, open, close }
}

/**
 * «Keep the call in view», help «Picture in picture»: offered only where the browser has a way and that way has
 * something to show (pipWay).
 */
export function CallPip({ room }: { room: ProjectRoom }) {
  const shown = pipShows(room.participants, room.feeds)
  const pip = usePip(shown)
  const video = useStageVideo(shown)
  const has = { document: documentPip() !== null, video: videoPip() }
  if (!pip.on && pipWay(has, video) === null) return null
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
      {pip.small && createPortal(<PipView shown={shown} />, pip.small.document.body)}
    </>
  )
}
