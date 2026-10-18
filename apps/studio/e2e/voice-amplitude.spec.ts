// Her light follows her voice (docs/plans/voice-amplitude.md): while she speaks, how loud she is now swells her light,
// read in this browser from the audio it already plays, and nothing else moves it; on paper her halo swells as the
// dark page's light does. The fixture's voices are set by hand (`window.fixture.voiceLevel`). Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'

const light = (page: Page) => page.locator('.room-stage > .light')

/** Her light's level as the engine hands it to the shader (`--amp`); unwritten, 0. */
const amp = (page: Page) => light(page).evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--amp') || 0))

/** The highest level over 400 ms of frames. */
const peak = (page: Page) =>
  light(page).evaluate(
    (el) =>
      new Promise<number>((done) => {
        let max = 0
        const until = performance.now() + 400
        const read = () => {
          max = Math.max(max, Number(getComputedStyle(el).getPropertyValue('--amp') || 0))
          if (performance.now() < until) requestAnimationFrame(read)
          else done(max)
        }
        requestAnimationFrame(read)
      }),
  )

const voice = (page: Page, who: 'sophia' | number, level: number) =>
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

test('light · her voice moves her light while she speaks, and only then', async ({ page }) => {
  await page.goto('/room.html?call=on&sophia=speaking')
  await expect(light(page)).toHaveAttribute('data-mode', 'speak')
  await voice(page, 'sophia', 0.9)
  await expect.poll(() => amp(page), { timeout: 1000 }).toBeGreaterThanOrEqual(0.85)
  await voice(page, 'sophia', 0)
  await expect.poll(() => amp(page), { timeout: 2000 }).toBe(0)
  // Listening, her voice moves nothing: a level heard then is not hers to show.
  await page.evaluate(() => window.fixture?.sophia('listening'))
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await voice(page, 'sophia', 0.9)
  expect(await peak(page)).toBeLessThanOrEqual(0.01)
})

test('light · on paper her halo swells with her voice, as the dark page’s light does', async ({ page }) => {
  await page.goto('/room.html?call=on&sophia=speaking&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'speak')
  const size = () => light(page).evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--ls') || 0))
  // Her light ignites on arrival (a slow spring, about 4 s to within 1 %): read once it has.
  await expect.poll(size, { timeout: 8000 }).toBeGreaterThanOrEqual(0.99)
  await voice(page, 'sophia', 0.9)
  await expect.poll(size, { timeout: 1000 }).toBeGreaterThanOrEqual(1.18)
  await voice(page, 'sophia', 0)
  await expect.poll(size, { timeout: 2000 }).toBeLessThanOrEqual(1)
})

test('motion · under reduced motion her voice moves nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/room.html?call=on&sophia=speaking')
  await expect(light(page)).toHaveAttribute('data-mode', 'speak')
  await voice(page, 'sophia', 0.9)
  expect(await peak(page)).toBe(0)
})
