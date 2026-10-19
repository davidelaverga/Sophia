import { expect, test, type Page } from '@playwright/test'
import { lightAt } from './pixels.ts'

// Busy, never out (docs/plans/light-room-paper.md; informe-25 X2): with work running, the room's most-seen state, her
// light on the dark page keeps its heart and its reach, a little narrower than at rest. Rest is the control.

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Her light's heart and reach, read from a capture of its box at her centre (the middle, 42 % down). */
async function lightRead(page: Page) {
  const light = page.locator('.room-stage > .light')
  const box = await light.boundingBox()
  if (!box) return { core: 0, halo: 0 }
  const scale = await page.evaluate(() => devicePixelRatio)
  const png = await page.screenshot({ clip: box, animations: 'disabled' })
  const read = await lightAt(page, png, (box.width / 2) * scale, box.height * 0.42 * scale)
  return { core: read.core, halo: read.halo / scale }
}

for (const [name, url, mode, core, halo] of [
  ['while work runs', '/room.html?research=running', 'work', 0.45, 160],
  ['at rest (the control)', '/room.html', 'rest', 0.55, 200],
] as const) {
  test(`light · ${name}, her light keeps its heart and its reach`, async ({ page }) => {
    await page.goto(url)
    const light = page.locator('.room-stage > .light')
    await expect(light).toHaveAttribute('data-mode', mode)
    // Drawn by WebGL, not the fallback radial.
    expect(await light.evaluate((el) => el.hasAttribute('data-fallback'))).toBe(false)
    await expect.poll(async () => (await lightRead(page)).core).toBeGreaterThanOrEqual(core)
    expect((await lightRead(page)).halo).toBeGreaterThanOrEqual(halo)
  })
}
