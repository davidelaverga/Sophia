// Find in Personal (docs/plans/find-ask-sophia.md): when nothing matches, it offers to ask Sophia, and asking sends her
// the line as yours; with a match there is nothing to offer.
import { expect, test } from '@playwright/test'

const sent = (page: import('@playwright/test').Page) => page.evaluate(() => [...(window.personalFixture?.sent ?? [])])

test('personal · find: no match offers to ask Sophia, and asking sends her the line', async ({ page }) => {
  await page.goto('/personal.html')
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  const field = page.getByRole('searchbox', { name: 'Find in your conversation' })
  await field.fill('vacation')
  await expect(page.locator('.c3-find-count')).toHaveText('No match')
  const ask = page.getByRole('button', { name: 'Ask Sophia about “vacation”' })
  await expect(ask).toBeVisible()
  await ask.click()
  await expect(field).toHaveCount(0)
  await expect.poll(() => sent(page)).toContain('What did I tell you about vacation?')
  await expect(page.locator('.msgs .msg.me').last()).toContainText('What did I tell you about vacation?')
})

test('personal · find: with a match there is no offer to ask', async ({ page }) => {
  await page.goto('/personal.html')
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Find in your conversation' }).fill('launch')
  await expect(page.locator('.c3-find-count')).toContainText(' of ')
  await expect(page.getByRole('button', { name: /Ask Sophia about/ })).toHaveCount(0)
})
