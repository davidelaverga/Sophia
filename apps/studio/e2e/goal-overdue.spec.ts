import { expect, test, type Page } from '@playwright/test'

// A goal past its date, and your own goals (docs/plans/goal-overdue.md): a row says «overdue since …» once its date has
// passed and the goal isn't completed, one's own owner is «You», and «Mine» keeps the viewer's goals. The clock stands
// at 2 Nov 2026. Every name is synthetic.

const ROLLOUT = 'Roll the new onboarding out to every region'
const ADMIN = 'Keep teams through an admin change'
const row = (page: Page, title: string) => page.locator('li.goal', { hasText: title })
const mine = (page: Page) => page.getByRole('button', { name: 'Mine', exact: true })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'))
})

test('due · a goal past its date reads overdue, marked; your own owner is You', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=mine')
  const late = row(page, ROLLOUT).locator('.goal-row-target')
  await expect(late).toHaveText('Marco · overdue since 30 Oct 2026')
  await expect(late).toHaveAttribute('data-due', 'overdue')
  await expect(row(page, ADMIN).locator('.goal-row-target')).toHaveText('You · due 20 Nov 2026')
})

test('mine · «Mine» keeps the goals you own, and gives the others back', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=mine')
  await expect(mine(page)).toHaveAttribute('aria-pressed', 'false')
  await mine(page).click()
  await expect(mine(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('ul.goal-rows > li.goal')).toHaveCount(1)
  await expect(row(page, ADMIN)).toBeVisible()
  await mine(page).click()
  await expect(row(page, ROLLOUT)).toBeVisible()
})

test('mine · with no goal of yours, no «Mine»', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=1')
  await expect(row(page, ROLLOUT).locator('.goal-row-target')).toBeVisible()
  await expect(mine(page)).toHaveCount(0)
})

// A goal past its date needs attention (docs/plans/goal-overdue-health.md); the brief counts the viewer's own.
const brief = (page: Page) => page.locator('.goals-brief-you')
const health = (page: Page, title: string) => row(page, title).locator('.goal-health')

test('attention · your goal past its date needs attention, and the brief says it', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=late')
  await expect(row(page, ADMIN).locator('.goal-row-target')).toHaveText('You · overdue since 25 Oct 2026')
  await expect(health(page, ADMIN)).toHaveText('Needs attention')
  await expect(row(page, ADMIN)).toHaveAttribute('data-health', 'attention')
  await expect(brief(page)).toContainText('one of your goals is overdue', { ignoreCase: true })
  await expect(page.locator('.goals-brief')).toContainText('2 need attention')
  await row(page, ADMIN).locator('.goal-press').click()
  await expect(page.locator('.goal-sheet .goal-health')).toHaveText('Needs attention')
})

test('attention · someone else’s goal past its date needs attention, not counted as yours', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&targets=mine')
  await expect(health(page, ROLLOUT)).toHaveText('Needs attention')
  await expect(brief(page)).not.toContainText('overdue')
})
