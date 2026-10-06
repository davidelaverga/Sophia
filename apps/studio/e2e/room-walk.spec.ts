import { expect, test, type Page } from '@playwright/test'

// Sophia walks through the report she shows (docs/plans/room-walk.md): A14's focus anchor, behind the vision flag the
// fixture pages set. `history=pilot` gives the report seven sections, so there is somewhere to go. Every word is
// synthetic.

const presented = (page: Page) => page.getByRole('region', { name: /^Fixture report, shown by/ })
const sections = (page: Page) => presented(page).getByRole('navigation', { name: 'Sections' })
const card = (page: Page) => page.locator('.stage-showing')
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const reads = async (page: Page) => (await served(page)).filter((s) => s === 'room-focus:read')

/** How far the heading is below the top of the report's scrolled body: near 0 when it was brought there. */
const fromTop = (page: Page, name: string) =>
  presented(page)
    .getByRole('heading', { name })
    .evaluate((h) => {
      const body = h.closest('.report-main-body')
      return body ? h.getBoundingClientRect().top - body.getBoundingClientRect().top : Infinity
    })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening&history=pilot')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('walk · showing a report, Sophia’s move brings the section up, marks it and says it; the focus stays', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture?.show('me'))
  await expect(presented(page)).toBeVisible()
  const chat = page.getByRole('button', { name: /^Chat/ }).first()
  await chat.focus()
  await page.evaluate(() => window.fixture?.sophiaWalks('charging-speed-in-practice'))
  await expect(presented(page).locator('.report-walk')).toHaveText('Sophia is in Charging speed in practice.')
  await expect.poll(() => fromTop(page, 'Charging speed in practice')).toBeLessThan(48)
  await expect(sections(page).getByRole('link', { name: /Charging speed in practice/ })).toHaveAttribute(
    'data-sophia',
    'true',
  )
  await expect(chat).toBeFocused()
})

test('walk · following someone else’s report, the move is followed too, and the next one after it', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  // The report on the stage is the same one throughout: her moves never take it off, even for a round trip.
  const report = await presented(page).elementHandle()
  await page.evaluate(() => window.fixture?.sophiaWalks('compatibility-and-standards'))
  await expect.poll(() => fromTop(page, 'Compatibility and standards')).toBeLessThan(48)
  // Her move is the same showing: the report stays followed, and the next move is followed too.
  await page.evaluate(() => window.fixture?.sophiaWalks('charging-speed-in-practice'))
  await expect.poll(() => fromTop(page, 'Charging speed in practice')).toBeLessThan(48)
  await expect(presented(page).locator('.report-walk')).toHaveText('Sophia is in Charging speed in practice.')
  expect(await report.evaluate((el) => el.isConnected)).toBe(true)
})

test('walk · a member showing it again is no walk: following asks again', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  // The same report, shown again by the same member: a new showing, not hers.
  await page.evaluate(() => window.fixture?.show(1))
  await expect(card(page).getByRole('button', { name: 'Follow' })).toBeVisible()
  await expect(presented(page)).toHaveCount(0)
})

test('walk · shown again by its member, then walked: still asks, nothing re-arms the follow', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.show(1))
  await expect(card(page).getByRole('button', { name: 'Follow' })).toBeVisible()
  await page.evaluate(() => window.fixture?.sophiaWalks('charging-speed-in-practice'))
  await expect(card(page).getByRole('button', { name: 'Follow' })).toBeVisible()
  await expect(presented(page)).toHaveCount(0)
})

test('walk · not following, nothing moves, and where she is is not read', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await expect(card(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.sophiaWalks('limitations-of-this-review'))
  await expect(card(page)).toBeVisible()
  await expect(presented(page)).toHaveCount(0)
  expect(await reads(page)).toEqual([])
})
