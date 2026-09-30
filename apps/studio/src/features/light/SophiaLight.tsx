// SophiaLight: the light as a React component. React says what the room is (mode, where she sits,
// whom she attends to, whether work runs); the engine draws it outside React's render cycle.
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { LightEngine, type LightInput, type LightTarget } from './engine.ts'
import type { Point } from './motion.ts'

export interface SophiaLightHandle {
  /** The floor travels from one person, through Sophia, to the next. */
  handoff: (from: Point, to: Point) => void
}

interface Props extends LightInput {
  ref?: Ref<SophiaLightHandle>
  /**
   * A screen without a room (sign-in, the home, an invitation). On a tall phone the light rests higher and smaller
   * there, so the words start in the upper half; theme.css moves `.screen-body` by the same numbers.
   */
  screen?: boolean
}

/** A box at least half again as tall as it is wide; the numbers match the container query in theme.css. */
function tallRest(): LightTarget | null {
  const { innerWidth: w, innerHeight: h } = window
  return h >= w * 1.5 ? { x: w / 2, y: h * 0.26, radius: Math.min(w, h) * 0.3 } : null
}

function useScreenRest(screen: boolean): LightTarget | null {
  const [rest, setRest] = useState(() => (screen ? tallRest() : null))
  useEffect(() => {
    if (!screen) return undefined
    const follow = () => setRest(tallRest())
    window.addEventListener('resize', follow)
    return () => window.removeEventListener('resize', follow)
  }, [screen])
  return rest
}

export function SophiaLight({ mode, target, attention, working, screen = false, ref }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const glCanvas = useRef<HTMLCanvasElement>(null)
  const traceCanvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<LightEngine | null>(null)
  const rest = useScreenRest(screen)

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
