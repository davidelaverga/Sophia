import type { ChatCaption } from '@sophia/contracts/room-chat'
import { expect, test, type Page } from '@playwright/test'

// What Sophia made is born in the room (docs/plans/room-made-object.md): a result's notice brings an object under her
// line, the report as Knowledge shows it, with Open and Close, while Chat is closed. Every word here is synthetic.

const V2 = '00000000-0000-4000-8000-0000000000d2'
const DESCRIBED = 'A labelled fixture report, as Sophia described it.'

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const made = (page: Page) => page.getByRole('group', { name: 'Made by Sophia' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const notice = (page: Page) => page.evaluate(() => window.fixture?.notice())

async function enter(page: Page, query = 'people=2&floor=1&sophia=listening') {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
}

const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`${selector} has no box`)
  return b
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('made · a notice brings the report into the room: its title, version, Sophia’s words, who asked, its facts', async ({
  page,
}) => {
  await enter(page)
  await expect(made(page)).toHaveCount(0)
  await notice(page)
  await expect(made(page)).toBeVisible()
  await expect(made(page).locator('.made-title')).toHaveText('Fixture report')
  await expect(made(page).locator('.made-meta')).toContainText('v1')
  await expect(made(page).locator('.made-summary')).toHaveText(DESCRIBED)
  await expect(made(page).locator('.made-asked')).toHaveText('Asked by you')
  await expect(made(page).locator('.fact').filter({ hasText: 'min read' })).toBeVisible()
  await expect(made(page).locator('.fact').filter({ hasText: 'sections' })).toBeVisible()
})

test('made · Open shows the report in the viewer and the object goes', async ({ page }) => {
  await enter(page)
  await notice(page)
  await made(page).getByRole('button', { name: 'Open', exact: true }).click()
  await expect(pane(page)).toBeVisible()
  await expect(made(page)).toHaveCount(0)
})

test('made · Close puts it away; the chat keeps its card; back from Knowledge it stays away', async ({ page }) => {
  await enter(page)
  await notice(page)
  await made(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(made(page)).toHaveCount(0)
  await chatToggle(page).click()
  await expect(page.getByRole('group', { name: 'Research report ready' })).toHaveCount(1)
  await chatToggle(page).click()
  await page.getByRole('link', { name: 'Knowledge', exact: true }).click()
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await expect(page.locator('.room-stage')).toBeVisible()
  await expect(made(page)).toHaveCount(0)
})

test('made · a revision’s notice takes its place, at v2', async ({ page }) => {
  await enter(page)
  await notice(page)
  await expect(made(page).locator('.made-meta')).toContainText('v1')
  await page.evaluate(() => window.fixture?.noticeRevised())
  await expect(made(page)).toHaveCount(1)
  await expect(made(page).locator('.made-meta')).toContainText('v2')
  await made(page).getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`version=${V2}`))
})

test('made · one place at a time: with Chat open it leaves the stage, and comes back when it closes', async ({
  page,
}) => {
  await enter(page)
  await notice(page)
  await expect(made(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(made(page)).toHaveCount(0)
  await chatToggle(page).click()
  await expect(made(page)).toBeVisible()
})

test('made · until the task’s record is read, the Studio’s words and an Open that waits', async ({ page }) => {
  await enter(page, 'people=2&floor=1&sophia=listening&hold=task')
  await notice(page)
  await expect(made(page).locator('.made-title')).toHaveText('Research report ready')
  const open = made(page).getByRole('button', { name: 'Open', exact: true })
  await expect(open).toHaveAttribute('aria-disabled', 'true')
  await page.evaluate(() => window.fixture?.releaseTask())
  await expect(made(page).locator('.made-title')).toHaveText('Fixture report')
  await expect(open).not.toHaveAttribute('aria-disabled')
})

test('made · on the stage’s axis, under Sophia’s line, above the captions and the dock', async ({ page }) => {
  await enter(page)
  await notice(page)
  await page.evaluate(() =>
    window.fixture?.caption({
      kind: 'caption',
      id: '00000000-0000-4000-8000-0000000000c1',
      exchangeId: '00000000-0000-4000-8000-0000000000ae',
      speaker: 'sophia',
      actorId: null,
      sequence: 1,
      state: 'partial',
      text: 'Here is what I found',
    } satisfies ChatCaption),
  )
  await expect(made(page)).toBeVisible()
  // Measured at rest: its birth moves it from where the light is.
  await made(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const stage = await box(page, '.room-stage')
  const object = await box(page, '.stage-made')
  const lineBox = await box(page, '.sophia-line')
  const words = await box(page, '.stage-captions')
  expect(Math.abs(object.x + object.width / 2 - (stage.x + stage.width / 2))).toBeLessThanOrEqual(1)
  expect(object.y).toBeGreaterThanOrEqual(lineBox.y + lineBox.height)
  // Right under her line, where it was born, not down by the dock.
  expect(object.y - (lineBox.y + lineBox.height)).toBeLessThanOrEqual(48)
  expect(object.y + object.height).toBeLessThanOrEqual(words.y)
})

test('captions · a guest’s words stay marked as a guest’s', async ({ page }) => {
  await enter(page, 'people=2&floor=1&sophia=listening&guest=1')
  await page.evaluate(() =>
    window.fixture?.caption({
      kind: 'caption',
      id: '00000000-0000-4000-8000-0000000000c2',
      exchangeId: '00000000-0000-4000-8000-0000000000ae',
      speaker: 'member',
      actorId: '00000000-0000-4000-8000-0000000000b2',
      sequence: 1,
      state: 'partial',
      text: 'A visitor’s words',
    } satisfies ChatCaption),
  )
  await expect(page.locator('.stage-caption .caption-who')).toHaveText('Lucía · guest')
})

test('@phone · the object rests on the dock and fits a phone', async ({ page }) => {
  await enter(page)
  await notice(page)
  await expect(made(page)).toBeVisible()
  await made(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const object = await box(page, '.stage-made')
  const dock = await box(page, '.dock')
  expect(object.y + object.height).toBeLessThanOrEqual(dock.y)
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBe(0)
})
