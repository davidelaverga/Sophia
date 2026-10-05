import { expect, test, type Page } from '@playwright/test'

// The report's next version arriving while it is open (docs/plans/room-live-version.md): offered at once with how much
// changed, and once shown, its changed sections marked and the reader's place kept. A citation names its source on
// hover. Every word is the fixture report's.

const REPORT = '00000000-0000-4000-8000-0000000000b1'

const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const offer = (page: Page) => pane(page).locator('.report-current')
const body = (page: Page) => pane(page).locator('.report-pane-body')
const heading = (page: Page, name: string) => pane(page).locator('.md').getByRole('heading', { name })
const marks = (page: Page) => pane(page).locator('.md .md-mark')

async function open(page: Page) {
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}`)
  await expect(pane(page).getByText('The fixture holds.')).toBeVisible()
}

/** The heading's top against the reading area's top. */
const topOf = (page: Page, name: string) =>
  heading(page, name).evaluate((h) => {
    const area = h.closest('.report-pane-body')
    return area ? h.getBoundingClientRect().top - area.getBoundingClientRect().top : Number.NaN
  })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('live · a version Sophia publishes while it is open is offered at once, with how much changed', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.fixture?.reviseLive())
  // No focus change: the project's feed moving is enough.
  await expect(offer(page)).toContainText('v2 is here · 2 sections changed.')
  await expect(pane(page).getByText('The first version of a labelled fixture report.')).toBeVisible()
})

test('live · shown from the offer, its changed sections are marked, and only those, with the facts in words', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.fixture?.reviseLive())
  await offer(page).getByRole('button', { name: 'Show it' }).click()
  await expect(pane(page).getByText('Read it once, then again.')).toBeVisible()
  await expect(marks(page)).toHaveCount(2)
  await expect(heading(page, 'Fixture report').locator('.md-mark')).toHaveText('Changed')
  await expect(heading(page, 'Recommendations').locator('.md-mark')).toHaveText('Changed')
  await expect(heading(page, 'Conclusion').locator('.md-mark')).toHaveCount(0)
  await expect(pane(page).locator('.report-changes')).toContainText('Compared with v1')
})

test('live · the heading being read keeps its place when the new version comes in', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 380 })
  await open(page)
  await heading(page, 'Conclusion').evaluate((h) => {
    const area = h.closest('.report-pane-body')
    if (area) area.scrollTop += h.getBoundingClientRect().top - area.getBoundingClientRect().top
  })
  const before = await topOf(page, 'Conclusion')
  expect(before, 'Conclusion is the heading being read: at the top of the reading area').toBeCloseTo(0, 0)
  await page.evaluate(() => window.fixture?.reviseLive())
  await offer(page).getByRole('button', { name: 'Show it' }).click()
  await expect(pane(page).getByText('Read it once, then again.')).toBeAttached()
  // The introduction above it grew in v2: unkept, the heading would have moved down.
  await expect.poll(() => topOf(page, 'Conclusion')).toBeCloseTo(before, 0)
  expect(await body(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})

test('live · the place holds when the new version’s sources come after its text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 380 })
  await open(page)
  await heading(page, 'Conclusion').evaluate((h) => {
    const area = h.closest('.report-pane-body')
    if (area) area.scrollTop += h.getBoundingClientRect().top - area.getBoundingClientRect().top
  })
  const before = await topOf(page, 'Conclusion')
  expect(before).toBeCloseTo(0, 0)
  await page.evaluate(() => {
    window.fixture?.holdSources()
    window.fixture?.reviseLive()
  })
  await offer(page).getByRole('button', { name: 'Show it' }).click()
  await expect(pane(page).getByText('Read it once, then again.')).toBeAttached()
  await expect.poll(() => topOf(page, 'Conclusion')).toBeCloseTo(before, 0)
  await page.evaluate(() => window.fixture?.releaseSources())
  await expect(pane(page).getByRole('button', { name: 'Source 1' })).toHaveAttribute('data-tip', /example\.org/)
  expect(await topOf(page, 'Conclusion')).toBeCloseTo(before, 0)
})

test('live · the marks go when another version is chosen', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.reviseLive())
  await offer(page).getByRole('button', { name: 'Show it' }).click()
  await expect(marks(page)).toHaveCount(2)
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  await pane(page).getByRole('button', { name: 'Show this version' }).click()
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await expect(pane(page).getByText('The first version of a labelled fixture report.')).toBeVisible()
  await expect(marks(page)).toHaveCount(0)
  await expect(pane(page).locator('.report-changes')).toHaveCount(0)
  // Back to v2 from History: it is read as itself now, unmarked; the comparison was over.
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  await pane(page).getByRole('button', { name: 'Show this version' }).click()
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await expect(pane(page).getByText('Read it once, then again.')).toBeVisible()
  await expect(marks(page)).toHaveCount(0)
})

test('cite · a citation names its source on hover: its title and its site', async ({ page }) => {
  await open(page)
  const cite = pane(page).getByRole('button', { name: 'Source 1' })
  await expect(cite).toHaveAttribute('data-tip', 'A labelled fixture page · example.org')
  // Hidden, it takes no room; on hover it shows, and the citation's text is still its number.
  const shown = () => cite.evaluate((el) => getComputedStyle(el, '::before').display)
  expect(await shown()).toBe('none')
  await cite.hover()
  expect(await shown()).toBe('block')
  await expect(cite).toHaveText('1')
})
