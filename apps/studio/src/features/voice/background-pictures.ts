// Sophia's lights as camera backgrounds (docs/plans/call-backgrounds.md): gradients drawn in the browser, once each, as
// a picture URL the processor reads. Nothing to ship or license; the room's own colours, a light low in the frame.
import type { PictureId } from './background-preference.ts'

/** Each light: the sky's two colours and where its glow sits. */
const LIGHTS: Record<PictureId, { top: string; bottom: string; glow: string; at: [number, number] }> = {
  dusk: { top: '#1a1030', bottom: '#3b1d4a', glow: 'rgba(255, 196, 160, 0.55)', at: [0.7, 0.75] },
  deep: { top: '#05060d', bottom: '#141a33', glow: 'rgba(170, 160, 255, 0.45)', at: [0.5, 0.6] },
  dawn: { top: '#2a2f4f', bottom: '#d9a38f', glow: 'rgba(255, 236, 210, 0.6)', at: [0.3, 0.8] },
}

const drawn = new Map<PictureId, string>()

/** The light's picture, 1280 by 720, drawn on first use and kept for the page's life. */
export function backgroundPicture(id: PictureId): string {
  const kept = drawn.get(id)
  if (kept) return kept
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const paint = canvas.getContext('2d')
  if (paint) {
    const light = LIGHTS[id]
    const sky = paint.createLinearGradient(0, 0, 0, 720)
    sky.addColorStop(0, light.top)
    sky.addColorStop(1, light.bottom)
    paint.fillStyle = sky
    paint.fillRect(0, 0, 1280, 720)
    const [x, y] = [light.at[0] * 1280, light.at[1] * 720]
    const glow = paint.createRadialGradient(x, y, 0, x, y, 520)
    glow.addColorStop(0, light.glow)
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    paint.fillStyle = glow
    paint.fillRect(0, 0, 1280, 720)
  }
  const url = canvas.toDataURL('image/png')
  drawn.set(id, url)
  return url
}
