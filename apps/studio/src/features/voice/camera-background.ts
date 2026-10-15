// The camera's background as LiveKit draws it (docs/plans/call-backgrounds.md), the camera and the processor's loader
// passed in so the rules are unit-tested without LiveKit:
// - a camera turning on gets the chosen background with its capture, so its first published frame is drawn (Codex P1
//   on #342), and a camera only muted gets it on its own track before it is unmuted;
// - a background that can't load keeps the camera off and says why, rather than sending what is behind;
// - the latest choice wins: work a later choice superseded during a slow load is let go.
import { backgroundEffect, type BackgroundEffect, type BackgroundId, type PictureId } from './background-preference.ts'

/** The chosen background couldn't be drawn, so the camera was kept off. */
export class BackgroundUnavailable extends Error {
  constructor(cause: unknown) {
    super('The background couldn’t be drawn', { cause })
    this.name = 'BackgroundUnavailable'
  }
}

/** A processor: switched from one background to another while it draws. */
interface Drawing {
  switchTo: (effect: BackgroundEffect) => Promise<void>
}

/** The camera's track, as LiveKit gives it. */
interface CameraTrack<P> {
  getProcessor: () => unknown
  setProcessor: (processor: P) => Promise<void>
  stopProcessor: () => Promise<void>
}

interface Ports<P extends Drawing> {
  /** The camera's track while one is published (on or muted), else null. */
  camera: () => CameraTrack<P> | null
  /** A processor drawing a background; it loads the processor's module, and MediaPipe with it, on first use. */
  make: (effect: BackgroundEffect) => Promise<P>
  chosen: BackgroundId
  picture: (id: PictureId) => string
}

export function cameraBackground<P extends Drawing>(ports: Ports<P>) {
  let chosen = ports.chosen
  let drawing: P | null = null
  /** Each choice's turn: work an older turn began is let go once a newer one came. */
  let turn = 0
  /** The processor for a background (made once, switched after), null for none, undefined once superseded. */
  const prepare = async (id: BackgroundId, mine: number): Promise<P | null | undefined> => {
    if (id === 'none') return null
    const effect = backgroundEffect(id, ports.picture)
    if (drawing) await drawing.switchTo(effect)
    else {
      const made = await ports.make(effect)
      if (mine !== turn) return undefined
      drawing = made
    }
    return mine === turn ? drawing : undefined
  }
  /** The background on the camera's track, where there is one; a camera off gets it as it turns on. */
  const draw = async (id: BackgroundId) => {
    const processor = await prepare(id, ++turn)
    const track = ports.camera()
    if (processor === undefined || !track) return
    if (processor === null) {
      if (track.getProcessor()) await track.stopProcessor()
      drawing = null
      return
    }
    if (track.getProcessor() !== processor) await track.setProcessor(processor)
  }
  return {
    set: (id: BackgroundId) => {
      chosen = id
      return draw(id)
    },
    /** What the camera turns on with: the chosen background, ready before anything is published. */
    captureOptions: async (): Promise<{ processor?: P }> => {
      try {
        if (ports.camera()) {
          await draw(chosen)
          return {}
        }
        const processor = await prepare(chosen, ++turn)
        return processor ? { processor } : {}
      } catch (err: unknown) {
        throw new BackgroundUnavailable(err)
      }
    },
  }
}
