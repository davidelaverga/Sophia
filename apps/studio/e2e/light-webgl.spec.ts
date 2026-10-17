import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Her light draws with WebGL in the room only (docs/plans/light-webgl-room.md): on paper the light is CSS and holds no
// WebGL context; in the room it holds one and draws there; turned paper it gives that context back, and turned dark
// again it takes a new one, drawn at the box's size.

declare global {
  interface Window {
    /** Every WebGL context a light's canvas was given, and the frames drawn in each. */
    lightGl?: { contexts: WebGLRenderingContext[]; draws: Map<WebGLRenderingContext, number> }
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.addInitScript(() => {
    const kept = { contexts: [] as WebGLRenderingContext[], draws: new Map<WebGLRenderingContext, number>() }
    window.lightGl = kept
    const get: unknown = Reflect.get(HTMLCanvasElement.prototype, 'getContext')
    const draw: unknown = Reflect.get(WebGLRenderingContext.prototype, 'drawArrays')
    if (typeof get !== 'function' || typeof draw !== 'function') return
    Reflect.set(HTMLCanvasElement.prototype, 'getContext', function (this: HTMLCanvasElement, ...args: unknown[]) {
      const context: unknown = Reflect.apply(get, this, args)
      const light = this.classList.contains('light-gl')
      if (light && context instanceof WebGLRenderingContext && !kept.contexts.includes(context))
        kept.contexts.push(context)
      return context
    })
    Reflect.set(WebGLRenderingContext.prototype, 'drawArrays', function (this: WebGLRenderingContext, ...a: unknown[]) {
      kept.draws.set(this, (kept.draws.get(this) ?? 0) + 1)
      Reflect.apply(draw, this, a)
    })
  })
})

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

/**
 * The light's WebGL as the page holds it now: the contexts given and those still live; the last one's frames; and its
 * canvas's scale against the box's display pixels, on each axis.
 */
const glRead = (page: Page) =>
  page.evaluate(() => {
    const contexts = window.lightGl?.contexts ?? []
    const last = contexts.at(-1)
    const canvas = document.querySelector<HTMLCanvasElement>('.light-gl')
    const box = canvas?.parentElement
    const pixels = Math.min(window.devicePixelRatio || 1, 2)
    return {
      given: contexts.length,
      live: contexts.filter((c) => !c.isContextLost()).length,
      lastDraws: last ? (window.lightGl?.draws.get(last) ?? 0) : 0,
      scaleX: canvas && box ? canvas.width / (box.clientWidth * pixels) : 0,
      scaleY: canvas && box ? canvas.height / (box.clientHeight * pixels) : 0,
    }
  })

/** The renderer's qualities: 0.55, stepped down by 0.85 on a slow device, never under 0.3 (renderer.ts). */
const QUALITIES = [0.55, 0.4675, 0.397375, 0.33776875, 0.3]
const qualityOf = (scale: number) => QUALITIES.find((q) => Math.abs(scale - q) < 0.006) ?? null

/**
 * The light draws in its last context at the box's size: new frames counted, and the canvas at one of the renderer's
 * qualities on both axes (a canvas never sized keeps the browser's 300×150).
 */
async function drawsAtSize(page: Page) {
  const before = (await glRead(page)).lastDraws
  await expect.poll(async () => (await glRead(page)).lastDraws).toBeGreaterThan(before)
  const read = await glRead(page)
  expect(qualityOf(read.scaleX), `${String(read.scaleX)} × ${String(read.scaleY)}`).not.toBeNull()
  expect(qualityOf(read.scaleY)).toBe(qualityOf(read.scaleX))
}

for (const [name, url, parts] of [
  ['sign-in', '/signin.html?theme=light', DRAWN.signin],
  ['Home', '/home.html?demo=1&theme=light', DRAWN.home],
  ['the room', '/room.html?demo=1&theme=light', DRAWN.room],
] as const) {
  test(`light · ${name}: on paper her light holds no WebGL context`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await expect(page.locator('.light').first()).toBeAttached()
    // A few of the light's frames run on paper, as they do (the trace, the springs).
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    expect(await glRead(page)).toMatchObject({ given: 0, live: 0 })
  })
}

test('the room: her light holds one WebGL context and draws in it, at the box’s size', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect.poll(async () => (await glRead(page)).given).toBe(1)
  expect((await glRead(page)).live).toBe(1)
  await drawsAtSize(page)
})

test('light · turned paper the light gives its context back; turned dark it takes a new one and draws there', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect.poll(async () => (await glRead(page)).live).toBe(1)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(async () => (await glRead(page)).live).toBe(0)
  expect((await glRead(page)).given).toBe(1)
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await expect.poll(async () => (await glRead(page)).given).toBe(2)
  expect((await glRead(page)).live).toBe(1)
  // Its box kept its size, so nothing resized it: the new canvas was sized as it arrived.
  await drawsAtSize(page)
})
