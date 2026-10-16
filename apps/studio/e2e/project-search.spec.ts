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

/** Presses the search hit whose words end with «message N.» (`heron=` messages). */
async function pressHeron(page: Page, n: number) {
  // The head's Search: after an open, the chat's bar has the focus, where `/` is typed.
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill('heron')
  await hits(page)
    .filter({ hasText: `message ${String(n)}.` })
    .getByRole('button')
    .click()
}

/** Opens that hit and waits for its message in the chat's view. */
async function openHeron(page: Page, n: number) {
  await pressHeron(page, n)
  await expect(discussion(page).locator(`[data-message="${entryIdOf(n - 1)}"]`)).toBeInViewport()
}

/** The ids shown, in order, and where the gap lines stand (after which message). */
const layout = (page: Page) =>
  discussion(page).evaluate((list) =>
    [...list.children].map((li) =>
      li.classList.contains('discussion-gap')
        ? 'gap'
        : li instanceof HTMLElement
          ? (li.dataset.message ?? li.id)
          : li.id,
    ),
  )
const n = (id: string) => Number(id.slice(-12)) // entryIdOf(i) ends with i + 1

test('project search · two sequential opens, 100 then 125: the unread messages between stay behind a gap, filled a page a press (R-C4-01)', async ({
  page,
}) => {
  await page.goto('/room.html?people=2&discussion=260&heron=100,125')
  await expect(page.locator('.room-stage')).toBeVisible()
  await openHeron(page, 100)
  await openHeron(page, 125)
  expect(await reads(page)).toEqual([`discussion:${entryIdOf(100)}`, `discussion:${entryIdOf(125)}`])
  // 51–125 read, 126–210 not: the gap is after 125, before 211.
  const shown = await layout(page)
  const at = shown.indexOf('gap')
  expect(at, 'a gap line is shown').toBeGreaterThan(0)
  expect(n(shown[at - 1] ?? '')).toBe(125)
  expect(n(shown[at + 1] ?? '')).toBe(211)
  expect(shown.filter((s) => s === 'gap')).toHaveLength(1)
  // Each press reads one page under the gap, until it meets 125.
  for (const [i, before] of [210, 160].entries()) {
    await gapLine(page).getByRole('button', { name: 'Show them' }).click()
    await expect.poll(() => reads(page)).toHaveLength(3 + i)
    expect((await reads(page)).at(-1)).toBe(`discussion:${entryIdOf(before)}`)
  }
  await expect(gapLine(page)).toHaveCount(0)
  const all = (await layout(page)).filter((s) => s !== 'gap').map(n)
  expect(all).toEqual(Array.from({ length: 210 }, (_, i) => i + 51))
})

test('project search · a disjoint second open keeps both unread intervals behind their own gaps', async ({ page }) => {
  await page.goto('/room.html?people=2&discussion=260&heron=40,150')
  await expect(page.locator('.room-stage')).toBeVisible()
  await openHeron(page, 150)
  await openHeron(page, 40)
  expect(await reads(page)).toEqual([`discussion:${entryIdOf(150)}`, `discussion:${entryIdOf(40)}`])
  // Read: 1–40 (the start), 101–150, 211–260. Unread: 41–100 and 151–210, each behind a gap.
  const shown = await layout(page)
  const gaps = shown.flatMap((s, i) => (s === 'gap' ? [[n(shown[i - 1] ?? ''), n(shown[i + 1] ?? '')]] : []))
  expect(gaps).toEqual([
    [40, 101],
    [150, 211],
  ])
  await expect(page.getByText('The start of the room’s chat')).toBeVisible()
  // Each press reads one page under its own gap, and leaves the other: the lower one (151–210) in two, from 211 then
  // 161; the upper one (41–100) in two, from 101 then 51.
  const press = async (gap: number, before: number, count: number, left: number) => {
    await gapLine(page).nth(gap).getByRole('button', { name: 'Show them' }).click()
    await expect.poll(() => reads(page)).toHaveLength(count)
    expect((await reads(page)).at(-1)).toBe(`discussion:${entryIdOf(before - 1)}`)
    await expect(gapLine(page)).toHaveCount(left)
  }
  await press(1, 211, 3, 2)
  await press(1, 161, 4, 1)
  await press(0, 101, 5, 1)
  await press(0, 51, 6, 0)
  expect((await layout(page)).filter((s) => s !== 'gap').map(n)).toEqual(Array.from({ length: 260 }, (_, i) => i + 1))
})

/** What the chat holds, as runs of message numbers with the gaps between them. */
async function runs(page: Page) {
  const out: string[] = []
  let from: number | null = null
  let last: number | null = null
  for (const item of await layout(page)) {
    if (item === 'gap') {
      if (from !== null) out.push(`${String(from)}–${String(last)}`, 'gap')
      from = null
      continue
    }
    const k = n(item)
    if (from === null || last === null || k !== last + 1) {
      if (from !== null) out.push(`${String(from)}–${String(last)}`)
      from = k
    }
    last = k
  }
  if (from !== null) out.push(`${String(from)}–${String(last)}`)
  return out
}

/** Both reads done, whatever order they answered in: every page read is held, each gap where messages are unread. */
const BOTH_READ = ['1–40', 'gap', '51–100', 'gap', '161–260']

test('project search · a slow Show them and a later search open: the open answers first, then the fill; both pages stay (R-C4-02)', async ({
  page,
}) => {
  await page.goto('/room.html?people=2&discussion=260&heron=40,100')
  await expect(page.locator('.room-stage')).toBeVisible()
  await openHeron(page, 100)
  // The fill under the gap (before 211) is slow; the search's read for 40 (before 41) is not.
  await page.evaluate((id) => window.fixture?.holdEarlierBefore([id]), entryIdOf(210))
  await gapLine(page).getByRole('button', { name: 'Show them' }).click()
  await expect.poll(() => reads(page)).toHaveLength(2)
  await openHeron(page, 40)
  expect(await reads(page)).toEqual([
    `discussion:${entryIdOf(100)}`,
    `discussion:${entryIdOf(210)}`,
    `discussion:${entryIdOf(40)}`,
  ])
  await page.evaluate(() => window.fixture?.releaseEarlierReads())
  await expect(discussion(page).locator(`[data-message="${entryIdOf(209)}"]`)).toHaveCount(1)
  // The message opened stays, with the start, and both pages read.
  await expect(discussion(page).locator(`[data-message="${entryIdOf(39)}"]`)).toHaveCount(1)
  expect(await runs(page)).toEqual(BOTH_READ)
  await expect(page.getByText('The start of the room’s chat')).toBeVisible()
  expect(await reads(page)).toHaveLength(3)
})

test('project search · a slow search open and a Show them meanwhile: the fill answers first, then the open; both pages stay (R-C4-02)', async ({
  page,
}) => {
  await page.goto('/room.html?people=2&discussion=260&heron=40,100')
  await expect(page.locator('.room-stage')).toBeVisible()
  await openHeron(page, 100)
  // The search's read for 40 (before 41) is slow; the fill under the gap (before 211) is not.
  await page.evaluate((id) => window.fixture?.holdEarlierBefore([id]), entryIdOf(40))
  await pressHeron(page, 40)
  await expect.poll(() => reads(page)).toHaveLength(2)
  await gapLine(page).getByRole('button', { name: 'Show them' }).click()
  await expect(discussion(page).locator(`[data-message="${entryIdOf(209)}"]`)).toHaveCount(1)
  expect(await reads(page)).toEqual([
    `discussion:${entryIdOf(100)}`,
    `discussion:${entryIdOf(40)}`,
    `discussion:${entryIdOf(210)}`,
  ])
  await page.evaluate(() => window.fixture?.releaseEarlierReads())
  await expect(discussion(page).locator(`[data-message="${entryIdOf(39)}"]`)).toBeInViewport()
  // The fill read meanwhile stays.
  await expect(discussion(page).locator(`[data-message="${entryIdOf(209)}"]`)).toHaveCount(1)
  expect(await runs(page)).toEqual(BOTH_READ)
  await expect(page.getByText('The start of the room’s chat')).toBeVisible()
  expect(await reads(page)).toHaveLength(3)
})
