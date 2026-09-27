// SophiaLight: the light as a React component. React says what the room is (mode, where she sits,
// whom she attends to, whether work runs); the engine draws it outside React's render cycle.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { LightEngine, type LightInput } from './engine.ts'
import type { Point } from './motion.ts'

export interface SophiaLightHandle {
  /** The floor travels from one person, through Sophia, to the next. */
  handoff: (from: Point, to: Point) => void
}

interface Props extends LightInput {
  ref?: Ref<SophiaLightHandle>
}

export function SophiaLight({ mode, target, attention, working, ref }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const glCanvas = useRef<HTMLCanvasElement>(null)
  const traceCanvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<LightEngine | null>(null)

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
    engine.current?.update({ mode, target, attention, working })
  }, [mode, target, attention, working])

  useImperativeHandle(ref, () => ({ handoff: (from, to) => engine.current?.handoff(from, to) }), [])

  return (
    <div ref={box} className="light" aria-hidden>
      <canvas ref={glCanvas} className="light-gl" />
      <canvas ref={traceCanvas} className="light-trace" />
    </div>
  )
}
