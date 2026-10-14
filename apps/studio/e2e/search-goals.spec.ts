// Search finds goals and tasks, and marks the words (docs/plans/search-goals.md): in the demo, «checklist» finds the
// rollout's translation task and the admin-change goal (by its criterion), each a press to its sheet.
import { expect, test, type Page } from '@playwright/test'

const search = async (page: Page, words: string) => {
  await page.getByRole('button', { name: 'Search' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Search this project' })
  await sheet.getByRole('searchbox', { name: 'Search this project' }).fill(words)
  return sheet.getByRole('list', { name: 'Results' })
}

test('search · «checklist» finds the task and the goal first, labelled, the word marked', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const results = await search(page, 'checklist')
  const task = results.getByRole('button', { name: /Translate the checklist for the second region/ })
  await expect(task).toContainText('Task ·')
  const goal = results.getByRole('button', { name: /Keep teams through an admin change/ })
  await expect(goal).toContainText('Goal · Not started')
  await expect(goal.locator('mark').first()).toHaveText(/checklist/i)
})

test('search · a task opens its sheet in Tasks', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const results = await search(page, 'checklist')
  await results.getByRole('button', { name: /Translate the checklist for the second region/ }).click()
  await expect(page.getByRole('heading', { name: 'Tasks', level: 2 })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Translate the checklist for the second region' })).toBeVisible()
})

test('search · a goal opens its sheet in Goals', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  const results = await search(page, 'checklist')
  await results.getByRole('button', { name: /Keep teams through an admin change/ }).click()
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Keep teams through an admin change' })).toBeVisible()
})

test('search · from the Studio view, the board is read and the task is found', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  const results = await search(page, 'checklist')
  await expect(results.getByRole('button', { name: /Translate the checklist for the second region/ })).toBeVisible()
})

test('search · while the board is first read, zero is no answer: «Searching…», then the task (Codex P2 on #313)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await page.evaluate(() => window.fixture?.holdBoard(true))
  const results = await search(page, 'checklist')
  const sheet = page.getByRole('dialog', { name: 'Search this project' })
  await expect(sheet.getByText('Searching…')).toBeVisible()
  await expect(sheet.getByText(/Nothing in this project matches/)).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /Ask Sophia/ })).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdBoard(false))
  await expect(results.getByRole('button', { name: /Translate the checklist for the second region/ })).toBeVisible()
  await expect(sheet.getByText('Searching…')).toHaveCount(0)
})

test('search · a task found by its doer has the doer marked (Codex P2 on #313)', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const results = await search(page, 'marco')
  const task = results.getByRole('button', { name: /Translate the checklist for the second region/ })
  await expect(task.locator('.search-hit-source mark')).toHaveText(/marco/i)
})

test('search · a goal’s health counts its notes, as Goals does (Codex P2 on #313)', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const ready = page.locator('li.goal', { hasText: 'Keep teams through an admin change' })
  await expect(ready.locator('.goal-health')).toHaveText('Not started')
  await page.evaluate(() =>
    window.fixture?.noteOnGoal('Keep teams through an admin change', 'From the call: nobody owns the checklist yet.'),
  )
  await expect(ready.locator('.goal-health')).toHaveText('Needs attention')
  const results = await search(page, 'admin change')
  await expect(results.getByRole('button', { name: /Keep teams through an admin change/ })).toContainText(
    'Goal · Needs attention',
  )
})
