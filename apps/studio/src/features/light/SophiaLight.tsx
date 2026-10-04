// SophiaLight: the light as a React component. React says what the room is (mode, where she sits,
// whom she attends to, whether work runs); the engine draws it outside React's render cycle.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { defaultTarget, LightEngine, type LightInput, type LightTarget } from './engine.ts'
import type { Point } from './motion.ts'
import { highRest, restsHigh, sameRest } from './screen-rest.ts'
import { markSize, shapedTarget } from './threshold.ts'
import { Threshold } from './Threshold.tsx'

export interface SophiaLightHandle {
  /** The floor travels from one person, through Sophia, to the next. */
  handoff: (from: Point, to: Point) => void
}

interface Props extends LightInput {
  ref?: Ref<SophiaLightHandle>
  /** Someone writing at this point: the light leans a little towards it (the sign-in's threshold, threshold.ts). */
  pull?: Point | null
  /** Someone is through (the threshold): the light condenses where it rests and Umbral forms there, rising from `from`. */
  formed?: { from: Point | null } | null
  /**
   * A screen without a room (sign-in, the home, an invitation): the light is the first child of `.screen` and its
   * words are the `.screen-body` beside it. The light rests higher and smaller when they would not fit under it.
   */
  screen?: boolean
}

/**
 * On a screen without a room the light follows its words (screen-rest.ts): it rests high when they would not fit
 * under it, and marks the screen (`data-rest-high`) so theme.css starts the words by the same numbers. A window that
 * changes decides afresh; words that grow can only lift the light, so typing never drops it back mid-word.
 */
function useScreenRest(screen: boolean, box: RefObject<HTMLDivElement | null>): LightTarget | null {
  const [rest, setRest] = useState<LightTarget | null>(null)
  useLayoutEffect(() => {
    const room = screen ? box.current?.parentElement : null
    const words = room?.querySelector('.screen-body')
    if (!room || !(words instanceof HTMLElement)) return undefined
    let high = false
    const place = (keep: boolean) => {
      const { clientWidth: width, clientHeight: height } = room
      high = (keep && high) || restsHigh(width, height, words.offsetHeight)
      room.toggleAttribute('data-rest-high', high)
      const next = high ? highRest(width, height) : null
      setRest((was) => (sameRest(was, next) ? was : next))
    }
    place(false)
    const resized = new ResizeObserver(() => place(false))
    const grown = new ResizeObserver(() => place(true))
    resized.observe(room)
    grown.observe(words)
    return () => {
      resized.disconnect()
      grown.disconnect()
    }
  }, [screen, box])
  return rest
}

interface BoxSize {
  width: number
  height: number
}

/**
 * The box's size while the light is shaped from where it rests (threshold.ts), so a resized window places it and its
 * mark again; null otherwise, so a light that isn't shaped (the room's) neither observes nor renders for it.
 */
function useShapingSize(box: RefObject<HTMLDivElement | null>, shaping: boolean): BoxSize | null {
  const [size, setSize] = useState<BoxSize | null>(null)
  useLayoutEffect(() => {
    const b = box.current
    if (!shaping || !b) return undefined
    const measure = () => {
      // Out of sight the box has no size: keep the last one, so nothing is shaped (or formed) at nothing.
      if (b.clientWidth < 1 || b.clientHeight < 1) return
      setSize((was) =>
        was?.width === b.clientWidth && was.height === b.clientHeight
          ? was
          : { width: b.clientWidth, height: b.clientHeight },
      )
    }
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(b)
    return () => resized.disconnect()
  }, [box, shaping])
  return shaping ? size : null
}

export function SophiaLight({
  mode,
  target,
  attention,
  working,
  screen = false,
  pull = null,
  formed = null,
  ref,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const glCanvas = useRef<HTMLCanvasElement>(null)
  const traceCanvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<LightEngine | null>(null)
  const rest = useScreenRest(screen, box)
  const shaping = pull !== null || formed !== null
  const size = useShapingSize(box, shaping)
  // Where the light rests once through, for the mark to form there: the same numbers the engine is given.
  const [restsAt, setRestsAt] = useState<LightTarget | null>(null)
  const markAt = formed && restsAt ? { x: restsAt.x, y: restsAt.y, size: markSize(restsAt.radius) } : null

  useEffect(() => {
    if (!box.current || !glCanvas.current || !traceCanvas.current) return undefined
    const running = new LightEngine(box.current, glCanvas.current, traceCanvas.current)
    engine.current = running
    return () => {
      running.stop()
      engine.current = null
    }
  }, [])

  useEffect(() => {
    const placed = target ?? rest
    // Leaning or formed, the light is placed from where it would rest; otherwise the engine places it as before.
    const base = shaping ? (placed ?? (size ? defaultTarget(size.width, size.height) : null)) : null
    const shaped = base ? shapedTarget(base, pull, formed !== null) : placed
    const through = formed ? base : null
    const mark = through ? { x: through.x, y: through.y, size: markSize(through.radius) } : null
    engine.current?.update({ mode, target: shaped, attention, working, mark })
    setRestsAt((was) => (sameRest(was, through) ? was : through))
  }, [mode, target, rest, attention, working, pull, formed, shaping, size])

  useImperativeHandle(ref, () => ({ handoff: (from, to) => engine.current?.handoff(from, to) }), [])

  return (
    <div
      ref={box}
      className="light"
      aria-hidden
      // What she is doing, and whom she attends to, as the engine was told: for the checks to read, never shown.
      data-mode={mode}
      data-attention={attention ? `${String(Math.round(attention.x))} ${String(Math.round(attention.y))}` : undefined}
      data-mark={
        markAt ? `${String(Math.round(markAt.x))} ${String(Math.round(markAt.y))} ${String(markAt.size)}` : undefined
      }
    >
      <canvas ref={glCanvas} className="light-gl" />
      <canvas ref={traceCanvas} className="light-trace" />
      {formed && restsAt && <Threshold at={restsAt} from={formed.from} />}
    </div>
  )
}
