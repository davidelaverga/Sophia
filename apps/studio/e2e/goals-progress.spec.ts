// Goals (docs/plans/goals-progress.md): each goal with a plan says its progress and opens its plan in Tasks; a goal
// without a plan shows neither.
import { expect, test } from '@playwright/test'

test('goals · a planned goal says its progress, and «Open in Tasks» opens its plan', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const planned = page.locator('.goal', { hasText: 'Roll the new onboarding out to every region' })
  await expect(planned.locator('.goal-progress')).toHaveText('1 of 7 tasks done')
  await planned.getByRole('button', { name: 'Open in Tasks' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks', level: 2 })).toBeVisible()
  await expect(page.locator('.goal.compact', { hasText: 'Roll the new onboarding out to every region' })).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toMatch(/^#goal-/)
})

test('goals · a goal without a plan shows no progress and no press', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const unplanned = page.locator('.goal', { hasText: 'Keep teams through an admin change' })
  await expect(unplanned).toBeVisible()
  await expect(unplanned.locator('.goal-progress')).toHaveCount(0)
  await expect(unplanned.getByRole('button', { name: 'Open in Tasks' })).toHaveCount(0)
})
