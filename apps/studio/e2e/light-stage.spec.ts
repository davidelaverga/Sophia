// The room as lit paper (docs/plans/light-stage.md): in light the stage carries a soft field of the halo over a warm
// vignette behind the light, and the floor's role reads at 4.5:1 or more; in the dark room neither is added.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const CALL = '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening'

const stageRead = (page: Page) =>
  page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.room-stage')
    const light = stage?.querySelector<HTMLElement>(':scope > .light') ?? null
    const role = document.querySelector<HTMLElement>('.presence[data-floor] .role')
    const before = stage ? getComputedStyle(stage, '::before') : null
    return {
      field: before?.backgroundImage ?? '',
      fieldZ: before?.zIndex ?? '',
      lightZ: light ? getComputedStyle(light).zIndex : null,
      role: role ? getComputedStyle(role).color : null,
      paper: getComputedStyle(document.body).backgroundColor,
    }
  })

const channel = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = (s: string) => {
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s)
  return m ? 0.2126 * channel(Number(m[1])) + 0.7152 * channel(Number(m[2])) + 0.0722 * channel(Number(m[3])) : 0
}
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

test('light · the room in a call: lit paper behind the light, the floor’s role at 4.5:1 or more', async ({ page }) => {
  await page.goto(`${CALL}&theme=light`)
  await drawn(page, DRAWN.room.slice(0, 1))
  const read = await stageRead(page)
  expect(read.field).toMatch(/^radial-gradient\(80% 70% at 50% [\d.]+px, rgba\(109, 91, 208, 0\.06\)/)
  expect(read.field).toContain('rgba(150, 83, 40, 0.05)')
  expect(read.fieldZ).toBe('0')
  expect(read.lightZ).toBe('1')
  expect(read.role).toBe('rgb(150, 83, 40)')
  expect(ratio(read.role ?? '', read.paper)).toBeGreaterThanOrEqual(4.5)
})

test('the room in a call: no field under the stage, the floor’s role the warm at 0.85', async ({ page }) => {
  await page.goto(CALL)
  await drawn(page, DRAWN.room.slice(0, 1))
  const read = await stageRead(page)
  expect(read.field).toBe('none')
  expect(read.role).toBe('rgba(241, 220, 199, 0.85)')
})

test('light · the warm vignette reaches the stage’s edges, as drawn (Codex on #252)', async ({ page }) => {
  await page.goto(`${CALL}&theme=light`)
  await drawn(page, DRAWN.room.slice(0, 1))
  // The vignette alone: the stage's parts hidden, the field's first layer (the halo's) taken off.
  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.room-stage')
    if (!stage) return
    const layers = getComputedStyle(stage, '::before').backgroundImage
    const vignette = layers.slice(layers.indexOf('radial-gradient', 1))
    const style = document.createElement('style')
    style.textContent = `.room-stage > * { visibility: hidden !important } .room-stage::before { background: ${vignette} !important }`
    document.head.append(style)
  })
  const stage = page.locator('.room-stage')
  const png = (await stage.screenshot()).toString('base64')
  const read = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const at = (x: number, y: number) =>
      Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3))
    return {
      centre: at(img.naturalWidth / 2, img.naturalHeight / 2),
      edge: at(1, img.naturalHeight / 2),
      top: at(img.naturalWidth / 2, 1),
    }
  }, png)
  expect(read).not.toBeNull()
  // The warm darkens and warms the paper at an edge's midpoint (blue falls most); the centre is untouched.
  const warmer = (px: number[]) => (read?.centre[2] ?? 0) - (px[2] ?? 0)
  expect(warmer(read?.edge ?? [])).toBeGreaterThanOrEqual(4)
  expect(warmer(read?.top ?? [])).toBeGreaterThanOrEqual(4)
})
