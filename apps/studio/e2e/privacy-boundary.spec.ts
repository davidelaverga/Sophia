import { expect, test, type Page } from '@playwright/test'

// R-C1 P2 r4307481563 / r4307481573 (controlled room fixture, synthetic people and words): once the report is refused
// to this person (its versions read answers not_found, a 422), the viewer's download status says nothing of the
// download before it, at once (not when the line would fade); and another member's showing card offers no Follow.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const V2 = '00000000-0000-4000-8000-0000000000d2'
const FIRST = 'The first version of a labelled fixture report.'
const ROOM = 'call=on&people=2&floor=1&sophia=listening'
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const status = (page: Page) => page.locator('.report-status')

/** The report refused: its versions read, asked again for another version, answers not_found. */
async function refuse(page: Page, query: string) {
  await page.evaluate(() => window.fixture?.failVersions('not_found'))
  await page.evaluate(
    ([report, version, q]) => {
      window.history.pushState(null, '', `/room.html?${q}report=${report}&version=${version}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [REPORT, V2, query],
  )
  await expect.poll(async () => (await served(page)).includes('versions:refused'), { timeout: 20_000 }).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('viewer status · a download’s filename, size and hash go the moment the report is refused', async ({ page }) => {
  await page.goto(`/room.html?report=${REPORT}`)
  const side = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(side.getByText(FIRST)).toBeVisible()
  const saved = page.waitForEvent('download')
  await side.getByRole('button', { name: 'Download', exact: true }).click()
  await saved
  await expect(status(page)).toContainText('Downloading') // the normal success line (control)
  await refuse(page, '')
  await expect(page.getByText('This report isn’t available to you.').first()).toBeVisible({ timeout: 20_000 })
  // Well before the line's 5 s fade: nothing of that download remains, and the line itself stays.
  await expect(status(page)).toHaveText('', { timeout: 1_000 })
  await expect(status(page)).toHaveCount(1)
})

test('refused Follow · another member’s showing card offers no Follow once the report is refused', async ({ page }) => {
  await page.goto(`/room.html?${ROOM}`)
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.evaluate(() => window.fixture?.show(1))
  const card = page.locator('.stage-showing')
  await expect(card.getByRole('button', { name: 'Follow' })).toBeVisible() // allowed: Follow offered (control)
  await refuse(page, `${ROOM}&`)
  await expect(card).toContainText('a report')
  await expect(card.getByRole('button', { name: 'Follow' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: /shown by/ })).toHaveCount(0) // nothing followed onto the stage
})
