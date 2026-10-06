import { expect, test, type Page } from '@playwright/test'

// The meeting ends, the project continues (docs/plans/room-return.md, Davide's chapter 5): the recap is the record at
// close, and what its work made later comes as «After the meeting», never inside the recap. Behind the vision flag the
// fixture pages set. Every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const recap = (page: Page) => page.getByRole('dialog', { name: 'This meeting' })
const part = (page: Page, name: string) => recap(page).getByRole('region', { name })
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' }).first()

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The recap's own sections: what was recorded by the close, «After the meeting» aside. */
const recordAtClose = (page: Page) =>
  recap(page)
    .locator('.recap-section')
    .filter({ hasNot: page.getByRole('heading', { name: 'After the meeting' }) })

/** In the call with Sophia's research running; leave, and close the meeting from its recap. */
async function closeWithResearchRunning(page: Page) {
  await page.goto('/room.html?call=on&people=2&research=running')
  await expect(leave(page)).toBeVisible()
  await leave(page).click()
  await recap(page).getByRole('button', { name: 'Close the meeting' }).click()
  await expect(recap(page).getByRole('button', { name: 'Close the meeting' })).toHaveCount(0)
  await expect(recap(page).locator('.recap-said')).toContainText('Closed')
  // Read again as final: the record at close.
  await expect(part(page, 'Work')).toContainText('still running at close')
}

test('return · closed with research running, the recap says it was still running at close, and nothing came yet', async ({
  page,
}) => {
  await closeWithResearchRunning(page)
  await expect(part(page, 'Work')).toContainText('research')
  await expect(part(page, 'Work')).toContainText('still running at close')
  await expect(part(page, 'After the meeting')).toContainText('Nothing yet. The work goes on after the meeting.')
})

test('return · what the research made later comes after the meeting, and the recap at close is unchanged', async ({
  page,
}) => {
  await closeWithResearchRunning(page)
  const atClose = await recordAtClose(page).allInnerTexts()
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.fixture?.researchDone())
  // The next morning: the meeting from Updates.
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Updates' }).click()
  // «Since you last looked» is the project now, not the record at close: the research is no longer running there.
  const since = page.getByRole('region', { name: 'Since you last looked' })
  await expect(since).toBeVisible()
  await expect(since).not.toContainText('running')
  await page.locator('.meeting-rows').getByRole('button').first().click()
  const after = part(page, 'After the meeting')
  await expect(after).toContainText('Fixture report ready · v1')
  expect(await recordAtClose(page).allInnerTexts()).toEqual(atClose)
  await after.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
})

test('return · a meeting still running has nothing «after» it', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&research=running')
  await expect(leave(page)).toBeVisible()
  await leave(page).click()
  await expect(part(page, 'Work')).toContainText('running')
  await expect(part(page, 'After the meeting')).toHaveCount(0)
  await expect(part(page, 'Work')).not.toContainText('at close')
})
