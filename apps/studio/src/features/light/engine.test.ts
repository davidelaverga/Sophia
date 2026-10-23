import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LightEngine, type LightMode } from './engine.ts'

// Her light draws with WebGL in the room only (docs/plans/light-webgl-room.md). The page's pieces are stood in for: a
// canvas whose WebGL context takes every call (or refuses one check, as a GPU that can't compile the light), counts its
// frames and says whether it was given back; the light's box;
// its resize observer; the browser's frames, run when the test says; and the page's clock, which they move on.

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
/** The page's clock, in ms: it moves only with `framesFor`. */
let clock = 0
const observers = new Set<(width: number, height: number) => void>()

/** The check a context answers false, as a GPU whose compiler refuses the light's shader or its link. */
type Refused = 'getShaderParameter' | 'getProgramParameter'

function webgl(refused: Refused | null = null): Gl {
  const gl: Gl = { draws: 0, lost: false, context: {} }
  const lose = { loseContext: () => void (gl.lost = true) }
  gl.context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'getExtension') return (name: string) => (name === 'WEBGL_lose_context' ? lose : null)
        if (key === 'isContextLost') return () => gl.lost
        if (key === 'drawArrays') return () => void gl.draws++
        if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => key !== refused
        return () => ({})
      },
    },
  )
  given.push(gl)
  return gl
}

/** A canvas: one WebGL context from the first ask on (as a browser's), none on a device without WebGL. */
function canvas(hasWebgl = true, refused: Refused | null = null) {
  let gl: Gl | null = null
  return {
    width: 300,
    height: 150,
    offsetParent: {},
    gl: () => gl,
    getContext: (kind: string) => {
      // The trace's 2D context takes every call; a gradient it asks for takes its stops.
      if (kind === '2d') return new Proxy({}, { get: () => () => ({ addColorStop: () => undefined }) })
      if (kind !== 'webgl' || !hasWebgl) return null
      gl ??= webgl(refused)
      return gl.context
    },
  }
}

/** The light's box: the marks the engine sets on it, and each size the paper orb is given (`--ls`), in order. */
function box() {
  const marks = new Set<string>()
  const sizes: number[] = []
  return {
    marks,
    sizes,
    dataset: {},
    style: {
      setProperty: (name: string, value: string) => {
        if (name === '--ls') sizes.push(Number(value))
      },
    },
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

/** The browser's frames at `fps` for `seconds` of the page's clock, which each moves on before it runs. */
function framesFor(seconds: number, fps: number) {
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    clock += 1000 / fps
    runFrames(1)
  }
}

const asCanvas = (c: object) => c as unknown as HTMLCanvasElement
const asBox = (b: object) => b as unknown as HTMLElement
const engine = (b = box()) => new LightEngine(asBox(b), asCanvas(canvas()))

/** Her light on paper in an 800 × 600 room, doing `mode`; its box keeps the sizes it is given. */
function paperLight(mode: LightMode, working = false) {
  const b = box()
  const light = engine(b)
  light.setPaper(true, null)
  light.update({ mode, target: null, attention: null, working })
  resize(800, 600)
  return { light, sizes: b.sizes }
}

/** Her research finished: out of work, at rest. */
const workDone = (light: LightEngine) => light.update({ mode: 'rest', target: null, attention: null, working: false })

/** Her largest size among those given from the `from`th on. */
const largestFrom = (sizes: number[], from: number) => Math.max(...sizes.slice(from))

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
  clock = 0
  Reflect.set(performance, 'now', () => clock)
})

afterEach(() => {
  for (const name of ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'])
    Reflect.deleteProperty(globalThis, name)
  Reflect.deleteProperty(performance, 'now')
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

  // Nobody could give it back otherwise: the engine holds no renderer, and each turn to dark is a new canvas (Codex P2
  // on #454, focus-and-webgl-follow-ups.md).
  it('a light the GPU can’t compile or link gives back the context it took, and the room keeps its CSS glow', (t) => {
    t.mock.method(console, 'warn', () => undefined)
    const b = box()
    const light = engine(b)
    const shader = canvas(true, 'getShaderParameter')
    light.setPaper(false, asCanvas(shader))
    assert.equal(b.marks.has('data-fallback'), true)
    assert.equal(shader.gl()?.lost, true, 'the context its shader failed in, given back')
    light.setPaper(true, null)
    const link = canvas(true, 'getProgramParameter')
    light.setPaper(false, asCanvas(link))
    assert.equal(b.marks.has('data-fallback'), true)
    assert.equal(link.gl()?.lost, true, 'the context its program failed to link in, given back')
    assert.equal(given.length, 2)
    light.stop()
  })
})

describe('her springs keep to the clock, however few frames draw them (orb-follow-ups.md)', () => {
  it('at 8 frames a second her light reads 0.99 within 4.6 s, as at 60 (4.43 s)', () => {
    const { light, sizes } = paperLight('listen')
    framesFor(4.6, 8)
    assert.ok((sizes.at(-1) ?? 0) >= 0.99, `her size after 4.6 s: ${String(sizes.at(-1))}`)
    light.stop()
  })

  it('at 8 frames a second a result’s bloom still takes her past 1.03', () => {
    const { light, sizes } = paperLight('work', true)
    framesFor(8, 60)
    workDone(light)
    light.arrive()
    const from = sizes.length
    framesFor(1.6, 8)
    assert.ok(largestFrom(sizes, from) >= 1.03, `her largest size: ${String(largestFrom(sizes, from))}`)
    light.stop()
  })
})

/** Her light at work, lit. */
function litAtWork() {
  const at = paperLight('work', true)
  framesFor(8, 60)
  return at
}

/** The floor leaves one person for another across the room. */
const pass = (light: LightEngine) => light.handoff({ x: 100, y: 500 }, { x: 700, y: 500 })

describe('a result arriving while the floor travels blooms once it has landed (orb-follow-ups.md)', () => {
  it('a result 0.5 s into the floor’s 1.6 s flight takes her past 1.03 after the landing', () => {
    const { light, sizes } = litAtWork()
    pass(light)
    framesFor(0.5, 60)
    workDone(light)
    light.arrive()
    framesFor(1.1, 60)
    const landed = sizes.length
    framesFor(1.6, 60)
    assert.ok(largestFrom(sizes, landed) >= 1.03, `after the landing: ${String(largestFrom(sizes, landed))}`)
    light.stop()
  })

  it('a floor that leaves 0.2 s into a bloom holds it, and it plays whole after the landing', () => {
    const { light, sizes } = litAtWork()
    workDone(light)
    light.arrive()
    framesFor(0.2, 60)
    pass(light)
    framesFor(1.6, 60)
    const landed = sizes.length
    framesFor(1.6, 60)
    assert.ok(largestFrom(sizes, landed) >= 1.03, `after the landing: ${String(largestFrom(sizes, landed))}`)
    light.stop()
  })

  it('a floor that leaves 0.6 s into a bloom, once it has shown, doesn’t bring it back after the landing', () => {
    // At rest, so her size is the bloom's alone (out of work she would still be growing back to 1).
    const { light, sizes } = paperLight('rest')
    framesFor(8, 60)
    light.arrive()
    const arrived = sizes.length
    framesFor(0.6, 60)
    assert.ok(largestFrom(sizes, arrived) >= 1.03, `before the floor left: ${String(largestFrom(sizes, arrived))}`)
    pass(light)
    framesFor(1.6, 60)
    const landed = sizes.length
    framesFor(1.6, 60)
    assert.ok(largestFrom(sizes, landed) < 1.03, `after the landing: ${String(largestFrom(sizes, landed))}`)
    light.stop()
  })
})
