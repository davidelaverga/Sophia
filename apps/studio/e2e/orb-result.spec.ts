// A result arriving blooms her orb once (docs/plans/orb-result.md): when work she was doing finishes, she swells a little
// and settles; never for what was already finished, nor under reduced motion. Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'
import { slowFramesFromNow } from './frames.ts'

const light = (page: Page) => page.locator('.room-stage > .light')

/** Her size now (`--ls`), and its highest over the next 1.6 s of frames. */
const size = (page: Page) => light(page).evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--ls') || 0))
const peakSize = (page: Page) =>
  light(page).evaluate(
    (el) =>
      new Promise<number>((done) => {
        let max = 0
        const until = performance.now() + 1600
        const step = () => {
          max = Math.max(max, Number(getComputedStyle(el).getPropertyValue('--ls') || 0))
          if (performance.now() < until) requestAnimationFrame(step)
          else done(max)
        }
        requestAnimationFrame(step)
      }),
  )

/** Her highest size over the frames between `from` and `to` of the page's clock (ms). */
const peakBetween = (page: Page, from: number, to: number) =>
  light(page).evaluate(
    (el, [start, end]) =>
      new Promise<number>((done) => {
        let max = 0
        const step = () => {
          const now = performance.now()
          if (now >= start) max = Math.max(max, Number(getComputedStyle(el).getPropertyValue('--ls') || 0))
          if (now < end) requestAnimationFrame(step)
          else done(max)
        }
        requestAnimationFrame(step)
      }),
    [from, to] as const,
  )

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('result · when her research finishes, she blooms once, then rests', async ({ page }) => {
  await page.goto('/room.html?research=running&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'work')
  // Her light ignites on arrival (at work, 0.9 of her size reads after 5.35 s): read her working size once it has.
  await expect.poll(() => size(page), { timeout: 8000 }).toBe(0.9)
  const peak = peakSize(page)
  await page.evaluate(() => window.fixture?.researchDone())
  // Out of work she grows back to 1; the bloom takes her past it, and she settles.
  expect(await peak).toBeGreaterThanOrEqual(1.03)
  await expect.poll(() => size(page), { timeout: 3000 }).toBe(1)
})

test('result · on a slow machine (8 frames a second) she still blooms once, then rests', async ({ page }) => {
  await page.goto('/room.html?research=running&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'work')
  await expect.poll(() => size(page), { timeout: 8000 }).toBe(0.9)
  // 0.9 is read from 0.994 of her light on: a second more lights her to within a thousandth, then the frames slow.
  await page.waitForTimeout(1000)
  await slowFramesFromNow(page)
  const peak = peakSize(page)
  await page.evaluate(() => window.fixture?.researchDone())
  expect(await peak).toBeGreaterThanOrEqual(1.03)
  await expect.poll(() => size(page), { timeout: 3000 }).toBe(1)
})

test('result · arriving while the floor passes, she blooms once it has landed', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=me&research=running&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'work')
  await expect.poll(() => size(page), { timeout: 8000 }).toBe(0.9)
  await page.getByRole('button', { name: 'Pass to…' }).click()
  const passed = await page.evaluate(() => performance.now())
  await page.getByRole('menuitem', { name: 'Lucía' }).click()
  await page.evaluate(() => window.fixture?.researchDone())
  // The floor leaves at once and lands 1.6 s later: her size from then on.
  expect(await peakBetween(page, passed + 1700, passed + 3400)).toBeGreaterThanOrEqual(1.03)
})

test('result · under reduced motion a result arriving doesn’t move her', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/room.html?research=running&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'work')
  const peak = peakSize(page)
  await page.evaluate(() => window.fixture?.researchDone())
  expect(await peak).toBeLessThanOrEqual(1)
})
