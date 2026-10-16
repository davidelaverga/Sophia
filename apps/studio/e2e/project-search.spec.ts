import { expect, test, type Page } from '@playwright/test'

// The project's search (docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md, A38; the fixture pages answer it as the A13
// proposal they extend): a section opens the report at its heading; a message beyond the chat's 200 is read with the
// one page that ends at it, shown apart from the latest with a gap line the reader fills a page at a time; a mention on
// it is acknowledged once it is shown, never before; a failed read waits for Try again; nothing found and a failure say
// so differently. Every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Search this project' })
const field = (page: Page) => sheet(page).getByRole('searchbox', { name: 'Search this project' })
const hits = (page: Page) => sheet(page).getByRole('list', { name: 'Results' }).getByRole('listitem')
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const reads = async (page: Page) => (await served(page)).filter((s) => s.startsWith('discussion:'))
const seenOf = async (page: Page) => (await served(page)).filter((s) => s.startsWith('seen:'))
const gapLine = (page: Page) => discussion(page).locator('.discussion-gap')
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const entryIdOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`
const HERON = entryIdOf(2)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The room with 260 messages, the third saying «heron» and mentioning the reader; the search opened on «heron». */
async function searched(page: Page, query = 'discussion=260&heron=3&mentionOld=1') {
  await page.goto(`/room.html?people=2&${query}`)
  await expect(page.locator('.room-stage')).toBeVisible()
  await page.keyboard.press('/')
  await field(page).fill('heron')
  await expect(hits(page)).toHaveCount(1)
  await expect(hits(page)).toContainText('Message ·')
}

test('project search · a section opens the report at its heading', async ({ page }) => {
  await page.goto('/room.html?people=2')
  await expect(page.locator('.room-stage')).toBeVisible()
  await page.keyboard.press('/')
  await field(page).fill('holds')
  await hits(page).filter({ hasText: 'Conclusion' }).getByRole('button').click()
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByRole('heading', { name: 'Conclusion' })).toBeFocused()
})

test('project search · a message beyond the chat’s 200: one read ends at it, shown apart; its mention is seen once; the gap fills a page a press until it meets it', async ({
  page,
}) => {
  await searched(page)
  expect(await reads(page)).toEqual([])
  expect(await seenOf(page)).toEqual([])
  await hits(page).getByRole('button').click()
  const heron = discussion(page).locator(`[data-message="${HERON}"]`)
  await expect(heron).toBeInViewport()
  // Exactly one A23 read: the page before the message just after it.
  expect(await reads(page)).toEqual([`discussion:${entryIdOf(3)}`])
  await expect(page.getByText('The start of the room’s chat')).toBeVisible()
  // Apart from the latest, said so: the newest shown is still the latest, with nothing between pretended.
  await expect(gapLine(page)).toContainText('Newer messages aren’t shown here.')
  await expect(discussion(page).locator(`[data-message="${entryIdOf(3)}"]`)).toHaveCount(0)
  await expect(discussion(page).locator(`[data-message="${entryIdOf(259)}"]`)).toHaveCount(1)
  // Its mention, shown on its current revision, is acknowledged once.
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${HERON}`])
  // Each press reads one page under the gap, from the message after it, until it meets the page found.
  const below = [210, 160, 110, 60, 10]
  for (const [i, n] of below.entries()) {
    await gapLine(page).getByRole('button', { name: 'Show them' }).click()
    await expect.poll(() => reads(page)).toHaveLength(2 + i)
    expect((await reads(page)).at(-1)).toBe(`discussion:${entryIdOf(n)}`)
  }
  await expect(gapLine(page)).toHaveCount(0)
  await expect(discussion(page).locator('[data-message]')).toHaveCount(260)
  // Nothing more was read, and the mention was not acknowledged again.
  await page.waitForTimeout(300)
  expect(await reads(page)).toHaveLength(6)
  expect(await seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${HERON}`])
})

test('project search · the newest message found is in the chat already: no page is read', async ({ page }) => {
  await searched(page, 'discussion=260&heron=260')
  await hits(page).getByRole('button').click()
  await expect(discussion(page).locator(`[data-message="${entryIdOf(259)}"]`)).toBeInViewport()
  await page.waitForTimeout(300)
  expect(await reads(page)).toEqual([])
  await expect(gapLine(page)).toHaveCount(0)
})

test('project search · the page that ends at a found message fails: the failure and Try again stay, nothing more is read or seen; Try again shows it', async ({
  page,
}) => {
  await searched(page)
  await page.evaluate(() => window.fixture?.failEarlierReads(true))
  await hits(page).getByRole('button').click()
  await expect(page.getByText('The message you opened couldn’t be loaded.')).toBeVisible()
  await page.waitForTimeout(800)
  expect(await reads(page), 'one failed read, no automatic retries').toHaveLength(1)
  await expect(page.getByText('further back', { exact: false })).toHaveCount(0)
  await expect(page.getByText('isn’t in the chat anymore', { exact: false })).toHaveCount(0)
  expect(await seenOf(page)).toEqual([])
  await page.evaluate(() => window.fixture?.failEarlierReads(false))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(discussion(page).locator(`[data-message="${HERON}"]`)).toBeInViewport()
  expect(await reads(page)).toEqual([`discussion:${entryIdOf(3)}`, `discussion:${entryIdOf(3)}`])
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${HERON}`])
})

test('project search · nothing found and a failed search say different things; Try again asks again', async ({
  page,
}) => {
  await searched(page, 'discussion=60&heron=3')
  await field(page).fill('zebra')
  await expect(sheet(page)).toContainText('Nothing in this project matches “zebra”.')
  await page.evaluate(() => window.fixture?.failSearch(true))
  await field(page).fill('heron arrived')
  await expect(sheet(page).getByRole('alert')).toContainText('The search couldn’t be read.')
  await expect(sheet(page)).not.toContainText('Nothing in this project matches')
  await page.evaluate(() => window.fixture?.failSearch(false))
  await sheet(page).getByRole('button', { name: 'Try again' }).click()
  await expect(hits(page)).toHaveCount(1)
})
