import { expect, test, type Page } from '@playwright/test'

// R-C1-b8 P2 r4307115221 (controlled fixture, synthetic people and words): a presentation whose report is refused to
// this person (its versions read answers not_found, a 422, fencing the report) shows nothing of the report, yet keeps
// the stage's own way out (Stop following / Stop showing); pressing it ends following or showing, and the report stays
// refused until its own read is allowed again.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const V1 = '00000000-0000-4000-8000-0000000000d1'
const QUERY = 'call=on&people=2&floor=1&sophia=listening'

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const card = (page: Page) => page.locator('.stage-showing')
const shown = (page: Page) => page.getByRole('region', { name: /^Fixture report, shown by/ })
const refused = (page: Page) => page.getByRole('region', { name: 'Report', exact: true })
const made = (page: Page) => page.getByRole('group', { name: 'Made by Sophia' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

/** The report refused to this person: its versions read, opened in the pane, answers not_found (a 422). */
async function refuseReport(page: Page) {
  await page.evaluate(() => window.fixture?.failVersions('not_found'))
  await page.evaluate(
    ([report, version, query]) => {
      window.history.pushState(null, '', `/room.html?${query}&report=${report}&version=${version}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [REPORT, V1, QUERY],
  )
  await expect.poll(async () => (await served(page)).includes('versions:refused'), { timeout: 20_000 }).toBe(true)
}

async function expectNothingOfTheReport(page: Page) {
  await expect(shown(page)).toHaveCount(0)
  await expect(refused(page)).toBeVisible({ timeout: 20_000 })
  await expect(refused(page)).not.toContainText('Fixture report')
  await expect(refused(page)).not.toContainText('Shown by')
  await expect(refused(page)).not.toContainText('The fixture holds.')
  await expect(refused(page).getByRole('button', { name: /Download|Open|Show everyone/ })).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto(`/room.html?${QUERY}`)
  await expect(leave(page)).toBeVisible()
})

test('refused presentation · a follower keeps Stop following, and it stops following', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(shown(page)).toBeVisible()
  await refuseReport(page)
  await expectNothingOfTheReport(page)
  await refused(page).getByRole('button', { name: 'Stop following' }).click()
  await expect(refused(page)).toHaveCount(0)
  await expect(card(page)).toBeVisible()
  await expect(shown(page)).toHaveCount(0)
  // Leaving the stage lifts nothing: the report's refusal is still what the open pane holds.
  await expect(page.getByText('This report isn’t available to you.').first()).toBeAttached()
})

test('refused presentation · the presenter keeps Stop showing, and it stops showing', async ({ page }) => {
  await page.evaluate(() => window.fixture?.notice())
  await made(page).getByRole('button', { name: 'Show everyone' }).click()
  await expect(shown(page)).toBeVisible()
  await refuseReport(page)
  await expectNothingOfTheReport(page)
  await refused(page).getByRole('button', { name: 'Stop showing' }).click()
  await expect(refused(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s.startsWith('focus:'))).toEqual([`focus:${V1}`, 'focus:none'])
  await expect(page.getByText('This report isn’t available to you.').first()).toBeAttached()
})
