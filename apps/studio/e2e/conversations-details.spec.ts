import { expect, test, type Page } from '@playwright/test'

// Conversations: the details (docs/plans/conversations-details.md, C9). The context's labels in words, «and 2 more»
// that opens, the hint under the field in the app's sans, and the demo's label off a phone's conversation field.

const PAGE = '/room.html?place=conversations&demo=1'
const context = (page: Page) => page.locator('.conv-context')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('details · the context’s labels are words: the app’s sans, not capitals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  const label = context(page).locator('.eyebrow').first()
  await expect(label).toBeVisible()
  expect(await label.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i)
  await expect(label).toHaveCSS('text-transform', 'none')
  const hint = page.locator('.conv-compose-hint')
  expect(await hint.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i)
})

test('details · «and 2 more» shows every accepted decision, says it is open, and folds back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  const accepted = context(page).locator('.conv-decisions:not(.open) li')
  await expect(accepted).toHaveCount(3)
  const more = context(page).getByRole('button', { name: 'and 2 more' })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect(accepted).toHaveCount(5)
  const fewer = context(page).getByRole('button', { name: 'Show fewer' })
  await expect(fewer).toHaveAttribute('aria-expanded', 'true')
  await fewer.click()
  await expect(accepted).toHaveCount(3)
})

test('details · on a phone, the demo’s label steps away from a conversation’s field, and stays on Knowledge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PAGE)
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  await expect(page.locator('.conv-compose')).toBeVisible()
  await expect(page.locator('.fixture-label')).toBeHidden()
  await page.goto('/room.html?place=knowledge&demo=1')
  await expect(page.locator('.fixture-label')).toBeVisible()
})
