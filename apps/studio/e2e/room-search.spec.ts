import { expect, test, type Locator, type Page } from '@playwright/test'

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
  await expect(recap.locator('.recap-head')).toHaveText('38 min · 2 members · 1 guest')
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

declare global {
  interface Window {
    /** The page's reads of the project's latest meeting, as this check watches them (room-search.spec.ts). */
    latestMeeting?: { reads: number; mode: 'answer' | 'hold' | 'fail'; held: (() => void)[] }
  }
}

/**
 * The page's reads of the project's latest meeting from now on, counted: answered as before, held until released (and
 * every later one answered at once), or refused as the API does while it can't read. Its own fetch, wrapped.
 */
const watchLatest = (page: Page, mode: 'answer' | 'hold' | 'fail' = 'answer') =>
  page.evaluate((how) => {
    const own = window.fetch
    const latest = { reads: 0, mode: how, held: [] as (() => void)[] }
    window.latestMeeting = latest
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.includes('/meetings?limit=1')) return own(input, init)
      latest.reads += 1
      if (latest.mode === 'fail') return new Response(JSON.stringify({ code: 'unavailable' }), { status: 503 })
      if (latest.mode === 'hold') await new Promise<void>((release) => latest.held.push(release))
      return own(input, init)
    }
  }, mode)
const latestReads = (page: Page) => page.evaluate(() => window.latestMeeting?.reads ?? 0)
const releaseLatest = (page: Page) =>
  page.evaluate(() => {
    const latest = window.latestMeeting
    if (!latest) return
    latest.mode = 'answer'
    for (const release of latest.held.splice(0)) release()
  })
/** What a read answered has been rendered, and its effects run. */
const settled = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))),
  )

/** In the call, Search's recap hit for `words` opened, with the meeting's recap held, and `watch`ing the latest one. */
async function recapFromSearch(page: Page, words: string, watch: Parameters<typeof watchLatest>[1]) {
  await page.goto('/room.html?people=2&call=on')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Search' }).click()
  await field(page).fill(words)
  const recapHit = hits(page).filter({ hasText: 'Meeting recap' })
  await expect(recapHit).toHaveCount(1)
  await page.evaluate(() => window.fixture?.holdRecaps())
  await watchLatest(page, watch)
  await recapHit.getByRole('button').click()
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  await expect(recap).toContainText('Putting the meeting together…')
  await expect.poll(() => latestReads(page)).toBeGreaterThan(0)
  return recap
}

/** Leave from the sheet's own call row; the leave has been taken. */
async function leaveFrom(page: Page, recap: Locator) {
  await recap.getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(recap.getByRole('group', { name: 'Your call' })).toHaveCount(0)
  await settled(page)
}

test('search · a past meeting’s recap, opened from a hit and not yet read, leaves Leave its own recap, on top', async ({
  page,
}) => {
  // Neither its recap nor the latest meeting is read yet (Codex on #130 and #138): the leave's recap waits for them.
  const recap = await recapFromSearch(page, 'room checks', 'hold')
  await leaveFrom(page, recap)
  await expect(recap).toHaveCount(1)
  await releaseLatest(page)
  await expect(recap).toHaveCount(2)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(recap.filter({ hasText: 'Pilot the fixture with fourteen teams' })).toHaveCount(1)
  // The recap of the call left is on top: Escape puts it away, and the past meeting's is still there.
  await page.keyboard.press('Escape')
  await expect(recap).toHaveCount(1)
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Keep the room checks on fixtures')
})

test('search · the running meeting’s recap, opened from a hit, is the running one before it is read: leaving opens no second', async ({
  page,
}) => {
  const recap = await recapFromSearch(page, 'fourteen teams', 'answer')
  // The project's latest meeting, read as the sheet opens, says this one runs.
  await settled(page)
  await leaveFrom(page, recap)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Pilot the fixture with fourteen teams')
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('search · leaving the running meeting’s recap before anything says it runs still opens no second (Codex on #138)', async ({
  page,
}) => {
  const recap = await recapFromSearch(page, 'fourteen teams', 'hold')
  await leaveFrom(page, recap)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await releaseLatest(page)
  await expect.poll(() => latestReads(page)).toBeGreaterThan(0)
  await settled(page)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Pilot the fixture with fourteen teams')
  await settled(page)
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('search · when the latest meeting can’t be read, the running meeting’s own recap says it runs: no second', async ({
  page,
}) => {
  const recap = await recapFromSearch(page, 'fourteen teams', 'fail')
  await leaveFrom(page, recap)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Pilot the fixture with fourteen teams')
  await settled(page)
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('search · closing a recap that can’t tell yet lets the leave’s own recap open (Codex on #138)', async ({
  page,
}) => {
  const recap = await recapFromSearch(page, 'fourteen teams', 'hold')
  await leaveFrom(page, recap)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  // The leave's recap reads the latest meeting for itself: it opened once the unsure sheet closed.
  await expect.poll(() => latestReads(page)).toBe(2)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await releaseLatest(page)
  await page.evaluate(() => window.fixture?.releaseRecaps())
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Pilot the fixture with fourteen teams')
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('search · with both its reads failed, the running meeting’s sheet still can’t tell: its leave waits until it closes (Codex on #138)', async ({
  page,
}) => {
  await page.goto('/room.html?people=2&call=on')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Search' }).click()
  await field(page).fill('fourteen teams')
  const recapHit = hits(page).filter({ hasText: 'Meeting recap' })
  await expect(recapHit).toHaveCount(1)
  await page.evaluate(() => window.fixture?.failRecaps(true))
  await watchLatest(page, 'fail')
  await recapHit.getByRole('button').click()
  const recap = page.getByRole('dialog', { name: 'This meeting' })
  await expect(recap).toContainText('The recap couldn’t be read.')
  await leaveFrom(page, recap)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  // Closed, it can't tell any more: the leave's own recap opens, and reads for itself.
  await page.evaluate(() => window.fixture?.failRecaps(false))
  await releaseLatest(page)
  await page.keyboard.press('Escape')
  await expect(recap.getByRole('region', { name: 'Decided' })).toContainText('Pilot the fixture with fourteen teams')
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('search · as soon as the words change, the last query’s hits are not offered', async ({ page }) => {
  await page.getByRole('button', { name: 'Search' }).click()
  await field(page).fill('fixture')
  await expect(hits(page).filter({ hasText: 'Conclusion' })).toBeVisible()
  await field(page).fill('room checks')
  // Before the words settle (a quarter second): none of the last query's hits.
  expect(await hits(page).count()).toBe(0)
  await expect(hits(page).filter({ hasText: 'Keep the room checks on fixtures' }).first()).toBeVisible()
})
