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

test('earlier · from the keyboard the focus stays in the chat: on the button while it reads, then on the start (Codex P1 on #350)', async ({
  page,
}) => {
  await enter(page, 60)
  await page.evaluate(() => window.fixture?.failEarlier())
  await earlier(page).focus()
  await page.keyboard.press('Enter')
  // Failed, the same control offers Try again, and keeps the focus.
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  const start = page.getByText('The start of the room’s chat')
  await expect(start).toBeVisible()
  await expect(start).toBeFocused()
})

// 4309253137: a message older than the snapshot's 50, already read on an earlier page, corrected or withdrawn by someone
// else's tab. The feed names it; the chat reads again only the page that holds it and shows its committed state.
const items = (page: Page) => page.getByRole('list', { name: 'Recent discussion' }).locator('[data-message]')
const pageReads = async (page: Page) => (await served(page)).filter((s) => s.startsWith('discussion:')).length

async function heldEarlier(page: Page) {
  await page.goto('/room.html?call=on&discussion=60&acts=1')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await earlier(page).click()
  await expect(entries(page)).toHaveCount(60)
}

test('earlier · a held message corrected elsewhere shows its committed words, in place, after one page read (4309253137)', async ({
  page,
}) => {
  await heldEarlier(page)
  const reads = await pageReads(page)
  const target = (await items(page).nth(2).getAttribute('data-message')) ?? ''
  await page.evaluate((m) => window.fixture?.changeElsewhere(2, m, 'Message 3, corrected elsewhere'), target)
  await expect(page.locator(`[data-message="${target}"] .contribution-text`)).toHaveText(
    'Message 3, corrected elsewhere',
  )
  await expect(entries(page).nth(1)).toHaveText('Message 2')
  await expect(entries(page).nth(3)).toHaveText('Message 4')
  expect(await pageReads(page)).toBe(reads + 1)
  // An ordinary new message reads no earlier page again.
  await page.evaluate(() => window.fixture?.say('SYNTHETIC: an ordinary new message.'))
  await expect(page.getByText('an ordinary new message')).toBeVisible()
  expect(await pageReads(page)).toBe(reads + 1)
})

test('earlier · a held message withdrawn elsewhere loses its words; its neighbours stay in order (4309253137)', async ({
  page,
}) => {
  await heldEarlier(page)
  const target = (await items(page).nth(3).getAttribute('data-message')) ?? ''
  await page.evaluate((m) => window.fixture?.changeElsewhere(3, m, null), target)
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Message 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Message 5', { exact: true })).toBeVisible()
})

test('earlier · a held message withdrawn elsewhere whose page fails to read again: its words go, the earlier pages go, and «Earlier messages» reads them again (R on 61dc)', async ({
  page,
}) => {
  await heldEarlier(page)
  const target = (await items(page).nth(3).getAttribute('data-message')) ?? ''
  await page.evaluate(() => window.fixture?.failEarlier())
  await page.evaluate((m) => window.fixture?.changeElsewhere(3, m, null), target)
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
  await expect(earlier(page)).toBeVisible() // the span let go: a visible way to read it again
  await expect(entries(page)).toHaveCount(50)
  await earlier(page).click()
  await expect(page.getByText('Message 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Message 4', { exact: true })).toHaveCount(0)
})
