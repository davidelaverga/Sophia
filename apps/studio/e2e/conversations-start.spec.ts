import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Conversations: starting one is writing (docs/plans/conversations-start.md, C8). A question is enough; the project's
// proposals waiting are offered to start from. On the fixture page; only the API is faked.

const PAGE = '/room.html?place=conversations&demo=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const question = (page: Page) => form(page).getByRole('textbox', { name: 'Question' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function newConversation(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  await expect(question(page)).toBeFocused()
}

test('start · a question alone starts it, the question its first message; Enter in the question starts', async ({
  page,
}) => {
  await newConversation(page)
  await expect(question(page)).toHaveAttribute('placeholder', 'What do you want to figure out?')
  await question(page).fill('Who signs off the rollout?')
  await question(page).press('Enter')
  await expect(form(page)).toHaveCount(0)
  const open = page.getByRole('region', { name: 'Open conversation' })
  await expect(open.getByRole('heading', { level: 3 })).toHaveText('Who signs off the rollout?')
  await expect(open.locator('.conv-messages > li').first()).toContainText('Who signs off the rollout?')
})

test('start · a proposal waiting is offered to start from, and fills the question', async ({ page }) => {
  await newConversation(page)
  const starters = form(page).getByRole('group', { name: 'Start from what’s still open' })
  await starters.getByRole('button', { name: 'Map first, list second' }).click()
  await expect(question(page)).toHaveValue('Map first, list second')
  // The one already the question is not offered again.
  await expect(starters.getByRole('button', { name: 'Map first, list second' })).toHaveCount(0)
})

test('start · quiet labels in the app’s sans, on its sizes, reading at 4.5:1', async ({ page }) => {
  await newConversation(page)
  const family = await form(page)
    .locator('.field-label')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).not.toMatch(/mono/i)
  await expect(form(page).locator('.field-label').first()).toHaveCSS('text-transform', 'none')
  expect(await lowContrast(page, '.conv-new')).toEqual([])
  const sizes = await typeSizes(page, '.conv-new')
  // The form's own heading is the view's 18 px, as the other conversation checks allow.
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px', '18px'], sizes.join(' ')).toContain(s)
  // The question is set at the title size, larger than the context under it.
  await expect(question(page)).toHaveCSS('font-size', '14px')
})
