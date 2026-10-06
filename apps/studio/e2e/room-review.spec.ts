import { expect, test, type Page } from '@playwright/test'

// Approve a version, or ask for changes (docs/plans/room-review.md): a proposed A16, behind the vision flag the
// fixture pages set. Every word is synthetic.

const REPORT = '00000000-0000-4000-8000-0000000000b1'

const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const row = (page: Page) => pane(page).getByRole('group', { name: 'Review' })
const said = (page: Page) => row(page).locator('.review-said')
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const reviews = async (page: Page) => (await served(page)).filter((s) => s.startsWith('review:'))

async function open(page: Page, query = '') {
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}${query}`)
  await expect(pane(page).getByText('The fixture holds.')).toBeVisible()
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

test('review · Approve records it once, says so, and leaves asking for changes open; the focus is on its words', async ({
  page,
}) => {
  await open(page)
  await expect(said(page)).toHaveText('Not reviewed yet.')
  await row(page).getByRole('button', { name: 'Approve v1' }).click()
  await expect(said(page)).toHaveText('Approved by you.')
  await expect(said(page)).toBeFocused()
  await expect(row(page).getByRole('button', { name: 'Approve v1' })).toHaveCount(0)
  await expect(row(page).getByRole('button', { name: 'Request changes' })).toBeVisible()
  expect(await reviews(page)).toEqual(['review:approved'])
})

test('review · Request changes needs words, records them, and Sophia’s next version is offered live', async ({
  page,
}) => {
  await open(page)
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  const field = row(page).getByRole('textbox', { name: 'What should change?' })
  await expect(field).toBeFocused()
  await row(page).getByRole('button', { name: 'Send' }).click()
  await expect(row(page).getByRole('alert')).toHaveText('Say what should change first.')
  expect(await reviews(page)).toEqual([])
  await field.fill('Shorten the conclusion')
  await expect(row(page).getByRole('alert')).toHaveCount(0)
  await row(page).getByRole('button', { name: 'Send' }).click()
  await expect(said(page)).toHaveText('Changes requested by you: “Shorten the conclusion”. Sophia is revising.')
  expect(await reviews(page)).toEqual(['review:changes_requested'])
  await page.evaluate(() => window.fixture?.reviseLive())
  await expect(pane(page).locator('.report-current').getByRole('button', { name: 'Show it' })).toBeVisible()
})

test('review · Cancel keeps the words, and gives the focus back to Request changes', async ({ page }) => {
  await open(page)
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  await row(page).getByRole('textbox', { name: 'What should change?' }).fill('Name the sources')
  await row(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(row(page).getByRole('button', { name: 'Request changes' })).toBeFocused()
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  await expect(row(page).getByRole('textbox', { name: 'What should change?' })).toHaveValue('Name the sources')
})

test('review · each version has its own: what was said of v2 is not said of v1', async ({ page }) => {
  await open(page, '&versions=2')
  await row(page).getByRole('button', { name: 'Approve v2' }).click()
  await expect(said(page)).toHaveText('Approved by you.')
  // An ask left open on v2 is v2's: it doesn't follow the reader to v1.
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  await row(page).getByRole('textbox', { name: 'What should change?' }).fill('For v2 only')
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  await pane(page).getByRole('button', { name: 'Show this version' }).click()
  await expect(row(page).getByRole('button', { name: 'Approve v1' })).toBeVisible()
  await expect(said(page)).toHaveText('Not reviewed yet.')
  await expect(row(page).getByRole('textbox', { name: 'What should change?' })).toHaveCount(0)
})

test('review · a viewer sees the latest review, and no buttons', async ({ page }) => {
  await open(page, '&role=viewer')
  await expect(said(page)).toHaveText('Not reviewed yet.')
  await expect(row(page).getByRole('button')).toHaveCount(0)
  // Another member approves it: a record, so the row reads it as the feed moves.
  await page.evaluate(() => window.fixture?.reviewAs('approved'))
  await expect(said(page)).toHaveText('Approved by a member.')
})

test('review · on a version already reviewed, a lost reply still offers Try again, and records once', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.fixture?.reviewAs('approved'))
  await expect(said(page)).toHaveText('Approved by a member.')
  await page.evaluate(() => window.fixture?.loseNextReviewReply())
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  await row(page).getByRole('textbox', { name: 'What should change?' }).fill('Add a table')
  await row(page).getByRole('button', { name: 'Send' }).click()
  await expect(said(page)).toHaveText('Not sent. Try again.')
  const again = row(page).getByRole('button', { name: 'Try again' })
  await again.click()
  await expect(said(page)).toHaveText('Changes requested by you: “Add a table”. Sophia is revising.')
  expect(await reviews(page)).toEqual(['review:changes_requested'])
})

test('review · with no reply, only that press is offered again, and it records it once', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.loseNextReviewReply())
  await row(page).getByRole('button', { name: 'Approve v1' }).click()
  await expect(said(page)).toHaveText('Not sent. Try again.')
  await expect(row(page).getByRole('button', { name: 'Request changes' })).toHaveCount(0)
  await row(page).getByRole('button', { name: 'Try again' }).click()
  await expect(said(page)).toHaveText('Approved by you.')
  expect(await reviews(page)).toEqual(['review:approved'])
})

const reads = async (page: Page) => (await served(page)).filter((s) => s === 'reviews:read').length

test('review · another member’s review never settles a press of mine that had no reply', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.dropNextReview())
  await row(page).getByRole('button', { name: 'Approve v1' }).click()
  await expect(said(page)).toHaveText('Not sent. Try again.')
  const before = await reads(page)
  await page.evaluate(() => window.fixture?.reviewAs('changes_requested'))
  // Read: the member's review is on the page, and mine is not among what arrived.
  await expect.poll(() => reads(page)).toBeGreaterThan(before)
  await expect(said(page)).toHaveText('Not sent. Try again.')
  await row(page).getByRole('button', { name: 'Try again' }).click()
  await expect(said(page)).toHaveText('Approved by you.')
  expect(await reviews(page)).toEqual(['review:approved'])
})

test('review · a press of mine with no reply is settled by its own record, as the feed brings it', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.loseNextReviewReply())
  await row(page).getByRole('button', { name: 'Approve v1' }).click()
  await expect(said(page)).toHaveText('Not sent. Try again.')
  await page.evaluate(() => window.fixture?.update())
  await expect(said(page)).toHaveText('Approved by you.')
  await expect(row(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(await reviews(page)).toEqual(['review:approved'])
})

// Follow-ups (docs/plans/room-follow-ups-3.md): what settles a press, a write on its way, a read that fails, a late
// reply's place, and any report's reviews.

async function askChanges(page: Page, words: string) {
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  await row(page).getByRole('textbox', { name: 'What should change?' }).fill(words)
  await row(page).getByRole('button', { name: 'Send' }).click()
}

test('review · a lost request isn’t settled by my other device asking for different changes', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.dropNextReview())
  await askChanges(page, 'Add a table')
  await expect(said(page)).toHaveText('Not sent. Try again.')
  const before = await page.evaluate(() => window.fixture?.served.filter((s) => s === 'reviews:read').length ?? 0)
  await page.evaluate(() => window.fixture?.reviewAsMe('changes_requested', 'Name the sources'))
  await expect
    .poll(() => page.evaluate(() => window.fixture?.served.filter((s) => s === 'reviews:read').length ?? 0))
    .toBeGreaterThan(before)
  // Read and drawn: the other device's review is on the page, and it settles nothing of this press.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 500)))
  await expect(said(page)).toHaveText('Not sent. Try again.')
  await row(page).getByRole('button', { name: 'Try again' }).click()
  await expect(said(page)).toHaveText('Changes requested by you: “Add a table”. Sophia is revising.')
})

test('review · a record that came while the press was sending settles it once the reply is lost', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.publishThenLoseReview())
  await row(page).getByRole('button', { name: 'Approve v1' }).click()
  await expect(said(page)).toHaveText('Approved by you.')
  await expect(row(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(await reviews(page)).toEqual(['review:approved'])
})

test('review · a lost request settled by the feed closes the ask: no Send, its words are the row’s', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.fixture?.loseNextReviewReply())
  await askChanges(page, 'Shorten the conclusion')
  await expect(said(page)).toHaveText('Not sent. Try again.')
  await page.evaluate(() => window.fixture?.update())
  await expect(said(page)).toHaveText('Changes requested by you: “Shorten the conclusion”. Sophia is revising.')
  await expect(row(page).getByRole('button', { name: 'Send' })).toHaveCount(0)
  await expect(row(page).getByRole('textbox')).toHaveCount(0)
})

test('review · a write on its way says so, then the slow note', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.holdReviews(true))
  await row(page).getByRole('button', { name: 'Approve v1' }).click()
  await expect(row(page).getByRole('button', { name: 'Approving…' })).toBeVisible()
  await expect(row(page).locator('.wait-note')).toBeVisible({ timeout: 9000 })
  await page.evaluate(() => window.fixture?.releaseReviews())
  await expect(said(page)).toHaveText('Approved by you.')
  await expect(row(page).locator('.wait-note')).toHaveCount(0)
})

test('review · a first read that fails says so, and Try again reads it', async ({ page }) => {
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}&reviews=fail`)
  await expect(pane(page).getByText('The fixture holds.')).toBeVisible()
  await expect(row(page).getByText('Reviews can’t be read now.')).toBeVisible({ timeout: 9000 })
  await page.evaluate(() => window.fixture?.failReviewReads(false))
  await row(page).getByRole('button', { name: 'Try again' }).click()
  await expect(said(page)).toHaveText('Not reviewed yet.')
  await expect(row(page).getByRole('button', { name: 'Approve v1' })).toBeVisible()
})

test('review · a late reply doesn’t put an older review above a newer one', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.holdReviews(true))
  await askChanges(page, 'Add a table')
  await expect(row(page).getByRole('button', { name: 'Sending…' })).toBeVisible()
  // Mine is recorded first; a member's approval comes after it, and the feed brings both, newest first.
  await page.evaluate(() => window.fixture?.reviewAs('approved'))
  await expect(said(page)).toHaveText('Approved by a member.')
  await page.evaluate(() => window.fixture?.releaseReviews())
  await expect(row(page).getByRole('button', { name: 'Sending…' })).toHaveCount(0)
  await expect(said(page)).toHaveText('Approved by a member.')
})

test('review · the reading report takes a review too', async ({ page }) => {
  await page.goto('/room.html?call=on&exchange=open&report=00000000-0000-4000-8000-0000000000f0')
  const reading = page.locator('.report-pane .review-row')
  await expect(reading.getByRole('button', { name: /^Approve v/ })).toBeVisible()
  await reading.getByRole('button', { name: /^Approve v/ }).click()
  await expect(reading.locator('.review-said')).toHaveText('Approved by you.')
})

test('review · while its reviews are read, the row says so', async ({ page }) => {
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}&reviews=hold`)
  await expect(pane(page).getByText('The fixture holds.')).toBeVisible()
  await expect(row(page).getByText('Reading reviews…')).toBeVisible()
  await page.evaluate(() => window.fixture?.releaseReviewReads())
  await expect(said(page)).toHaveText('Not reviewed yet.')
})

test('review · nothing is approved before its text is on screen', async ({ page }) => {
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}&hold=text`)
  await expect(said(page)).toHaveText('Not reviewed yet.')
  await expect(row(page).getByRole('button')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.releaseText())
  await expect(pane(page).getByText('The fixture holds.')).toBeVisible()
  await expect(row(page).getByRole('button', { name: 'Approve v1' })).toBeVisible()
})

test('review · a refresh that fails as the feed moves keeps what was read, and its presses', async ({ page }) => {
  await open(page)
  await row(page).getByRole('button', { name: 'Request changes' }).click()
  await row(page).getByRole('textbox', { name: 'What should change?' }).fill('Half typed')
  await page.evaluate(() => window.fixture?.failReviewReads(true))
  await page.evaluate(() => window.fixture?.update())
  // Both tries of the refresh fail (a retry waits about a second).
  await page.evaluate(() => new Promise((done) => setTimeout(done, 3000)))
  await expect(row(page).getByText('Reviews can’t be read now.')).toHaveCount(0)
  await expect(said(page)).toHaveText('Not reviewed yet.')
  await expect(row(page).getByRole('textbox', { name: 'What should change?' })).toHaveValue('Half typed')
})
