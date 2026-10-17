import { expect, test, type Page } from '@playwright/test'
import { violetPeak } from './pixels.ts'

// Her light on paper follows the engine (docs/plans/light-room-paper.md; informe-25 X1): in a video call her orb sits
// in her tile, as the canvas's light does on the dark page, and its size and strength follow her state
// (docs/plans/paper-orb.md). Every name is synthetic.

const VIDEO = '/room.html?call=on&people=4&video=camera&theme=light'
const tileOf = (page: Page) => page.locator('[data-sophia-tile]')

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

/** The gallery's most violet point, in CSS pixels of the page, and whether it lies inside her tile (2 px in). */
async function peakInHerTile(page: Page) {
  const gallery = await page.locator('.gallery').boundingBox()
  const tile = await tileOf(page).boundingBox()
  if (!gallery || !tile) return { inside: false, value: 0, at: 'not drawn' }
  const scale = await page.evaluate(() => devicePixelRatio)
  const peak = await violetPeak(page, await page.screenshot({ clip: gallery, animations: 'disabled' }))
  const x = gallery.x + peak.x / scale
  const y = gallery.y + peak.y / scale
  const inside = x > tile.x + 2 && x < tile.x + tile.width - 2 && y > tile.y + 2 && y < tile.y + tile.height - 2
  return { inside, value: peak.value, at: `${x.toFixed(0)},${y.toFixed(0)} vs tile ${JSON.stringify(tile)}` }
}

test('light · in a video call on paper her halo sits in her tile: the gallery’s most violet point is inside it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(VIDEO)
  await expect(tileOf(page)).toBeVisible()
  await expect.poll(() => peakInHerTile(page).then((p) => p.inside), { timeout: 5000 }).toBe(true)
  expect((await peakInHerTile(page)).value).toBeGreaterThanOrEqual(30)
})

test('@phone · light · in a video call on paper her halo sits in her tile, on a phone', async ({ page }) => {
  await page.goto(VIDEO)
  await expect(tileOf(page)).toBeVisible()
  await expect.poll(() => peakInHerTile(page).then((p) => p.inside), { timeout: 5000 }).toBe(true)
})

test('light · the room’s paper orb follows the light the engine draws: its centre, its size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(VIDEO)
  await expect(tileOf(page)).toBeVisible()
  const read = () =>
    page.evaluate(() => {
      const light = document.querySelector<HTMLElement>('.room-stage > .light')
      const tile = document.querySelector('[data-sophia-tile]')
      if (!light || !tile) return null
      const box = light.getBoundingClientRect()
      const t = tile.getBoundingClientRect()
      const s = getComputedStyle(light)
      const num = (name: string) => parseFloat(s.getPropertyValue(name))
      return {
        dx: Math.abs(num('--lx') - (t.left + t.width / 2 - box.left)),
        dy: Math.abs(num('--ly') - (t.top + t.height / 2 - box.top)),
        dr: Math.abs(num('--lr') - 0.56 * Math.min(t.width, t.height)),
        lr: num('--lr'),
      }
    })
  await expect
    .poll(async () => {
      const r = await read()
      return r !== null && r.dx <= 1 && r.dy <= 1 && r.dr <= 1
    })
    .toBe(true)
  // The orb stands at her centre, 0.6 of her radius across times her size now (paper-orb.md).
  const orb = await page.evaluate(() => {
    const light = document.querySelector<HTMLElement>('.room-stage > .light')
    if (!light) return null
    const glass = getComputedStyle(light, '::after')
    const s = getComputedStyle(light)
    const [x = Number.NaN, y = Number.NaN] = glass.translate.split(' ').map((v) => parseFloat(v))
    return {
      dx: Math.abs(x - parseFloat(s.getPropertyValue('--lx'))),
      dy: Math.abs(y - parseFloat(s.getPropertyValue('--ly'))),
      across: parseFloat(glass.width) * parseFloat(glass.scale),
      want: 0.6 * parseFloat(s.getPropertyValue('--lr')) * Math.min(parseFloat(s.getPropertyValue('--ls')), 1.2),
    }
  })
  expect(orb?.dx).toBeLessThanOrEqual(1)
  expect(orb?.dy).toBeLessThanOrEqual(1)
  expect(Math.abs((orb?.across ?? 0) - (orb?.want ?? Number.NaN))).toBeLessThanOrEqual(1)
})

// Her state on paper: how large (the orb's scale over her radius's) and how strong (the inner light's saturation,
// 0.72 + 0.28 of her strength; paper-orb.md).
for (const [query, mode, size, strength] of [
  ['', 'rest', 1, 1],
  ['&research=running', 'work', 0.9, 0.93],
  ['&call=on&people=2&floor=1&sophia=answering', 'think', 1, 0.94],
] as const) {
  test(`light · on paper, ${mode}: the orb’s size ${String(size)} and strength ${String(strength)}`, async ({
    page,
  }) => {
    await page.goto(`/room.html?theme=light${query}`)
    const light = page.locator('.room-stage > .light')
    await expect(light).toHaveAttribute('data-mode', mode)
    await expect
      .poll(() =>
        light.evaluate((el) => {
          const k = (3 * parseFloat(getComputedStyle(el).getPropertyValue('--lr'))) / 1000
          const scale = parseFloat(getComputedStyle(el, '::after').scale)
          const saturate = Number(/saturate\(([\d.]+)\)/.exec(getComputedStyle(el, '::before').filter)?.[1])
          return { size: Math.round((scale / k) * 100) / 100, strength: Math.round(saturate * 100) / 100 }
        }),
      )
      .toEqual({ size, strength })
  })
}
