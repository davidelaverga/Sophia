// Goals as an overview (docs/plans/goals-overview.md): grouped by state, a goal in motion a card with its progress,
// what is in its way and who is on it; ready and paused goals rows; done folded; past six goals, a search and filters.
import { expect, test } from '@playwright/test'

const ROLLOUT = 'Roll the new onboarding out to every region'

test('goals · the demo’s goals in their sections: the running one a card, the ready one a row, the done one folded', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals')
  const card = page.getByRole('region', { name: 'In motion' }).locator('.goal-card', { hasText: ROLLOUT })
  await expect(card).toContainText('1 of 7 done')
  await expect(card.locator('.goal-way')).toContainText('waiting on a permission')
  await expect(card.locator('.goal-bar > i')).toHaveCount(7)
  const ready = page.getByRole('region', { name: 'Ready' }).locator('.goal-row')
  await expect(ready).toContainText('Keep teams through an admin change')
  await expect(ready).toContainText('No plan yet')
  await expect(ready.getByRole('button', { name: 'Open in Tasks' })).toHaveCount(0)
  const done = page.getByRole('button', { name: /1 done/ })
  await expect(done).toHaveAttribute('aria-expanded', 'false')
  await done.click()
  await expect(page.getByRole('region', { name: 'Done' })).toContainText('Run the pilot with fourteen teams')
  // Three goals: no search, no filters.
  await expect(page.getByRole('searchbox', { name: 'Search goals' })).toHaveCount(0)
})

test('goals · «Open in Tasks» on a card opens that goal’s plan', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  await page.locator('.goal-card', { hasText: ROLLOUT }).getByRole('button', { name: 'Open in Tasks' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks', level: 2 })).toBeVisible()
  await expect(page.locator('.goal.compact', { hasText: ROLLOUT })).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toMatch(/^#goal-/)
})

test('goals · nine goals: a search and filters; Paused keeps the held and the stopped goal', async ({ page }) => {
  await page.goto('/work.html?goals=9&view=goals')
  const search = page.getByRole('searchbox', { name: 'Search goals' })
  await expect(search).toBeVisible()
  const shown = page.locator('.goals-overview li.goal')
  await page.getByRole('tab', { name: /Paused/ }).click()
  await expect(shown).toHaveCount(2)
  await expect(shown.filter({ hasText: 'Localise the pricing page' })).toHaveCount(1)
  await expect(shown.filter({ hasText: 'Pilot a paid tier with two teams' })).toHaveCount(1)
  await page.getByRole('tab', { name: /All/ }).click()
  await search.fill('prices')
  await expect(shown).toHaveCount(1)
  await expect(shown.first()).toContainText('Localise the pricing page')
  await search.fill('nothing answers this')
  await expect(page.getByText('No goal answers “nothing answers this”.')).toBeVisible()
})

test('@phone · goals · the cards stack in one column', async ({ page }) => {
  await page.goto('/work.html?goals=6&view=goals')
  const cards = page.locator('.goal-card')
  await expect(cards.nth(1)).toBeVisible()
  const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
  expect(a && b ? Math.abs(a.x - b.x) < 1 && b.y > a.y : false).toBe(true)
})
