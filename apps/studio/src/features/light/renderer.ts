// WebGL for the light, outside React. It renders below display resolution (the light is soft) and a
// slow device steps the resolution down further, so motion stays fluid. Without WebGL it returns null
// and the Studio keeps a CSS glow.
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shader.ts'

export interface LightFrame {
  time: number
  /** Center and radius in CSS pixels of the canvas box, y downward. */
  x: number
  y: number
  radius: number
  /** Where she leans, as a direction with length up to 1 (y downward). */
  dirX: number
  dirY: number
  intensity: number
  listen: number
  think: number
  speak: number
  work: number
  amp: number
  swell: number
  lean: number
  flow: number
  ignite: number
}

const SCALARS = [
  'time',
  'intensity',
  'listen',
  'think',
  'speak',
  'work',
  'amp',
  'swell',
  'lean',
  'flow',
  'ignite',
] as const
const UNIFORMS = [...SCALARS, 'center', 'dir', 'radius', 'reduced', 'halo', 'core', 'cool', 'ember'] as const
type UniformName = (typeof UNIFORMS)[number]

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

export interface LightRenderer {
  resize: (width: number, height: number) => void
  draw: (frame: LightFrame) => void
  /** Render at a lower resolution; false once it cannot go lower. */
  degrade: () => boolean
  dispose: () => void
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('WebGL could not create a shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
  return shader
}

/** Compiles the light, binds one full-screen triangle and sets the colors that never change. */
function setUp(gl: WebGLRenderingContext, reduced: boolean): (name: UniformName) => WebGLUniformLocation | null {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link')
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const locations = new Map(UNIFORMS.map((n) => [n, gl.getUniformLocation(program, `u_${n}`)]))
  const at = (name: UniformName) => locations.get(name) ?? null
  gl.uniform3fv(at('halo'), rgb('#9c82f5'))
  gl.uniform3fv(at('core'), rgb('#f7f4ff'))
  gl.uniform3fv(at('cool'), rgb('#7486f5'))
  gl.uniform3fv(at('ember'), rgb('#6a4bb6'))
  gl.uniform1f(at('reduced'), reduced ? 1 : 0)
  return at
}

export function createLightRenderer(canvas: HTMLCanvasElement, reduced: boolean): LightRenderer | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
  if (!gl) return null
  let at: (name: UniformName) => WebGLUniformLocation | null
  try {
    at = setUp(gl, reduced)
  } catch (err: unknown) {
    console.warn('Sophia light: WebGL unavailable, keeping the CSS glow.', err)
    return null
  }
  let quality = 0.55
  let scale = 1
  let size = { width: 1, height: 1 }
  const resize = (width: number, height: number) => {
    size = { width, height }
    scale = Math.min(window.devicePixelRatio || 1, 2) * quality
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  const draw = (f: LightFrame) => {
    if (gl.isContextLost()) return
    gl.uniform2f(at('center'), f.x * scale, (size.height - f.y) * scale)
    gl.uniform2f(at('dir'), f.dirX, -f.dirY)
    gl.uniform1f(at('radius'), Math.max(1, f.radius * scale))
    for (const name of SCALARS) gl.uniform1f(at(name), f[name])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  return {
    resize,
    draw,
    degrade: () => {
      if (quality <= 0.3) return false
      quality = Math.max(0.3, quality * 0.85)
      resize(size.width, size.height)
      return true
    },
    // The context stays with its canvas: React may mount the same canvas again (StrictMode, fast refresh),
    // and a lost context could not draw there. The browser frees it with the canvas.
    dispose: () => gl.bindBuffer(gl.ARRAY_BUFFER, null),
  }
}
