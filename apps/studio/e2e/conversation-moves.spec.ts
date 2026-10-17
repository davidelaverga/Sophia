import { expect, test, type Page } from '@playwright/test'

// Conversations: a link to copy, new messages said, Alt+↑/↓ (docs/plans/conversation-moves.md). Behind the vision flag
// the fixture pages set; every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })

const PAGE = '/room.html?place=conversations&conversations=1'
const READING = '00000000-0000-4000-8000-0000000000c1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const heading = (page: Page) => open(page).getByRole('heading', { level: 3 })
const pill = (page: Page) => open(page).getByRole('button', { name: 'New messages' })
const thread = (page: Page) => open(page).locator('.conv-scroll')

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('moves · Copy link copies the open conversation’s own address', async ({ page }) => {
  await page.goto(PAGE)
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
  await open(page).getByRole('button', { name: 'Copy link' }).click()
  await expect(open(page).getByRole('button', { name: 'Link copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied.endsWith(`#conversation-${READING}`)).toBe(true)
})

// The address bar doesn't hold the conversation opened by default: a refused copy hands over its own address, selected
// to copy by hand, until Escape or a press elsewhere (Codex P2 on #382).
test('moves · a refused Copy link hands over the conversation’s own address, not the address bar', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    })
  })
  await page.goto(PAGE)
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
  expect(new URL(page.url()).hash).not.toMatch(/^#conversation-/)
  await open(page).getByRole('button', { name: 'Copy link' }).click()
  const field = open(page).getByRole('textbox', { name: 'Link', exact: true })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(new RegExp(`#conversation-${READING}$`))
  expect(await field.evaluate((el: HTMLInputElement) => el.selectionEnd - el.selectionStart)).toBe(
    await field.evaluate((el: HTMLInputElement) => el.value.length),
  )
  await expect(open(page).getByRole('button', { name: /address bar/ })).toHaveCount(0)
  await page.waitForTimeout(4500) // past the failure's own few seconds: the link stays until it is let go
  await expect(field).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(open(page).getByRole('button', { name: /^Copy link|copy the link/ })).toBeFocused()
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
})

test('moves · scrolled up, a new message is said; the pill takes the thread to its end', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 })
  await page.goto(PAGE)
  await expect(open(page).locator('.conv-messages > li')).toHaveCount(6)
  await thread(page).evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
  })
  await page.evaluate(() => window.fixture?.conversationMessage('Marco', 'Fresh from below.'))
  await expect(pill(page)).toBeVisible()
  await pill(page).click()
  await expect(open(page).getByText('Fresh from below.')).toBeInViewport()
  await expect(pill(page)).toHaveCount(0)
})

test('moves · at the end, a new message needs no pill', async ({ page }) => {
  await page.goto(PAGE)
  await expect(open(page).locator('.conv-messages > li')).toHaveCount(6)
  await page.evaluate(() => window.fixture?.conversationMessage('Marco', 'Right where you are.'))
  await expect(open(page).getByText('Right where you are.')).toBeInViewport()
  await expect(pill(page)).toHaveCount(0)
})

test('moves · Alt+↓ and Alt+↑ go along the list as shown', async ({ page }) => {
  await page.goto(PAGE)
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
  await page.keyboard.press('Alt+ArrowDown')
  await expect(heading(page)).toHaveText('Short or long briefs?')
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
  // «Open» keeps the conversations with an open question: the second one has none, so Alt+↓ skips it.
  await list(page).getByRole('button', { name: 'Open', exact: true }).click()
  await rows(page).first().click()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(heading(page)).toHaveText('Test data for the first release')
})
