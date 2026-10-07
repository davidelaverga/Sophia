import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// The open conversation as a conversation (docs/plans/conversation-thread.md, C1): faces, runs, Sophia's words on a
// quiet plane, the field in reach, «Ask Sophia» as a chip. On the fixture page; only the API is faked, and each check
// ends by asking the page whether anything reached for the API beyond what it answers.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).getByRole('listitem')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const ask = (page: Page) => open(page).getByRole('checkbox', { name: 'Ask Sophia' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Sends a note to the team only (Sophia not asked), and waits for it in the thread. */
async function note(page: Page, text: string) {
  if (await ask(page).isChecked()) await ask(page).uncheck()
  await field(page).fill(text)
  await field(page).press('Enter')
  await expect(messages(page).filter({ hasText: text })).toHaveCount(1)
}

test('thread · a person’s message shows their initial; Sophia’s shows her mark', async ({ page }) => {
  await page.goto(PAGE)
  const lucia = messages(page).filter({ hasText: 'And every claim keeps its source' })
  await expect(lucia.locator('.conv-face')).toHaveText('L')
  const sophia = messages(page).filter({ hasText: 'I can keep both versions apart' })
  await expect(sophia.locator('.conv-face .umbral')).toBeVisible()
})

test('thread · a message that continues a run hides its face and its byline from sight, not from a reader', async ({
  page,
}) => {
  await page.goto(PAGE)
  // Your last message starts a run (Sophia wrote before it); a note a minute later goes on from it.
  await note(page, 'Goes on from mine.')
  const first = messages(page).filter({ hasText: 'Let’s look at it together tomorrow.' })
  const second = messages(page).filter({ hasText: 'Goes on from mine.' })
  await expect(first.locator('.conv-face')).toBeVisible()
  await expect(first.locator('.conv-msg-by')).toBeVisible()
  // The note continues it: no face, no byline in sight; its author still said.
  await expect(second.locator('.conv-face')).toBeHidden()
  expect(await second.locator('.conv-msg-by').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  expect(await second.ariaSnapshot()).toContain('You')
})

test('thread · Sophia’s words sit on a quiet plane; a person’s on none', async ({ page }) => {
  await page.goto(PAGE)
  const plane = (text: string) =>
    messages(page)
      .filter({ hasText: text })
      .locator('.conv-msg-body')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await plane('I can keep both versions apart')).not.toBe('rgba(0, 0, 0, 0)')
  expect(await plane('And every claim keeps its source')).toBe('rgba(0, 0, 0, 0)')
})

test('thread · on a wide screen the field stays in reach while the thread is read', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await page.goto(PAGE)
  await messages(page).first().scrollIntoViewIfNeeded()
  await expect(messages(page).first()).toBeInViewport()
  await expect(field(page)).toBeInViewport()
})

test('thread · «Ask Sophia» is a checkbox shown as a chip with her mark, pressed by its label', async ({ page }) => {
  await page.goto(PAGE)
  const chip = open(page).locator('label.conv-ask')
  await expect(chip.locator('.umbral')).toBeVisible()
  const box = await chip.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(28)
  await expect(ask(page)).toBeChecked()
  await chip.click()
  await expect(ask(page)).not.toBeChecked()
})

test('thread · what the conversation made opens from its head, before the messages', async ({ page }) => {
  await page.goto(PAGE)
  const made = open(page).locator('.conv-output')
  await expect(made).toBeVisible()
  const [m, first] = await Promise.all([made.boundingBox(), messages(page).first().boundingBox()])
  expect(m && first && m.y < first.y, 'what it made above the first message').toBe(true)
})

test('thread · every word reads at 4.5:1, on the app’s type sizes', async ({ page }) => {
  await page.goto(PAGE)
  await expect(messages(page).first()).toBeVisible()
  // A control that can't be used yet (Send, with nothing written) is exempt (WCAG 1.4.3).
  expect(await lowContrast(page, '.conv-open', '[aria-disabled="true"]')).toEqual([])
  const sizes = await typeSizes(page, '.conv-open')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px', '18px'], sizes.join(' ')).toContain(s)
})
