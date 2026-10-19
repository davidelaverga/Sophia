import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LightEngine } from './engine.ts'

// Her light draws with WebGL in the room only (docs/plans/light-webgl-room.md). The page's pieces are stood in for: a
// canvas whose WebGL context takes every call, counts its frames and says whether it was given back; the light's box;
// its resize observer; and the browser's frames, run when the test says.

/** A WebGL context as the test reads it: the frames drawn in it, and whether it was given back. */
interface Gl {
  draws: number
  lost: boolean
  context: object
}

/** Every WebGL context a canvas gave, in order. */
let given: Gl[] = []
let frames = new Map<number, FrameRequestCallback>()
let lastFrame = 0
const observers = new Set<(width: number, height: number) => void>()

function webgl(): Gl {
  const gl: Gl = { draws: 0, lost: false, context: {} }
  const lose = { loseContext: () => void (gl.lost = true) }
  gl.context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'getExtension') return (name: string) => (name === 'WEBGL_lose_context' ? lose : null)
        if (key === 'isContextLost') return () => gl.lost
        if (key === 'drawArrays') return () => void gl.draws++
        if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true
        return () => ({})
      },
    },
  )
  given.push(gl)
  return gl
}

/** A canvas: one WebGL context from the first ask on (as a browser's), none on a device without WebGL. */
function canvas(hasWebgl = true) {
  let gl: Gl | null = null
  return {
    width: 300,
    height: 150,
    offsetParent: {},
    gl: () => gl,
    getContext: (kind: string) => {
      if (kind === '2d') return new Proxy({}, { get: () => () => undefined })
      if (kind !== 'webgl' || !hasWebgl) return null
      gl ??= webgl()
      return gl.context
    },
  }
}

/** The light's box: the marks the engine sets on it. */
function box() {
  const marks = new Set<string>()
  return {
    marks,
    dataset: {},
    style: { setProperty: () => undefined },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    toggleAttribute: (name: string, on?: boolean) => {
      if (on ?? !marks.has(name)) marks.add(name)
      else marks.delete(name)
      return marks.has(name)
    },
  }
}

class Resizes {
  readonly #told: (width: number, height: number) => void
  constructor(told: ResizeObserverCallback) {
    this.#told = (width, height) => told([{ contentRect: { width, height } } as ResizeObserverEntry], this as never)
  }
  observe() {
    observers.add(this.#told)
  }
  disconnect() {
    observers.delete(this.#told)
  }
}

/** The box measured at this size, as its observer reports it. */
const resize = (width: number, height: number) => observers.forEach((told) => told(width, height))

/** The browser's next frames: what was asked for before each runs. */
function runFrames(n: number) {
  for (let i = 0; i < n; i++) {
    const due = [...frames.values()]
    frames.clear()
    due.forEach((run) => run(performance.now()))
  }
}

const asCanvas = (c: object) => c as unknown as HTMLCanvasElement
const asBox = (b: object) => b as unknown as HTMLElement
const engine = (b = box()) => new LightEngine(asBox(b), asCanvas(canvas()))

beforeEach(() => {
  given = []
  frames = new Map()
  observers.clear()
  Reflect.set(globalThis, 'window', {
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 1,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })
  Reflect.set(globalThis, 'ResizeObserver', Resizes)
  Reflect.set(globalThis, 'requestAnimationFrame', (run: FrameRequestCallback) => {
    lastFrame += 1
    frames.set(lastFrame, run)
    return lastFrame
  })
  Reflect.set(globalThis, 'cancelAnimationFrame', (id: number) => frames.delete(id))
})

afterEach(() => {
  for (const name of ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'])
    Reflect.deleteProperty(globalThis, name)
})

describe('her light draws with WebGL in the room only', () => {
  it('on paper it asks for no WebGL context, while its frames run', () => {
    const light = engine()
    light.setPaper(true, null)
    resize(800, 600)
    runFrames(3)
    // Even handed a canvas (SophiaLight renders none on paper), paper draws no WebGL.
    light.setPaper(true, asCanvas(canvas()))
    runFrames(1)
    assert.equal(given.length, 0)
    light.stop()
  })

  it('in the room it takes one context, sized to its box once measured, and draws there', () => {
    const room = canvas()
    const light = engine()
    light.setPaper(false, asCanvas(room))
    assert.equal(given.length, 1)
    resize(800, 600)
    runFrames(2)
    // Below display resolution: 0.55 of the box at a pixel ratio of 1 (renderer.ts).
    assert.deepEqual([room.width, room.height], [440, 330])
    assert.ok((room.gl()?.draws ?? 0) > 0)
    light.stop()
  })

  it('turned paper it gives its context back; turned dark it takes a new one on the new canvas, sized at once', () => {
    const room = canvas()
    const light = engine()
    light.setPaper(false, asCanvas(room))
    resize(800, 600)
    runFrames(1)
    light.setPaper(true, null)
    assert.equal(room.gl()?.lost, true, 'the room’s context, given back as the canvas leaves')
    const drawn = room.gl()?.draws
    runFrames(2)
    assert.equal(room.gl()?.draws, drawn, 'no frame drawn on paper')
    const again = canvas()
    light.setPaper(false, asCanvas(again))
    assert.equal(given.length, 2)
    // Its box kept its size, so no resize comes for it: the new canvas is sized as it arrives.
    assert.deepEqual([again.width, again.height], [440, 330])
    runFrames(1)
    assert.ok((again.gl()?.draws ?? 0) > 0)
    light.stop()
  })

  it('told the same twice, it keeps the context it holds', () => {
    const room = canvas()
    const light = engine()
    light.setPaper(false, asCanvas(room))
    light.setPaper(false, asCanvas(room))
    assert.equal(room.gl()?.lost, false, 'a context given back could not draw on its canvas again')
    light.setPaper(true, null)
    light.setPaper(true, null)
    assert.equal(given.length, 1)
    assert.equal(room.gl()?.lost, true)
    light.stop()
  })

  it('stopped, it leaves the context with its canvas: StrictMode starts a second engine on the same canvas', () => {
    const room = canvas()
    const first = engine()
    first.setPaper(false, asCanvas(room))
    first.stop()
    const second = engine()
    second.setPaper(false, asCanvas(room))
    resize(800, 600)
    runFrames(1)
    assert.equal(given.length, 1)
    assert.equal(room.gl()?.lost, false)
    assert.ok((room.gl()?.draws ?? 0) > 0)
    second.stop()
  })

  it('without WebGL the room keeps its CSS glow; a canvas with WebGL takes the mark away', () => {
    const b = box()
    const light = engine(b)
    light.setPaper(false, asCanvas(canvas(false)))
    assert.equal(b.marks.has('data-fallback'), true)
    light.setPaper(true, null)
    light.setPaper(false, asCanvas(canvas()))
    assert.equal(b.marks.has('data-fallback'), false)
    light.stop()
  })
})
