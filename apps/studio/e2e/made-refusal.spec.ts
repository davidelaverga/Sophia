import { expect, test, type Page } from '@playwright/test'

// R 4307964688 (controlled room fixture, synthetic people and words, no real call or provider): the made card of a
// research task whose own read is refused (403) shows its one refusal recovery and keeps Close, never the transient
// "couldn't be read" words or a second Try again; a fresh allowed read restores it; an ordinary 503 keeps its retry.

const QUERY = 'call=on&people=2&floor=1&sophia=listening'
const made = (page: Page) => page.getByRole('group', { name: 'Made by Sophia' })
const REFUSED = 'This task isn’t available to you.'
const TRANSIENT = 'It couldn’t be read just now.'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto(`/room.html?${QUERY}`)
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
})

test('made card · its task refused: one refusal recovery, no transient words or second Try again, Close kept; allowed again, it restores', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture?.refuseTask(true))
  await page.evaluate(() => window.fixture?.notice())
  await expect(made(page).getByText(REFUSED)).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(9000) // past the read's own retries settling into an error
  const counts = {
    refused: await made(page).getByText(REFUSED).count(),
    transient: await made(page).getByText(TRANSIENT).count(),
    tryAgain: await made(page).getByRole('button', { name: 'Try again' }).count(),
    close: await made(page).getByRole('button', { name: 'Close' }).count(),
  }
  console.log(`MADE-REFUSED ${JSON.stringify(counts)}`)
  expect(counts).toEqual({ refused: 1, transient: 0, tryAgain: 1, close: 1 })
  await page.evaluate(() => window.fixture?.refuseTask(false))
  // The room's dock overlaps this card's line in the fixture layout: the reader's keyboard presses it.
  await made(page).getByRole('button', { name: 'Try again' }).press('Enter')
  await expect(made(page).getByText(REFUSED)).toHaveCount(0, { timeout: 15_000 })
  await expect(made(page).getByRole('button', { name: 'Show everyone' })).toBeVisible()
})

test('made card · an ordinary 503: its transient words and Try again stay; answered, it restores', async ({ page }) => {
  await page.evaluate(() => window.fixture?.failTask(true))
  await page.evaluate(() => window.fixture?.notice())
  await expect(made(page).getByText(TRANSIENT)).toBeVisible({ timeout: 20_000 })
  console.log(
    `MADE-503 refused=${String(await made(page).getByText(REFUSED).count())} tryAgain=${String(await made(page).getByRole('button', { name: 'Try again' }).count())}`,
  )
  await expect(made(page).getByText(REFUSED)).toHaveCount(0)
  await page.evaluate(() => window.fixture?.failTask(false))
  await made(page).getByRole('button', { name: 'Try again' }).click()
  await expect(made(page).getByText(TRANSIENT)).toHaveCount(0, { timeout: 15_000 })
  await expect(made(page).getByRole('button', { name: 'Show everyone' })).toBeVisible()
})
