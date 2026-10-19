// Her orb tells where she is (docs/plans/orb-presence.md): away while she is not in the conversation (dormant, its
// violet greyed), joining while her voice gets ready or the link comes back (forming, never listening over a dead link),
// paused while her conversation is (held, its violet kept), and a call on its rim when she speaks but this browser
// blocked her sound. Here, none of it. Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'

const light = (page: Page) => page.locator('.room-stage > .light')

/** What her orb shows of her presence: the box's marks, its clouds' saturation, and which loops run. */
const presenceRead = (page: Page) =>
  light(page).evaluate((el) => ({
    presence: el.getAttribute('data-presence'),
    sound: el.getAttribute('data-sound'),
    mode: el.getAttribute('data-mode'),
    saturate: Number(/saturate\(([\d.]+)\)/.exec(getComputedStyle(el, '::before').filter)?.[1] ?? 0),
    running: el
      .getAnimations({ subtree: true })
      .filter((a) => a.playState === 'running')
      .map((a) => (a instanceof CSSAnimation ? a.animationName : ''))
      .toSorted(),
  }))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('presence · not yet in the conversation, she is away: dormant, her violet greyed, nothing turning', async ({
  page,
}) => {
  await page.goto('/room.html?theme=light')
  await expect(light(page)).toHaveAttribute('data-presence', 'away')
  await expect.poll(async () => (await presenceRead(page)).saturate, { timeout: 3000 }).toBeLessThanOrEqual(0.62)
  expect((await presenceRead(page)).running).not.toContain('gc-drift')
})

test('presence · in the conversation and heard, she is here: no mark, her violet whole', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await expect.poll(async () => (await presenceRead(page)).saturate, { timeout: 3000 }).toBe(1)
  const read = await presenceRead(page)
  expect([read.presence, read.sound]).toEqual([null, null])
  expect(read.running).toContain('gc-drift')
})

test('presence · when her participant leaves the room, she is joining: forming, and still', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await page.evaluate(() => window.fixture?.sophiaLeaves())
  await expect(light(page)).toHaveAttribute('data-presence', 'joining')
  await expect.poll(async () => (await presenceRead(page)).running).toContain('gc-form')
  expect((await presenceRead(page)).running).not.toContain('gc-drift')
})

test('presence · while this person’s link comes back, she is joining, never listening over a dead link', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&theme=light')
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await page.evaluate(() => window.fixture?.linkLost(true))
  await expect(light(page)).toHaveAttribute('data-presence', 'joining')
  expect((await presenceRead(page)).mode).not.toBe('listen')
  await page.evaluate(() => window.fixture?.linkLost(false))
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await expect(light(page)).not.toHaveAttribute('data-presence', /./)
})

test('presence · while her conversation is paused for a guest, she is paused: held, her violet kept', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&paused=guest&theme=light')
  await expect(light(page)).toHaveAttribute('data-presence', 'paused')
  await expect.poll(async () => (await presenceRead(page)).saturate, { timeout: 3000 }).toBe(1)
  expect((await presenceRead(page)).running).not.toContain('gc-drift')
})

test('presence · speaking while this browser blocked her sound, a call on her rim, and no voice in her', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&sophia=blocked&theme=light')
  await expect(light(page)).toHaveAttribute('data-sound', 'blocked')
  await expect.poll(async () => (await presenceRead(page)).running).toContain('gc-call')
  await page
    .getByRole('button', { name: /Allow audio/ })
    .first()
    .click()
  await expect(light(page)).not.toHaveAttribute('data-sound', /./)
})

test('presence · under reduced motion her presence still reads, standing still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/room.html?theme=light')
  await expect(light(page)).toHaveAttribute('data-presence', 'away')
  const read = await presenceRead(page)
  expect(read.saturate).toBeLessThanOrEqual(0.62)
  expect(read.running).toEqual([])
})
