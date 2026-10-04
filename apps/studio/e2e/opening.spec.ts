// The opening (docs/plans/entry-opening.md): once, on the way in, from signing in to the app. Its page is the
// Studio's own index.html with the app's part played by fixtures/opening.tsx, so these checks see what ships.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/opening.html'
/** Work's order: the project whose session starts soon leads, then the newest. Design review (3) is not warmed. */
const LIKELIEST = ['4', '1', '2'].map((n) => `00000000-0000-4000-8000-00000000000${n}`)
const COLD = '00000000-0000-4000-8000-000000000003'

interface Watch {
  /** Each frame: the page's clock, whether the opening is up, its bar, its words. */
  frames: { t: number; up: boolean; fill: number; said: string; flying: number }[]
}

declare global {
  interface Window {
    openingWatch?: Watch
  }
}

/** Every frame of the page, from the first: what the opening shows. */
async function watch(page: Page) {
  await page.addInitScript(() => {
    const seen: Watch = { frames: [] }
    window.openingWatch = seen
    const look = () => {
      const entry = document.getElementById('entry')
      const fill = entry?.querySelector('.entry-fill')
      if (entry && fill) {
        seen.frames.push({
          t: performance.now(),
          up: getComputedStyle(entry).display !== 'none',
          fill: new DOMMatrix(getComputedStyle(fill).transform).a,
          said: entry.querySelector('.entry-step')?.textContent ?? '',
          // The lockup's own moves (its flight, its dissolve), not its arrival's stylesheet.
          flying:
            entry
              .querySelector('.entry-lockup')
              ?.getAnimations({ subtree: true })
              .filter((a) => !(a instanceof CSSAnimation) && a.playState === 'running').length ?? 0,
        })
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
}

const frames = (page: Page) => page.evaluate(() => window.openingWatch?.frames ?? [])
const up = (page: Page) => page.locator('#entry').evaluate((e) => getComputedStyle(e).display !== 'none')

/** The likeliest projects' reads, answered as the API would refuse them, and counted. */
async function countWarmReads(page: Page): Promise<string[]> {
  const asked: string[] = []
  await page.route('**/api/v1/projects/*/*', (route) => {
    asked.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"unavailable"}' })
  })
  return asked
}

test('opening · a page that is no sign-in’s return never shows it', async ({ page }) => {
  await watch(page)
  await page.goto(PAGE)
  await expect(page.getByRole('heading', { name: 'Sign in to Sophia' })).toBeVisible()
  await page.waitForTimeout(600)
  expect((await frames(page)).some((f) => f.up)).toBe(false)
})

test('opening · a sign-in’s return shows it from the first frame, before the app runs', async ({ page }) => {
  const held = Promise.withResolvers<void>()
  await page.route('**/opening.tsx*', async (route) => {
    await held.promise
    await route.continue()
  })
  await watch(page)
  await page.goto(`${PAGE}?code=returned`, { waitUntil: 'commit' })
  // No script of the app has run yet: the page's own entry.js and entry.css show it, from its first frame.
  await expect.poll(async () => (await frames(page)).length).toBeGreaterThan(0)
  expect((await frames(page))[0]?.up).toBe(true)
  await expect(page.locator('#entry .entry-word svg path').first()).toBeAttached()
  held.resolve()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('opening · says its work as it does it, warms the likeliest projects, then lands in the corner', async ({
  page,
}) => {
  const asked = await countWarmReads(page)
  await watch(page)
  await page.goto(`${PAGE}?code=returned`)
  await expect.poll(() => up(page), { timeout: 10_000 }).toBe(false)
  const seen = await frames(page)
  const said = seen.filter((f) => f.up).map((f) => f.said)
  const order = ['Signing you in', 'Opening your space', 'Getting your projects ready', 'Ready']
  expect([...new Set(said)]).toEqual(order)
  // Each one reads: its words stay at least 0.4 s, however fast the work went.
  for (const words of order.slice(0, -1)) {
    const when = seen.filter((f) => f.up && f.said === words).map((f) => f.t)
    expect(Math.max(...when) - Math.min(...when), words).toBeGreaterThan(400)
  }
  // The arrival lands whole before it leaves.
  const shown = seen.filter((f) => f.up).map((f) => f.t)
  expect(Math.max(...shown) - Math.min(...shown)).toBeGreaterThan(2200)
  // Each project Work shows first, its snapshot and its membership; the fourth is not warmed.
  for (const id of LIKELIEST) {
    expect(asked).toContain(`/api/v1/projects/${id}/snapshot`)
    expect(asked).toContain(`/api/v1/projects/${id}/membership`)
  }
  expect(asked.some((path) => path.includes(COLD))).toBe(false)
  expect(asked).toHaveLength(LIKELIEST.length * 2) // a read refused is not asked again
  await expect(page.locator('.topbar .mark')).toBeVisible()
})

test('opening · its bar only moves forward, a little each frame, and is full before it leaves', async ({ page }) => {
  await countWarmReads(page)
  await watch(page)
  await page.goto(`${PAGE}?code=returned`)
  await expect.poll(() => up(page), { timeout: 10_000 }).toBe(false)
  const fills = (await frames(page)).filter((f) => f.up).map((f) => f.fill)
  const steps = fills.slice(1).map((fill, i) => fill - (fills[i] ?? fill))
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...steps)).toBeLessThan(0.1)
  expect(Math.max(...fills)).toBeGreaterThan(0.99)
})

test('opening · Home’s reads hold it, 5 s at most', async ({ page }) => {
  await countWarmReads(page)
  await watch(page)
  await page.goto(`${PAGE}?code=returned&reads=30000`)
  // Taking longer than usual, it says so, with a way out that starts over without the link.
  const again = page.getByRole('link', { name: 'Start over' })
  await expect(again).toBeVisible({ timeout: 8000 })
  await expect(again).toHaveAttribute('href', '/')
  await expect.poll(() => up(page), { timeout: 12_000 }).toBe(false)
  const started = await page.evaluate(() => window.openingFixture?.startedAt ?? 0)
  const last = ((await frames(page)).filter((f) => f.up).at(-1)?.t ?? 0) - started
  expect(last).toBeGreaterThan(5000)
  expect(last).toBeLessThan(8000) // the cap, then its last words, the bar's fill and the flight
})

test('opening · signed in from this tab, it covers the screen; a session from another tab does not', async ({
  page,
}) => {
  await countWarmReads(page)
  await watch(page)
  await page.goto(PAGE)
  await page.getByRole('button', { name: 'Sign in here' }).click()
  await expect.poll(() => up(page)).toBe(true)
  await expect.poll(() => up(page), { timeout: 10_000 }).toBe(false)
  // The email's link opened in another tab: this one is in the background when the session arrives.
  await page.goto(PAGE)
  await page.evaluate(() => {
    document.hasFocus = () => false
  })
  await page.getByRole('button', { name: 'Sign in here' }).click()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await page.waitForTimeout(400)
  expect((await frames(page)).some((f) => f.up)).toBe(false)
})

test('opening · with less motion asked for, nothing arrives or flies: it is there, then fades', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await countWarmReads(page)
  await watch(page)
  await page.goto(`${PAGE}?code=returned`)
  await expect.poll(() => up(page)).toBe(true)
  const moving = await page
    .locator('#entry .entry-lockup')
    .evaluate((l) => l.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)
  expect(moving).toBe(0)
  await expect.poll(() => up(page), { timeout: 10_000 }).toBe(false)
  await expect(page.locator('.topbar .mark')).toBeVisible()
  expect((await frames(page)).some((f) => f.flying > 0 && f.up)).toBe(false)
})

test('opening · a link that fails goes straight to the sign-in: it never says it is ready', async ({ page }) => {
  await watch(page)
  await page.goto(`${PAGE}?code=expired`)
  await expect(page.getByRole('heading', { name: 'Sign in to Sophia' })).toBeVisible()
  await expect.poll(() => up(page), { timeout: 5000 }).toBe(false)
  const said = new Set((await frames(page)).filter((f) => f.up).map((f) => f.said))
  expect(said.has('Opening your space') || said.has('Ready')).toBe(false)
  const started = await page.evaluate(() => window.openingFixture?.startedAt ?? 0)
  const last = ((await frames(page)).filter((f) => f.up).at(-1)?.t ?? 0) - started
  expect(last).toBeLessThan(1500) // no arrival held in front of the error
})

test('opening · while up, it is the one status, keys don’t reach the app under it', async ({ page }) => {
  await countWarmReads(page)
  await page.goto(`${PAGE}?code=returned`)
  await expect.poll(() => up(page)).toBe(true)
  // One live line: the work under way; the slow line is not read before it shows.
  await expect(page.getByRole('status')).toHaveCount(1)
  await expect(page.getByRole('status')).not.toContainText('Taking longer')
  await page.keyboard.press('w')
  expect(await page.evaluate(() => window.openingFixture?.keys ?? [])).toEqual([])
  // Tab stays in the opening: focus never reaches a control nobody can see.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.getElementById('root')?.contains(document.activeElement))).toBe(false)
  }
  await expect.poll(() => up(page), { timeout: 10_000 }).toBe(false)
  await page.keyboard.press('w')
  expect(await page.evaluate(() => window.openingFixture?.keys ?? [])).toEqual(['w'])
})

test('opening · with less motion, signed in from this tab, it covers the screen visibly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await countWarmReads(page)
  await page.goto(PAGE)
  await page.getByRole('button', { name: 'Sign in here' }).click()
  await expect.poll(() => up(page)).toBe(true)
  expect(await page.locator('#entry').evaluate((e) => getComputedStyle(e).opacity)).toBe('1')
  await expect.poll(() => up(page), { timeout: 10_000 }).toBe(false)
})
