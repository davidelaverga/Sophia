import { expect, test, type Page } from '@playwright/test'

// The room's chat reads back past its last 50 messages (docs/plans/discussion-earlier.md, A23): «Earlier messages» at
// its top reads one page and puts it above, the reader kept in place; at the first message the start is said. Every
// message seen stays, so the snapshot's moving window leaves no gap. Every word is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const entries = (page: Page) => page.getByRole('list', { name: 'Recent discussion' }).locator('.contribution-text')
const earlier = (page: Page) => page.getByRole('button', { name: 'Earlier messages' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const first = '00000000-0000-4000-8000-000000000011'

async function enter(page: Page, count: number) {
  await page.goto(`/room.html?call=on&discussion=${count}`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
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

test('earlier · past 50 messages, the chat offers the earlier ones; a press puts them above, the reader kept in place', async ({
  page,
}) => {
  await enter(page, 60)
  await expect(entries(page)).toHaveCount(50)
  await expect(entries(page).first()).toHaveText('Message 11')
  await earlier(page).scrollIntoViewIfNeeded()
  const before = await entries(page).first().boundingBox()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(60)
  await expect(entries(page).first()).toHaveText('Message 1')
  // The message the reader was at stays where it was: what came in went above it.
  const kept = await page.getByText('Message 11', { exact: true }).boundingBox()
  expect(Math.abs((kept?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(80)
  await expect(page.getByText('The start of the room’s chat')).toBeVisible()
  await expect(earlier(page)).toHaveCount(0)
  expect(await served(page)).toContain(`discussion:${first}`)
})

test('earlier · a message after the press leaves no gap: every message seen stays', async ({ page }) => {
  await enter(page, 60)
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(60)
  for (let i = 61; i <= 65; i++) await page.evaluate((text) => window.fixture?.say(text), `Message ${i}`)
  await expect(entries(page)).toHaveCount(65)
  await expect(entries(page).nth(15)).toHaveText('Message 16')
  await expect(entries(page).last()).toHaveText('Message 65')
})

test('earlier · a read that fails says so, and trying again reads it', async ({ page }) => {
  await enter(page, 60)
  await page.evaluate(() => window.fixture?.failEarlier())
  await earlier(page).click()
  await expect(page.getByRole('alert')).toContainText('Couldn’t load earlier messages')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(entries(page)).toHaveCount(60)
})

test('earlier · with fewer than 50 messages, nothing is offered', async ({ page }) => {
  await enter(page, 12)
  await expect(entries(page)).toHaveCount(12)
  await expect(earlier(page)).toHaveCount(0)
  expect((await served(page)).some((s) => s.startsWith('discussion:'))).toBe(false)
})
