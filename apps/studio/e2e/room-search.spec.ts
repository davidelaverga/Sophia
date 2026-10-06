import { expect, test, type Page } from '@playwright/test'

// Search the project (docs/plans/room-search.md): A13's `search`, behind the vision flag the fixture pages set. Every
// hit names its source and opens it. Every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Search this project' })
const field = (page: Page) => sheet(page).getByRole('searchbox', { name: 'Search this project' })
const hits = (page: Page) => sheet(page).getByRole('list', { name: 'Results' }).getByRole('listitem')
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html?people=2')
  await expect(page.locator('.room-stage')).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('search · / opens it; a query finds the decision and the report’s section, each with where it is from', async ({
  page,
}) => {
  await page.keyboard.press('/')
  await expect(field(page)).toBeFocused()
  await field(page).fill('fixture')
  await expect(hits(page).filter({ hasText: 'Keep the room checks on fixtures' })).toContainText('Decision · Oct 4')
  await expect(hits(page).filter({ hasText: 'Conclusion' })).toContainText('The fixture holds.')
  await expect(hits(page).filter({ hasText: 'Conclusion' })).toContainText('Report section ·')
})

test('search · a section opens the report at its heading, which takes the focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Search' }).click()
  await field(page).fill('holds')
  await hits(page).filter({ hasText: 'Conclusion' }).getByRole('button').click()
  await expect(sheet(page)).toHaveCount(0)
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByRole('heading', { name: 'Conclusion' })).toBeFocused()
  // A second section of the open report is placed too: each ask is its own.
  await page.keyboard.press('/')
  await field(page).fill('once')
  await hits(page).filter({ hasText: 'Recommendations' }).getByRole('button').click()
  await expect(pane.getByRole('heading', { name: 'Recommendations' })).toBeFocused()
  // Closed, the report gives the focus back to Search: what opened it went with the sheet.
  await pane.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Search' })).toBeFocused()
  // Opened again without a section, the report stays at its top: the last ask was its own.
  await page.keyboard.press('/')
  await field(page).fill('fixture report')
  await hits(page).filter({ hasText: 'Report ·' }).getByRole('button').click()
  await expect(pane).toBeVisible()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await expect(pane.getByRole('heading', { name: 'Recommendations' })).not.toBeFocused()
})

test('search · a meeting’s recap opens that meeting', async ({ page }) => {
  await page.keyboard.press('/')
  await field(page).fill('demo')
  await hits(page).filter({ hasText: 'Meeting recap · Oct 4, 15:00' }).getByRole('button').click()
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  await expect(recap.locator('.recap-head')).toHaveText('38 minutes · 2 members · 1 guest')
})

test('search · a decision opens the room with the brief', async ({ page }) => {
  await page.keyboard.press('/')
  await field(page).fill('room checks')
  // The decision, and the recap of the meeting it was taken in: each its own hit.
  await expect(hits(page)).toHaveCount(2)
  await hits(page).filter({ hasText: 'Decision · Oct 4' }).getByRole('button').click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Brief' })).toBeVisible()
})

test('search · nothing found says so, naming the query', async ({ page }) => {
  await page.keyboard.press('/')
  await field(page).fill('zebra')
  await expect(sheet(page)).toContainText('Nothing in this project matches “zebra”.')
})

test('search · More results reads the next page', async ({ page }) => {
  await page.keyboard.press('/')
  await field(page).fill('fixture')
  // The fixture answers three hits a page.
  await expect(hits(page)).toHaveCount(3)
  await sheet(page).getByRole('button', { name: 'More results' }).click()
  await expect(hits(page)).toHaveCount(4)
  await expect(sheet(page).getByRole('button', { name: 'More results' })).toHaveCount(0)
  expect((await served(page)).filter((s) => s.startsWith('search:'))).toEqual(['search:fixture:0', 'search:fixture:3'])
})

test('search · while the next query is read, the last one’s hits are not offered under it', async ({ page }) => {
  await page.getByRole('button', { name: 'Search' }).click()
  await field(page).fill('fixture')
  await expect(hits(page).filter({ hasText: 'Conclusion' })).toBeVisible()
  await page.evaluate(() => window.fixture?.holdSearch(true))
  await field(page).fill('room checks')
  await expect(sheet(page).getByText('Searching…')).toBeVisible()
  await expect(hits(page)).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdSearch(false))
  await expect(sheet(page).getByText('Searching…')).toHaveCount(0)
  await expect(hits(page).filter({ hasText: 'Keep the room checks on fixtures' }).first()).toBeVisible()
})

test('search · the running meeting’s recap, opened from a hit, is the running one until it is read: leaving opens no second', async ({
  page,
}) => {
  await page.goto('/room.html?people=2&call=on')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Search' }).click()
  await field(page).fill('room checks')
  const recapHit = hits(page).filter({ hasText: 'Meeting recap' })
  await expect(recapHit).toHaveCount(1)
  await page.evaluate(() => window.fixture?.holdRecaps())
  await recapHit.getByRole('button').click()
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  await expect(recap).toContainText('Putting the meeting together…')
  await recap.getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(recap.getByRole('group', { name: 'Your call' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
})
