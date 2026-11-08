import { expect, test, type Page } from '@playwright/test'
import { CITED_TEXT, SECOND_INPUT_TITLE } from '../fixtures/cited-text-data.ts'

// A project text a report cites, opened from its Sources (A11 getCitedReportText, 0090), on the fixture page: the
// Studio's own report viewer over the labelled fixture report, which cites the fixture's project input with
// `cites=input` (fixtures/cited-text-data.ts). Only the API is faked; every request off the fixture's origin is aborted,
// and each check ends by asking the page whether anything reached for the API beyond what it answers.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const FIRST = 'The first version of a labelled fixture report.'
const SLOW = 'Taking longer than usual.'

const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const show = (page: Page) => pane(page).getByRole('button', { name: 'Show text' })
const hide = (page: Page) => pane(page).getByRole('button', { name: 'Hide text' })
const region = (page: Page) => pane(page).getByRole('region', { name: /^Text of / })
const reads = (page: Page) => page.evaluate(() => window.fixture?.citedReads() ?? -1)

/** The fixture report open on its Sources tab, with the page's options. */
async function sources(page: Page, options = '') {
  await page.goto(`/room.html?report=${REPORT}&cites=input${options}`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /Sources/ })
    .click()
  await expect(show(page)).toBeVisible()
}

/** Whether the page has asked for anything off the fixture's origin (a remote image, say) since `since`. */
const offOrigin: string[] = []

test.beforeEach(async ({ page }) => {
  offOrigin.length = 0
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:5199')) offOrigin.push(r.url())
  })
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  const view = await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])
  expect(view, 'requests the fixture did not expect').toEqual([])
})

test('cited text · closed until asked: Show text reads it once and shows it as plain text, running and loading nothing', async ({
  page,
}) => {
  await sources(page)
  // A plain text (`text/plain; charset=utf-8`) opens here: the press, and no line saying only text opens.
  await expect(pane(page).getByText('Only plain text and Markdown open here.')).toHaveCount(0)
  expect(await reads(page), 'nothing is read before the press').toBe(0)
  await expect(show(page)).toHaveAttribute('aria-expanded', 'false')
  await show(page).click()
  const body = region(page).locator('pre')
  await expect(body).toHaveText(CITED_TEXT, { useInnerText: false })
  expect(await reads(page)).toBe(1)
  await expect(hide(page)).toHaveAttribute('aria-expanded', 'true')
  // Markup in the text is text: no element made from it, nothing run, nothing asked of another origin.
  expect(await region(page).locator('img, script, a, strong').count()).toBe(0)
  expect(await page.evaluate(() => Reflect.get(window, 'citedRan') as unknown)).toBeUndefined()
  expect(offOrigin, 'no request off the fixture’s origin').toEqual([])
  // Closed, it goes; opened again, it is read again (each opening checks again).
  await hide(page).click()
  await expect(region(page)).toHaveCount(0)
  await show(page).click()
  await expect(body).toHaveText(CITED_TEXT, { useInnerText: false })
  expect(await reads(page)).toBe(2)
})

test('cited text · by keyboard: the press opens and closes it, the focus stays on it, and the text scrolls by key', async ({
  page,
}) => {
  await sources(page)
  await show(page).focus()
  await page.keyboard.press('Enter')
  await expect(region(page).locator('pre')).toBeVisible()
  await expect(hide(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(region(page).locator('pre')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(hide(page)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(region(page)).toHaveCount(0)
  await expect(show(page)).toBeFocused()
})

test('cited text · a reload finds it closed, and reads nothing until asked again', async ({ page }) => {
  await sources(page)
  await show(page).click()
  await expect(region(page).locator('pre')).toBeVisible()
  await page.reload()
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /Sources/ })
    .click()
  await expect(show(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(region(page)).toHaveCount(0)
  expect(await reads(page), 'the reloaded page has read nothing').toBe(0)
})

test('cited text · refused: one answer that names nothing, and the report stays readable', async ({ page }) => {
  await sources(page, '&cited=refused')
  await show(page).click()
  await expect(region(page)).toContainText('This source can’t be read here.')
  await expect(region(page).locator('pre')).toHaveCount(0)
  await expect(region(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  // The source's refusal is not the report's: its document and sources are still there.
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await expect(pane(page).getByText(FIRST)).toBeVisible()
})

test('cited text · bytes its record does not name are never shown', async ({ page }) => {
  await sources(page, '&cited=tamper')
  await show(page).click()
  await expect(region(page)).toContainText('The text didn’t match its record, so it isn’t shown.')
  await expect(region(page).locator('pre')).toHaveCount(0)
  await expect(pane(page).getByText('Option A: 90 credits', { exact: false })).toHaveCount(0)
})

test('cited text · slow: it says it is reading, then that it is slow; closed while reading, a late answer shows nothing', async ({
  page,
}) => {
  await sources(page, '&hold=cited')
  await show(page).click()
  await expect(region(page).getByRole('status').first()).toHaveText('Reading the source…')
  await expect(region(page)).toContainText(SLOW, { timeout: 9_000 })
  // Pressed again while it reads: it closes, and the answer that comes after is not shown.
  await hide(page).click()
  await expect(region(page)).toHaveCount(0)
  await page.evaluate(() => window.fixture?.releaseCited())
  await expect(show(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(pane(page).getByText('Option A: 90 credits', { exact: false })).toHaveCount(0)
  // Opened again, it is read again and shown.
  await show(page).click()
  await expect(region(page).locator('pre')).toHaveText(CITED_TEXT, { useInnerText: false })
  expect(await reads(page)).toBe(2)
})

test('cited text · another tab while it reads unmounts it: coming back finds it closed, nothing late shown', async ({
  page,
}) => {
  await sources(page, '&hold=cited')
  await show(page).click()
  await expect(region(page)).toBeVisible()
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await page.evaluate(() => window.fixture?.releaseCited())
  await pane(page)
    .getByRole('tab', { name: /Sources/ })
    .click()
  await expect(show(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(region(page)).toHaveCount(0)
})

test('cited text · @phone: the text stays inside the pane at 390 px, and wraps instead of widening it', async ({
  page,
}) => {
  await sources(page)
  await show(page).click()
  const body = region(page).locator('pre')
  await expect(body).toBeVisible()
  const [box, side] = await Promise.all([body.boundingBox(), pane(page).boundingBox()])
  expect(box && side && box.x >= side.x - 0.5 && box.x + box.width <= side.x + side.width + 0.5).toBe(true)
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('cited text · each press names its citation: the demo’s four project sources, four names, the words on screen kept', async ({
  page,
}) => {
  // The demo's pilot readout cites four project records (Markdown), numbered 1 to 4 in its text.
  await page.goto('/room.html?place=knowledge&demo=1')
  await page.locator('.report-card').first().locator('.report-card-title').click()
  const side = page.locator('.report-pane:not([hidden])')
  await side.getByRole('tab', { name: /Sources/ }).click()
  await expect(side.locator('button.source-text-toggle')).toHaveCount(4)
  for (const n of [1, 2, 3, 4]) {
    await expect(side.getByRole('button', { name: `Show text of citation ${String(n)}`, exact: true })).toHaveCount(1)
  }
  const name = { name: 'Show text of citation 2', exact: true }
  const second = side.getByRole('button', name)
  await expect(second).toHaveText('Show text')
  // Described by its row's title, so a source not cited in the text is told apart too.
  const title = await side
    .locator('.sources > li', { has: page.getByRole('button', name) })
    .locator('.source-title')
    .innerText()
  await expect(second).toHaveAccessibleDescription(title)
  await second.click()
  const open = side.getByRole('button', { name: 'Hide text of citation 2', exact: true })
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  await expect(open).toHaveText('Hide text')
  await expect(side.getByRole('region', { name: 'Text of citation 2' })).toBeVisible()
})

test('cited text · two sources not cited in the text are told apart by their titles in their presses’ names', async ({
  page,
}) => {
  await page.goto(`/room.html?report=${REPORT}&cites=inputs`)
  await expect(pane(page).getByText(FIRST)).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /Sources/ })
    .click()
  await expect(pane(page).locator('button.source-text-toggle')).toHaveCount(2)
  // The untitled input is named as its row names it; the titled one by its title. Each name found once, each led by
  // the words on screen.
  for (const title of ['A source from the project', SECOND_INPUT_TITLE]) {
    const press = pane(page).getByRole('button', { name: `Show text of ${title}`, exact: true })
    await expect(press).toHaveCount(1)
    await expect(press).toHaveText('Show text')
  }
})
