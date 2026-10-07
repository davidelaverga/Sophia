import { expect, test, type Page } from '@playwright/test'

// Conversations, the review's P3s (docs/handoffs/CONVERSATIONS-attempt-1.md): the focus kept when the window widens
// past a panel, times shown from the keyboard, a row's time said, and the field that grows in every browser. On the
// fixture page; only the API is faked, and each check ends by asking the page whether anything reached for it
// unanswered.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const context = (page: Page) => page.getByRole('complementary', { name: 'Project context' })
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('polish · a panel open with the focus in it, the window widened: the context, a pane now, keeps the focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await open(page).getByRole('button', { name: 'Context' }).click()
  await expect(context(page).getByRole('button', { name: 'Close the context' })).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 800 })
  await expect(page.locator('.conversations')).not.toHaveAttribute('data-context')
  await expect(context(page)).toBeFocused()
})

test('polish · from the keyboard, the thread is a region Tab reaches, and there every time shows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 }) // short: the thread scrolls
  await page.goto(PAGE)
  const at = open(page).locator('.conv-msg:not(.sophia) .conv-msg-at').first()
  await expect(at).toHaveCSS('opacity', '0')
  // From the head's last control (what it made), the next stop is the thread itself.
  await open(page).locator('.conv-output').focus()
  await page.keyboard.press('Tab')
  const thread = open(page).getByRole('region', { name: 'Messages' })
  await expect(thread).toBeFocused()
  await expect.poll(() => at.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  // Arrows scroll it.
  await thread.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  const before = await thread.evaluate((el) => el.scrollTop)
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => thread.evaluate((el) => el.scrollTop)).toBeLessThan(before)
})

test('polish · a row says when its conversation last moved to a screen reader', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page).first()).toHaveAccessibleDescription(/Last moved (\d{2}:\d{2}|[A-Z][a-z]{2} \d{1,2})\./)
})

test('polish · where the browser has no field-sizing, the field still grows with its words', async ({ page }) => {
  // As in a browser without it (Firefox, Safari today).
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS)
    CSS.supports = ((...args: [string, string?]) =>
      args[0] === 'field-sizing' ? false : supports(...(args as [string, string]))) as typeof CSS.supports
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.conv-compose textarea { field-sizing: fixed !important }'
      document.head.append(style)
    })
  })
  await page.goto(PAGE)
  const one = await field(page).evaluate((el) => el.getBoundingClientRect().height)
  await field(page).fill('One\nTwo\nThree\nFour')
  await expect.poll(() => field(page).evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(one + 40)
  await field(page).fill('')
  await expect.poll(() => field(page).evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(one + 1)
})
