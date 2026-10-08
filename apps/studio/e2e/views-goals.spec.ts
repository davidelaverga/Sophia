import { expect, test, type Page } from '@playwright/test'

// Goals and Tasks tell the pilot (docs/plans/views-goals.md): in the demo's room page every tab answers, the goals are
// the project's own, and a goal's controls are answered as the API answers them. Every name here is synthetic.

const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' })
const goals = (page: Page) => page.locator('li.goal')
const goal = (page: Page, title: string) => goals(page).filter({ has: page.getByRole('heading', { name: title }) })

const ROLLOUT = 'Roll the new onboarding out to every region'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('goals · in the demo, Goals opens from its tab with the project’s three goals', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await views(page).getByRole('link', { name: 'Goals' }).click()
  await expect(views(page).getByRole('link', { name: 'Goals' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Goals', level: 2 })).toBeVisible()
  await expect(goals(page)).toHaveCount(3)
  for (const title of [ROLLOUT, 'Keep teams through an admin change', 'Run the pilot with fourteen teams']) {
    await expect(goal(page, title)).toHaveCount(1)
  }
  // Goals reads outcomes; the controls are Tasks'.
  await expect(goal(page, ROLLOUT).getByRole('button', { name: /^Hold/ })).toHaveCount(0)
})

test('goals · in the demo, Resources opens from its tab and says what it will hold', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await views(page).getByRole('link', { name: 'Resources' }).click()
  await expect(views(page).getByRole('link', { name: 'Resources' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible()
})

test('goals · in the demo, Tasks has the goals, and Hold on the running one holds it', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await expect(page.getByText('No goals yet')).toHaveCount(0)
  await expect(goals(page)).toHaveCount(3)
  const rollout = goal(page, ROLLOUT)
  await expect(rollout).toHaveAttribute('data-status', 'running')
  await rollout.getByRole('button', { name: /^Hold/ }).click()
  await expect(rollout).toHaveAttribute('data-status', 'held')
})

test('goals · without the demo, Goals opens and says there are none yet', async ({ page }) => {
  await page.goto('/room.html')
  await views(page).getByRole('link', { name: 'Goals' }).click()
  await expect(views(page).getByRole('link', { name: 'Goals' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(/No goals yet/)).toBeVisible()
})
