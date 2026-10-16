import { expect, test, type Page } from '@playwright/test'

// A report says what it was made for (docs/plans/report-origin.md): its research task's goal, a press that opens that
// goal in Goals, and what was asked. Every word is synthetic.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const ROLLOUT = 'Roll the new onboarding out to every region'
const origin = (page: Page) => page.getByRole('note', { name: 'What it was made for' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('origin · the demo’s report says its goal and what was asked; the goal opens in Goals', async ({ page }) => {
  await page.goto(`/room.html?demo=1&place=work&report=${REPORT}`)
  await expect(origin(page)).toContainText('Made for')
  await expect(origin(page)).toContainText('Asked')
  await expect(origin(page)).toContainText('Why did 12 of the 14 pilot teams stay active')
  await origin(page).getByRole('button', { name: ROLLOUT }).click()
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Goals' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('dialog', { name: ROLLOUT })).toBeVisible()
})

test('origin · a goal the project doesn’t hold leaves the press out; the question stays', async ({ page }) => {
  await page.goto(`/room.html?place=work&report=${REPORT}`)
  await expect(origin(page)).toContainText('A labelled fixture question.')
  await expect(origin(page).getByRole('button')).toHaveCount(0)
})
