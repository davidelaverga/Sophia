import { expect, test, type Page } from '@playwright/test'

// Goals' health waits on the goals' dates as on their notes (docs/plans/targets-robust.md; Codex P2 on #372): while the
// dates are read the brief says so, a read that fails says so with Try again, and search says no health until they are
// in. The clock stands at 2 Nov 2026; the viewer's own goal (ADMIN) was due 25 Oct (`targets=late`). Every name is
// synthetic.

const ADMIN = 'Keep teams through an admin change'
const row = (page: Page, title: string) => page.locator('li.goal', { hasText: title })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'))
})

test('dates · while the targets are held, the brief says the dates are being read', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=late&targetsRead=hold')
  await expect(page.locator('.goals-brief')).toContainText('Reading the dates…')
  await page.evaluate(() => window.fixture?.holdTargets(false))
  await expect(row(page, ADMIN).locator('.goal-health')).toHaveText('Needs attention')
  await expect(page.locator('.goals-brief')).not.toContainText('Reading the dates')
})

test('dates · a targets read that fails says so with Try again, and Try again brings the overdue goal back', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals&targets=late&targetsRead=fail')
  const failed = page.locator('.goals-dates-failed')
  await expect(failed).toContainText('The dates can’t be read right now', { timeout: 20_000 })
  await expect(failed).toHaveAttribute('role', 'alert')
  await expect(row(page, ADMIN).locator('.goal-row-target')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.failTargets(false))
  await failed.getByRole('button', { name: 'Try again' }).click()
  await expect(failed).toHaveCount(0)
  await expect(row(page, ADMIN).locator('.goal-health')).toHaveText('Needs attention')
  await expect(page.locator('.goals-brief-you')).toContainText('one of your goals is overdue', { ignoreCase: true })
})

test('search · no health is said for a goal until its date is read', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=late&targetsRead=hold')
  await page.getByRole('button', { name: 'Search' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Search this project' })
  await sheet.getByRole('searchbox', { name: 'Search this project' }).fill('admin change')
  const hit = sheet.getByRole('list', { name: 'Results' }).getByRole('button', { name: new RegExp(ADMIN) })
  await expect(hit).toContainText('Goal')
  await expect(hit).not.toContainText('Not started')
  await expect(hit).not.toContainText('On track')
  await page.evaluate(() => window.fixture?.holdTargets(false))
  await expect(hit).toContainText('Goal · Needs attention')
})
