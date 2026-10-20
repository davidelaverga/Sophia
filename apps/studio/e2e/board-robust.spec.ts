import { expect, test, type Page } from '@playwright/test'

// Tasks reads each goal's plan from the board Sophia serves (docs/plans/silent-views.md): a board that can't be read is
// said in place with Try again, never shown as goals with no plan; a board already read stays when a later read fails.
// The demo serves a board for its goals (demo-goals.ts). Every name is synthetic.

const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const refusals = async (page: Page) => (await served(page)).filter((s) => s === 'board-refused').length

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('board · a board that can’t be read says so with Try again, and Try again brings the plans back', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work&boardRead=fail')
  const tasks = page.getByRole('region', { name: 'Tasks' })
  const failed = tasks.getByRole('alert').filter({ hasText: 'The tasks can’t be read right now.' })
  await expect(failed).toBeVisible({ timeout: 20_000 })
  await expect(tasks.locator('.board')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.failBoard(false))
  await failed.getByRole('button', { name: 'Try again' }).click()
  await expect(failed).toHaveCount(0)
  await expect(tasks.locator('.board').first()).toBeVisible()
})

test('board · a read that fails after the board was read keeps the plans, and says nothing', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  const tasks = page.getByRole('region', { name: 'Tasks' })
  await expect(tasks.locator('.board').first()).toBeVisible()
  await page.evaluate(() => window.fixture?.failBoard(true))
  await page.evaluate(() => window.fixture?.say('Something moves the project'))
  // The read the move starts fails all four tries (the first and three more), then a frame is drawn.
  await expect.poll(() => refusals(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(4)
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await expect(tasks.getByRole('alert')).toHaveCount(0)
  await expect(tasks.locator('.board').first()).toBeVisible()
})
