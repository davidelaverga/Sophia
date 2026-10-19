import type { Page } from '@playwright/test'

// Reading a screenshot's pixels in the page (docs/plans/light-room-paper.md): decoded as an image, never fetched (the
// room's fixture answers every fetch itself), and measured there, so only the answer crosses back.

/** The most violet point of a PNG (the largest blue over the larger of red and green), in its own pixels. */
export function violetPeak(page: Page, png: Buffer): Promise<{ x: number; y: number; value: number }> {
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { x: -1, y: -1, value: -1 }
    ctx.drawImage(image, 0, 0)
    const px = ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data
    let best = { x: -1, y: -1, value: -Infinity }
    for (let i = 0; i < px.length; i += 4) {
      const value = (px[i + 2] ?? 0) - Math.max(px[i] ?? 0, px[i + 1] ?? 0)
      if (value > best.value)
        best = { x: (i / 4) % image.naturalWidth, y: Math.floor(i / 4 / image.naturalWidth), value }
    }
    return best
  }, png.toString('base64'))
}

/**
 * Her light in a PNG of its box, at (cx, cy) in its own pixels: the core (the brightest relative luminance within 4 px)
 * and the halo (how far to the right the mean of 5 px stays at 0.01 or more), both in those pixels.
 */
export function lightAt(page: Page, png: Buffer, cx: number, cy: number): Promise<{ core: number; halo: number }> {
  return page.evaluate(
    async ({ data, x, y }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const w = image.naturalWidth
      const canvas = new OffscreenCanvas(w, image.naturalHeight)
      const ctx = canvas.getContext('2d')
      if (!ctx) return { core: -1, halo: -1 }
      ctx.drawImage(image, 0, 0)
      const px = ctx.getImageData(0, 0, w, image.naturalHeight).data
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
      const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      const lum = (i: number) =>
        0.2126 * lin((px[i] ?? 0) / 255) + 0.7152 * lin((px[i + 1] ?? 0) / 255) + 0.0722 * lin((px[i + 2] ?? 0) / 255)
      const at = (a: number, b: number) => lum((Math.round(b) * w + Math.round(a)) * 4)
      let core = 0
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) core = Math.max(core, at(x + dx, y + dy))
      let halo = 0
      while (x + halo + 5 < w && [0, 1, 2, 3, 4].reduce((sum, d) => sum + at(x + halo + d, y), 0) / 5 >= 0.01) halo += 1
      return { core, halo }
    },
    { data: png.toString('base64'), x: cx, y: cy },
  )
}
