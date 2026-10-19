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

// A read that fails is said in place, never as «none» (docs/plans/silent-reads.md; the reliability baseline's gap #4).
const UNREAD = 'The owner and date can’t be read right now.'

test('owner · an admin whose members can’t be read is told so, and offered no «No owner» for it', async ({ page }) => {
  await open(page, '&targets=1&membersRead=fail')
  const unread = sheet(page).locator('.goal-target').getByRole('alert')
  await expect(unread).toContainText(UNREAD, { timeout: 20_000 })
  await expect(sheet(page).getByRole('combobox', { name: 'Owner' })).toHaveCount(0)
  await page.evaluate(() => window.fixture?.failMembers(false))
  await unread.getByRole('button', { name: 'Try again' }).click()
  await expect(unread).toHaveCount(0)
  await expect(sheet(page).getByRole('combobox', { name: 'Owner' })).toHaveValue(MARCO)
})

test('owner · a viewer whose targets can’t be read is told so, never «none»', async ({ page }) => {
  await open(page, '&role=viewer&targets=1&targetsRead=fail')
  const section = sheet(page).locator('.goal-target')
  await expect(section.getByRole('alert')).toContainText(UNREAD, { timeout: 20_000 })
  await expect(section).not.toContainText('none')
  await page.evaluate(() => window.fixture?.failTargets(false))
  await section.getByRole('button', { name: 'Try again' }).click()
  await expect(section).toContainText('Marco')
  await expect(section).toContainText('30 Oct 2026')
  await expect(section.getByRole('alert')).toHaveCount(0)
})

test('owner · a targets read that fails after the project moved keeps the owner, the date and an unsaved edit', async ({
  page,
}) => {
  await open(page, '&targets=1')
  const section = sheet(page).locator('.goal-target')
  await expect(sheet(page).getByRole('combobox', { name: 'Owner' })).toHaveValue(MARCO)
  await sheet(page).getByLabel('Target date').fill('2026-11-15')
  await page.evaluate(() => window.fixture?.failTargets(true))
  await page.evaluate(() => window.fixture?.say('Something moves the project'))
  // The read asked again as the project moves fails all four tries (the first and three more), then a frame is drawn.
  await expect
    .poll(async () => (await served(page)).filter((s) => s === 'targets-refused').length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(4)
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await expect(section.getByRole('alert')).toHaveCount(0)
  await expect(sheet(page).getByRole('combobox', { name: 'Owner' })).toHaveValue(MARCO)
  await expect(sheet(page).getByLabel('Target date')).toHaveValue('2026-11-15')
})
