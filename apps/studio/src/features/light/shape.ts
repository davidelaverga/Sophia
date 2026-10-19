// Her light's shape from its springs (docs/plans/light-room-paper.md): how large and how strong it is now, as the
// shader draws it on the dark page, and as the paper halo reads it. Pure, and imports nothing, so the shader, the
// engine and the paper halo share one set of numbers.

/**
 * While work runs she stays lit, a little narrower and three quarters as strong, with a touch of ember: busy, never out
 * (informe-25 X2: at 0.6 of her size and 0.3 of her energy the room read her as off).
 */
export const WORK = { size: 0.9, energy: 0.75, ember: 0.35 } as const

interface Shaping {
  work: number
  think: number
  speak: number
  amp: number
  swell: number
  ignite: number
}

/** How large and how strong her light is now (shader.ts's size and energy), without the page's own intensity. */
export function shapeOf(s: Shaping): { size: number; strength: number } {
  const size = (1 - (1 - WORK.size) * s.work) * (1 + 0.24 * s.amp * s.speak) * (1 + 0.16 * s.swell) * s.ignite
  const strength =
    (1 - (1 - WORK.energy) * s.work) * (1 - 0.22 * s.think) * (1 + 0.4 * s.amp * s.speak + 0.55 * s.swell)
  return { size, strength }
}

const px = (v: number) => `${String(Math.round(v))}px`
const k = (v: number) => String(Math.round(v * 100) / 100)

/** Where she is, her direction and how far she leans: what the paper orb reads beside her shape. */
interface Placing {
  x: number
  y: number
  radius: number
  dirX: number
  dirY: number
  lean: number
}

/**
 * The paper orb's properties (theme.css; docs/plans/paper-orb.md): where she is and her radius in the light's box, how
 * large and how strong she is now (never stronger than her own ink), and whom she attends to, her direction times how
 * far she leans.
 */
export function paperHalo(f: Shaping & Placing): Record<string, string> {
  const { size, strength } = shapeOf(f)
  return {
    '--lx': px(f.x),
    '--ly': px(f.y),
    '--lr': px(f.radius),
    '--ls': k(size),
    '--le': k(Math.min(1, strength)),
    '--ldx': k(f.dirX * f.lean),
    '--ldy': k(f.dirY * f.lean),
  }
}
