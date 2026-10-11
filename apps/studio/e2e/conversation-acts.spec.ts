// A message's acts (docs/plans/conversation-acts.md): copy, quote, propose at its corner, on the fixture page.
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'UTC', locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })

const PAGE = '/room.html?place=conversations&conversations=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).locator('.conv-messages > li')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('acts · under the pointer a message offers Copy, Quote and Propose; Copy puts its words and who said them on the clipboard', async ({
  page,
}) => {
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await expect(first.getByRole('button', { name: 'Copy' })).toBeVisible()
  await expect(first.getByRole('button', { name: 'Quote in your message' })).toBeVisible()
  await expect(first.getByRole('button', { name: 'Propose as decision' })).toBeVisible()
  const words = (await first.locator('.conv-msg-body p').first().innerText()).trim()
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip.startsWith(`${words}\n— `)).toBe(true)
  expect(clip).toMatch(/— .+, .+ \d\d:\d\d$/)
})

test('acts · Quote puts the words after «> » under the draft, with who said them; the field takes the focus; a second one goes under', async ({
  page,
}) => {
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await first.getByRole('button', { name: 'Quote in your message' }).click()
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue(/^> .+\n— .+\n\n$/)
  await field(page).type('Agreed.')
  const second = messages(page).nth(1)
  await second.hover()
  await second.getByRole('button', { name: 'Quote in your message' }).click()
  await expect(field(page)).toHaveValue(/^> .+\n— .+\n\nAgreed\.\n\n> [^]+\n— .+\n\n$/)
})

test('acts · a viewer may copy a message, not quote it nor propose it', async ({ page }) => {
  await page.goto(`${PAGE}&role=viewer`)
  await expect(open(page).getByText('Viewers read conversations; members write in them.')).toBeVisible()
  const first = messages(page).first()
  await first.hover()
  await expect(first.getByRole('button', { name: 'Copy' })).toBeVisible()
  await expect(first.getByRole('button', { name: 'Quote in your message' })).toHaveCount(0)
  await expect(first.getByRole('button', { name: 'Propose as decision' })).toHaveCount(0)
})
