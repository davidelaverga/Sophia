import { expect, test, type Page } from '@playwright/test'

// What was carried in from Personal (docs/plans/project-carried-in.md, Davide's chapter 1): Knowledge lists the notes
// members carried to the project, with who and when, behind the vision flag the fixture pages set. Every word is
// synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const carriedIn = (page: Page) => page.getByRole('region', { name: 'Carried in from Personal' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('carried in · Knowledge lists what was carried in, newest first, with who and when', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&carried=1')
  const items = carriedIn(page).getByRole('listitem')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('Ask finance for the March close')
  await expect(items.nth(0)).toContainText('Marco, from their Personal · Oct 6')
  await expect(items.nth(1)).toContainText('Start the deck from one number I trust')
  await expect(items.nth(1)).toContainText('You, from your Personal · Oct 5')
  await expect(items.nth(2)).toContainText('Lucía, from their Personal · Oct 5')
  // Inside Knowledge, under its head: with another project's reports, not shown.
  await page.locator('.knowledge').getByRole('button', { name: 'All projects' }).click()
  await expect(carriedIn(page)).toHaveCount(0)
})

test('carried in · with nothing carried, it says so', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await expect(carriedIn(page)).toContainText('Nothing carried in yet. A member can carry notes from their Personal.')
})

test('carried in · a read that fails says so, and Try again reads it', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&carried=1&projects=fail')
  await expect(carriedIn(page)).toContainText('What was carried in can’t be read now.', { timeout: 9000 })
  await page.evaluate(() => window.fixture?.failProjects(false))
  await carriedIn(page).getByRole('button', { name: 'Try again' }).click()
  await expect(carriedIn(page).getByRole('listitem')).toHaveCount(3)
})
