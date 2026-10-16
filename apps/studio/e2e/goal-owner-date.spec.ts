import { expect, test, type Page } from '@playwright/test'

// A goal has an owner and a target date (docs/plans/goal-owner-date.md, A25): set in the goal's sheet by an editor or
// an admin, read there by everyone, and said on its row. Kept beside the goal: its revision and authority don't move.
// Every name is synthetic.

const ROLLOUT = 'Roll the new onboarding out to every region'
const MARCO = '00000000-0000-4000-8000-0000000000b1'
const row = (page: Page, title: string) => page.locator('li.goal', { hasText: title })
const sheet = (page: Page) => page.getByRole('dialog', { name: ROLLOUT })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

async function open(page: Page, query = '') {
  await page.goto(`/room.html?demo=1&place=goals${query}`)
  await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
  await expect(sheet(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('owner · an admin gives the goal an owner and a date in its sheet, and its row says them', async ({ page }) => {
  await open(page)
  const owner = sheet(page).getByRole('combobox', { name: 'Owner' })
  await expect(owner).toHaveValue('')
  await owner.selectOption({ label: 'Marco' })
  await sheet(page).getByLabel('Target date').fill('2026-10-30')
  await sheet(page).getByRole('button', { name: 'Save' }).click()
  await expect(sheet(page).getByRole('status')).toHaveText('Saved')
  expect(await served(page)).toContain(`target:${MARCO}:2026-10-30:0`)
  await page.keyboard.press('Escape')
  await expect(row(page, ROLLOUT)).toContainText('Marco · due 30 Oct 2026')
})

test('owner · a viewer reads the owner and the date, with nothing to change', async ({ page }) => {
  await open(page, '&role=viewer&targets=1')
  await expect(sheet(page).locator('.goal-target')).toContainText('Marco')
  await expect(sheet(page).locator('.goal-target')).toContainText('30 Oct 2026')
  await expect(sheet(page).getByRole('combobox', { name: 'Owner' })).toHaveCount(0)
  await expect(sheet(page).getByRole('button', { name: 'Save' })).toHaveCount(0)
})

test('owner · a save someone else beat is said, and the sheet shows what stands now', async ({ page }) => {
  await open(page, '&targets=1')
  await expect(sheet(page).getByRole('combobox', { name: 'Owner' })).toHaveValue(MARCO)
  await page.evaluate(() => window.fixture?.staleTarget())
  await sheet(page).getByLabel('Target date').fill('2026-11-15')
  await sheet(page).getByRole('button', { name: 'Save' }).click()
  await expect(sheet(page).getByRole('alert')).toContainText('Someone changed it meanwhile')
  await expect(sheet(page).getByLabel('Target date')).toHaveValue('2026-12-01')
})
