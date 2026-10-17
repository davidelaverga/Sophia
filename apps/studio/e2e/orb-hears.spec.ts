// What she hears moves her orb inside, never her size (docs/plans/orb-hears.md): while she listens, the voice of the one
// who holds the floor stirs her clouds and draws them toward that person, through its own slower envelope; nobody
// else's voice does, and nothing does while she speaks or under reduced motion. Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const light = (page: Page) => page.locator('.room-stage > .light')
const LISTENING = '/room.html?call=on&people=2&floor=1&sophia=listening&theme=light'

/** What she hears now (`--hear`), the orb's size, and how far her clouds are drawn sideways. */
const read = (page: Page) =>
  light(page).evaluate((el) => ({
    hear: Number(getComputedStyle(el).getPropertyValue('--hear') || 0),
    scale: parseFloat(getComputedStyle(el, '::after').scale),
    pull: Math.abs(parseFloat(getComputedStyle(el, '::before').backgroundPositionX)),
  }))

/** The highest `--hear` over 600 ms of frames. */
const peakHear = (page: Page) =>
  light(page).evaluate(
    (el) =>
      new Promise<number>((done) => {
        let max = 0
        const until = performance.now() + 600
        const step = () => {
          max = Math.max(max, Number(getComputedStyle(el).getPropertyValue('--hear') || 0))
          if (performance.now() < until) requestAnimationFrame(step)
          else done(max)
        }
        requestAnimationFrame(step)
      }),
  )

const voice = (page: Page, who: number, level: number) =>
  page.evaluate(([w, l]) => window.fixture?.voiceLevel(w, l), [who, level] as const)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('hears · while she listens, the holder’s voice stirs her inside and draws her toward them, never her size', async ({
  page,
}) => {
  await page.goto(LISTENING)
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await expect(page.locator('.presence[data-floor]')).toHaveAttribute('data-actor', MARCO)
  await voice(page, 1, 0)
  // Her light ignites on arrival (about 4 s to within 1 %) and her listening state eases in: read once both have.
  await expect
    .poll(() => light(page).evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--ls') || 0)), {
      timeout: 8000,
    })
    .toBeGreaterThanOrEqual(0.99)
  await page.waitForTimeout(1600)
  const quiet = await read(page)
  await voice(page, 1, 0.8)
  await expect.poll(async () => (await read(page)).hear, { timeout: 2000 }).toBeGreaterThanOrEqual(0.6)
  await expect.poll(async () => (await read(page)).pull, { timeout: 2000 }).toBeGreaterThan(quiet.pull + 1)
  expect(Math.abs((await read(page)).scale - quiet.scale)).toBeLessThanOrEqual(0.005)
})

test('hears · someone who doesn’t hold the floor moves nothing in her: she doesn’t hear them', async ({ page }) => {
  await page.goto(LISTENING)
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await voice(page, 2, 0.9)
  expect(await peakHear(page)).toBe(0)
})

test('hears · while she speaks, the holder’s voice moves nothing in her', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=speaking&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'speak')
  await voice(page, 1, 0.9)
  expect(await peakHear(page)).toBe(0)
})

test('hears · under reduced motion what she hears moves nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(LISTENING)
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await voice(page, 1, 0.9)
  expect(await peakHear(page)).toBe(0)
})
