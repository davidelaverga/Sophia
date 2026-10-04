// Umbral in the Studio (docs/plans/brand-umbral.md): the mark beside the word, on its centre line; its two halves
// apart by a whole pixel at 16; Sophia's halo brighter while live, and not animated under reduced motion.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/brand.html'

/** A box's vertical centre. */
const centre = (b: { y: number; height: number } | null) => (b?.y ?? 0) + (b?.height ?? 0) / 2

/** The alpha of one column of a mark drawn at `size` px on a canvas, top to bottom. */
const column = (page: Page, size: number, x: number) =>
  page.evaluate(
    async ({ size: s, x: at }) => {
      const svg = document.querySelector(`[data-size="${String(s)}"] svg`)
      if (!svg) return []
      const copy = svg.cloneNode(true)
      if (!(copy instanceof SVGSVGElement)) return []
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      // Drawn in two solid inks, as the paths are: the computed fills don't travel into an image.
      copy.querySelectorAll('path').forEach((p) => p.setAttribute('fill', '#000'))
      const image = new Image(s, s)
      image.src = `data:image/svg+xml,${encodeURIComponent(copy.outerHTML)}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = s
      canvas.height = s
      const context = canvas.getContext('2d')
      if (!context) return []
      context.drawImage(image, 0, 0, s, s)
      const { data } = context.getImageData(at, 0, 1, s)
      return [...data].filter((_, i) => i % 4 === 3)
    },
    { size, x },
  )

test('brand · the sign-in screen carries Umbral beside the word, on its centre line', async ({ page }) => {
  await page.goto(PAGE)
  const mark = page.locator('.screen-mark [data-mark="umbral"]')
  const word = page.locator('.screen-mark .mark-word')
  await expect(mark).toBeVisible({ timeout: 15_000 })
  await expect(mark).toHaveAttribute('width', '16')
  const [m, w] = await Promise.all([mark.boundingBox(), word.boundingBox()])
  expect(Math.abs(centre(m) - centre(w)), `mark ${String(centre(m))}, word ${String(centre(w))}`).toBeLessThanOrEqual(1)
})

test('brand · at 16 px the two halves stand a whole pixel apart, each side of it inked', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.locator('[data-size="16"] svg')).toBeVisible({ timeout: 15_000 })
  // On the 48 grid: you end at x = 30, Sophia starts at 33; at 16 px, columns 0–9 and 11–15, column 10 between.
  const gap = await column(page, 16, 10)
  expect(
    gap.every((a) => a === 0),
    gap.join(' '),
  ).toBe(true)
  expect(Math.max(...(await column(page, 16, 9)))).toBeGreaterThan(200)
  expect(Math.max(...(await column(page, 16, 11)))).toBeGreaterThan(200)
})

test('brand · Sophia’s halo is brighter while live; yours never glows', async ({ page }) => {
  await page.goto(PAGE)
  const filter = (size: string, half: string) =>
    page.locator(`[data-size="${size}"] .umbral-${half}`).evaluate((p) => getComputedStyle(p).filter)
  await expect(page.locator('[data-size="48-live"] svg')).toHaveAttribute('data-live', 'true')
  expect(await filter('48-live', 'sophia')).not.toBe(await filter('48', 'sophia'))
  expect(await filter('48', 'you')).toBe('none')
  expect(await filter('48-live', 'you')).toBe('none')
})

test('brand · the halo’s change is not animated under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(PAGE)
  const sophia = page.locator('[data-size="48"] .umbral-sophia')
  await expect(sophia).toBeVisible({ timeout: 15_000 })
  expect(await sophia.evaluate((p) => getComputedStyle(p).transitionProperty)).toBe('none')
})

test('brand · the project’s bar carries Umbral at 16, live with its feed, on the word’s centre line', async ({
  page,
}) => {
  await page.goto('/room.html')
  const mark = page.locator('.topbar .mark [data-mark="umbral"]')
  await expect(mark).toBeVisible({ timeout: 15_000 })
  await expect(mark).toHaveAttribute('data-live', 'true')
  // The size whose cuts land on whole pixels (the check above measures this one).
  await expect(mark).toHaveAttribute('width', '16')
  const [m, w] = await Promise.all([mark.boundingBox(), page.locator('.topbar .mark .mark-word').boundingBox()])
  expect(Math.abs(centre(m) - centre(w))).toBeLessThanOrEqual(1)
})
