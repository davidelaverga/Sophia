import { expect, test, type Page } from '@playwright/test'
import { READING, READING_TITLE } from '../fixtures/reading-data.ts'
import { REPORT } from '../fixtures/report-data.ts'

// A long report's «On this page» (docs/plans/report-on-this-page.md): with four sections or more, an index of them by
// the text, on the page's own anchors. Enlarged at 1280 it stands in the margin, clear of the reading column, which
// keeps its place; in the side pane and on a phone it folds under one button. A link brings its section to the top and
// is marked as the one read; the mark follows the scroll. A shorter report has none.

const pane = (page: Page) => page.getByRole('complementary', { name: READING_TITLE })
const index = (page: Page) => page.getByRole('navigation', { name: 'On this page' })
const SECTIONS = [
  'Executive summary',
  'Background and question',
  'Findings',
  'Risks and limitations',
  'Recommendations',
  'Conclusion',
]

const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { unexpected: [...view.unexpected] }
  })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect((await fixture(page)).unexpected, 'requests the fixture did not expect').toEqual([])
})

async function openReading(page: Page) {
  await page.goto(`/room.html?report=${READING}`)
  await expect(page.locator('.md')).toContainText('Recovery windows differ more than prices do')
  await expect(page.getByRole('tab', { name: 'Sources 6' })).toBeVisible()
}

async function enlarge(page: Page) {
  await pane(page).getByRole('button', { name: 'Enlarge' }).click()
  const full = page.locator('.report-pane')
  await expect(full).toHaveAttribute('data-size', 'full')
  await full.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
}

/** The section heading's top against the reading area's, in px. */
const headingTop = (page: Page, id: string) =>
  page.evaluate((anchor) => {
    const body = document.querySelector('.report-pane-body')
    const heading = document.getElementById(anchor)
    if (!body || !heading) return null
    return Math.round(heading.getBoundingClientRect().top - body.getBoundingClientRect().top)
  }, id)

const current = (page: Page) => index(page).locator('a[aria-current="location"]')

test('report index · enlarged at 1280: On this page in the margin, the column in place, a link goes and is marked', async ({
  page,
}) => {
  await openReading(page)
  await enlarge(page)
  const links = index(page).getByRole('link')
  await expect(links).toHaveText(SECTIONS)
  // The nav is a row of no height in the margin (it takes no room from the column): its list is what is seen.
  await expect(index(page).locator('ol')).toBeVisible()
  // In the margin: left of the column, inside the page, never over the text; the column keeps its centre.
  const at = await page.evaluate(() => {
    const list = document.querySelector('.md-toc ol')?.getBoundingClientRect()
    const md = document.querySelector('.md')?.getBoundingClientRect()
    const body = document.querySelector<HTMLElement>('.report-pane-body')
    if (!list || !md || !body) return { listLeft: -1, gap: -1, offCentre: Infinity }
    const centre = body.getBoundingClientRect().left + body.clientWidth / 2
    return { listLeft: list.left, gap: md.left - list.right, offCentre: md.left + md.width / 2 - centre }
  })
  expect(at.listLeft).toBeGreaterThanOrEqual(0)
  expect(at.gap, 'the index stands clear of the column').toBeGreaterThanOrEqual(16)
  expect(Math.abs(at.offCentre), 'the column keeps its centre').toBeLessThanOrEqual(8)
  // No toggle at this size: the list is simply there.
  await expect(index(page).getByRole('button', { name: 'On this page' })).toBeHidden()
  await expect(current(page)).toHaveText('Executive summary')

  // By keyboard: the link is reached and pressed; its section comes to the top and takes the focus.
  await links.filter({ hasText: 'Findings' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => headingTop(page, 'md-findings')).toBeLessThanOrEqual(40)
  expect(await headingTop(page, 'md-findings')).toBeGreaterThanOrEqual(-2)
  await expect(page.locator('#md-findings')).toBeFocused()
  await expect(current(page)).toHaveText('Findings')
  // The address is the page's, not the anchor's.
  expect(new URL(page.url()).hash).toBe('')
  // The index stays in sight as the text scrolls under it.
  await expect(index(page).locator('ol')).toBeInViewport()

  // The mark follows the reading: back at the top, the first section.
  await page.locator('.report-pane-body').evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(current(page)).toHaveText('Executive summary')
})

test('report index · in the side pane it folds under one button, opened and used by keyboard', async ({ page }) => {
  await openReading(page)
  const toggle = index(page).getByRole('button', { name: 'On this page' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(index(page).getByRole('link')).toHaveCount(0)
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(index(page).getByRole('link')).toHaveText(SECTIONS)
  await page.keyboard.press('Tab')
  await expect(index(page).getByRole('link', { name: 'Executive summary' })).toBeFocused()
  await index(page).getByRole('link', { name: 'Background and question' }).click()
  await expect.poll(() => headingTop(page, 'md-background-and-question')).toBeLessThanOrEqual(40)
  await expect(page.locator('#md-background-and-question')).toBeFocused()
  // Chosen, it folds again: the text is what is read now.
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('report index @phone · folded under one button, and the page never scrolls sideways', async ({ page }) => {
  await openReading(page)
  const toggle = index(page).getByRole('button', { name: 'On this page' })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(index(page).getByRole('link')).toHaveText(SECTIONS)
  const wide = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.report-pane-body')
    return body ? body.scrollWidth - body.clientWidth : null
  })
  expect(wide).toBe(0)
  await index(page).getByRole('link', { name: 'Findings' }).click()
  await expect.poll(() => headingTop(page, 'md-findings')).toBeLessThanOrEqual(40)
})

test('report index · a report of fewer than four sections has none', async ({ page }) => {
  await page.goto(`/room.html?report=${REPORT}`)
  await expect(page.locator('.md')).toContainText('The fixture holds.')
  await expect(index(page)).toHaveCount(0)
})
