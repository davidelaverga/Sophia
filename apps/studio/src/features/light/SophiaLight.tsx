// SophiaLight: the light as a React component. React says what the room is (mode, where she sits,
// whom she attends to, whether work runs); the engine draws it outside React's render cycle.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { LightEngine, type LightInput, type LightTarget } from './engine.ts'
import type { Point } from './motion.ts'
import { highRest, restsHigh, sameRest } from './screen-rest.ts'

export interface SophiaLightHandle {
  /** The floor travels from one person, through Sophia, to the next. */
  handoff: (from: Point, to: Point) => void
}

interface Props extends LightInput {
  ref?: Ref<SophiaLightHandle>
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

export function SophiaLight({ mode, target, attention, working, screen = false, ref }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const glCanvas = useRef<HTMLCanvasElement>(null)
  const traceCanvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<LightEngine | null>(null)
  const rest = useScreenRest(screen, box)

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
    engine.current?.update({ mode, target: target ?? rest, attention, working })
  }, [mode, target, rest, attention, working])

  useImperativeHandle(ref, () => ({ handoff: (from, to) => engine.current?.handoff(from, to) }), [])

  return (
    <div ref={box} className="light" aria-hidden>
      <canvas ref={glCanvas} className="light-gl" />
      <canvas ref={traceCanvas} className="light-trace" />
    </div>
  )
}
