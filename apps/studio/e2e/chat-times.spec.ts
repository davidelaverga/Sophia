import { expect, test, type Page } from '@playwright/test'

// When each message in the room's chat was said (docs/plans/chat-times.md): a day line between days, the time by each
// author, and links in the typed turns with Sophia. Every message here is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const withSophia = (page: Page) => page.getByRole('list', { name: 'Conversation with Sophia' })

async function enter(page: Page, query: string) {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('times · the discussion over two days says Yesterday, then Today, and the time by each author', async ({
  page,
}) => {
  await enter(page, 'people=2&discussion=days')
  await expect(discussion(page).locator('.chat-day')).toHaveText(['Yesterday', 'Today'])
  const times = discussion(page).locator('time.contribution-at')
  await expect(times).toHaveCount(4)
  await expect(times.first()).toHaveText(/^\d{2}:\d{2}$/)
  await expect(times.first()).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
})

test('times · after a discussion that ended yesterday, the turns with Sophia open on Today', async ({ page }) => {
  await enter(page, 'discussion=yesterday&exchange=open')
  await expect(discussion(page).locator('.chat-day')).toHaveText(['Yesterday'])
  await page.locator('#converse-draft').fill('Where were we?')
  await page.locator('#converse-draft').press('Enter')
  await expect(page.locator('.conversation-history > .chat-day')).toHaveText('Today')
})

test('times · a typed turn with Sophia says when, and its link opens in a new tab with no opener', async ({ page }) => {
  await enter(page, 'exchange=open')
  const bar = page.locator('#converse-draft')
  await bar.fill('The notes are at https://example.org/notes')
  await bar.press('Enter')
  const mine = withSophia(page).locator('.chat-message.user').last()
  await expect(mine.locator('time')).toHaveText(/^\d{2}:\d{2}$/)
  const link = mine.getByRole('link', { name: 'https://example.org/notes' })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
})
