// The camera's background as LiveKit draws it (docs/plans/call-backgrounds.md), the camera, the processor and the
// publication passed in so the rules are unit-tested without LiveKit:
// - a camera turning on with a background is made unpublished, drawn, and published only once its processor has drawn
//   a frame: the processor (0.8.1) passes its first frame through raw, and it never leaves (Codex P1s on #342);
// - a camera only muted is let go first, so it is never unmuted raw; a camera drawn here turns off by being let go;
// - a background that can't be drawn keeps the camera off and says why, rather than sending what is behind;
// - choices take their turns: one switch at a time, and work a later choice superseded is let go before it lands;
// - the camera's own on and off take their turns with them: a plain camera (no background) starts in the same queue, so
//   a choice made while it starts lands on it, and a choice changed while the camera's starts is followed, never read as
//   «no background» (Codex P1 on #342).
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

/** A camera track, as LiveKit gives it. */
interface CameraTrack<P> {
  getProcessor: () => unknown
  setProcessor: (processor: P) => Promise<void>
  stopProcessor: () => Promise<void>
  stop: () => void
}

interface Ports<P extends Drawing, T extends CameraTrack<P>> {
  /** The camera's published track (on or muted), else null. */
  camera: () => T | null
  /** A processor drawing a background; it loads the processor's module, and MediaPipe with it, on first use. */
  make: (effect: BackgroundEffect) => Promise<P>
  chosen: BackgroundId
  picture: (id: PictureId) => string
  /** A camera track drawn by the processor, made but not published. */
  create: (processor: P) => Promise<T>
  publish: (track: T) => Promise<void>
  /** Let a published track go, and stop it. */
  unpublish: (track: T) => Promise<void>
  /** Resolves once the processor has drawn a frame; rejects when none came in time. */
  drawnFrame: (processor: P) => Promise<void>
}

/** What a camera's background holds between changes. */
interface State<P, T> {
  chosen: BackgroundId
  drawing: P | null
  /** The camera this published, drawn: it turns off by being let go. */
  drawnCamera: T | null
  /** Each choice's turn: work an older turn began is let go once a newer one came. */
  turn: number
}

/** One change at a time, in the order they came. */
function oneAtATime() {
  let queue: Promise<unknown> = Promise.resolve()
  return <R>(work: () => Promise<R>): Promise<R> => {
    const run = queue.then(work)
    queue = run.catch(() => undefined)
    return run
  }
}

type Of<P extends Drawing, T extends CameraTrack<P>> = { ports: Ports<P, T>; state: State<P, T> }

/** The processor for a background (made once, switched after), null for none, undefined once superseded. */
async function prepare<P extends Drawing, T extends CameraTrack<P>>({ ports, state }: Of<P, T>, mine: number) {
  if (mine !== state.turn) return undefined
  if (state.chosen === 'none') return null
  const effect = backgroundEffect(state.chosen, ports.picture)
  if (state.drawing) await state.drawing.switchTo(effect)
  else state.drawing = await ports.make(effect)
  return mine === state.turn ? state.drawing : undefined
}

/** The background on the camera's published track, where there is one. */
async function draw<P extends Drawing, T extends CameraTrack<P>>(of: Of<P, T>, mine: number) {
  const processor = await prepare(of, mine)
  const track = of.ports.camera()
  if (processor === undefined || !track) return
  if (processor === null) {
    if (track.getProcessor()) await track.stopProcessor()
    of.state.drawing = null
    return
  }
  if (track.getProcessor() !== processor) await track.setProcessor(processor)
}

/** The processor for the latest choice: a choice made while one loads is followed, not given up on. */
async function latest<P extends Drawing, T extends CameraTrack<P>>(of: Of<P, T>) {
  for (;;) {
    const processor = await prepare(of, of.state.turn)
    if (processor !== undefined) return processor
  }
}

/**
 * Made, drawn, then published: the processor's first raw frame stays here. A camera only muted goes first. False when
 * the latest choice is None by the time it is ready, and the camera starts plain.
 */
async function publishDrawn<P extends Drawing, T extends CameraTrack<P>>(of: Of<P, T>) {
  const { ports, state } = of
  const muted = ports.camera()
  if (muted) await ports.unpublish(muted)
  state.drawing = null
  const processor = await latest(of)
  if (!processor) {
    state.drawing = null
    return false
  }
  const track = await ports.create(processor)
  try {
    await ports.drawnFrame(processor)
    await ports.publish(track)
  } catch (err: unknown) {
    track.stop()
    throw err
  }
  state.drawnCamera = track
  return true
}

export function cameraBackground<P extends Drawing, T extends CameraTrack<P>>(ports: Ports<P, T>) {
  const of: Of<P, T> = { ports, state: { chosen: ports.chosen, drawing: null, drawnCamera: null, turn: 0 } }
  const { state } = of
  const inTurn = oneAtATime()
  return {
    set: (id: BackgroundId) => {
      state.chosen = id
      const mine = ++state.turn
      return inTurn(() => draw(of, mine))
    },
    /** Turn the camera on, in its turn: drawn with the choice it finds then, or `plain` (LiveKit's own) for None. */
    turnOn: (plain: () => Promise<unknown>) =>
      inTurn(async () => {
        const drawn =
          state.chosen !== 'none' &&
          (await publishDrawn(of).catch((err: unknown) => {
            throw new BackgroundUnavailable(err)
          }))
        if (!drawn) await plain()
      }),
    /** Turn the camera off, in its turn: a camera drawn here by being let go, any other by `plain`. */
    turnOff: (plain: () => Promise<unknown>) =>
      inTurn(async () => {
        const track = state.drawnCamera
        state.drawnCamera = null
        if (track) state.drawing = null
        await (track ? ports.unpublish(track) : plain())
      }),
  }
}
