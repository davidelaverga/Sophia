import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Knowledge's second pass (docs/plans/knowledge-filters.md, K2): one kind of filter, the reports first, and in the demo
// a library that reads as one. On the fixture page; only the API is faked, and each check ends by asking the page
// whether anything reached for the API beyond what it answers.

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])
  expect(unexpected, 'requests the fixture did not expect').toEqual([])
})

/** A filter group's buttons: their height, corner, and whether a plane lies under the pressed one. */
const buttonsOf = (page: Page, name: string) =>
  page
    .getByRole('group', { name, exact: true })
    .getByRole('button')
    .evaluateAll((all) =>
      all.map((b) => {
        const s = getComputedStyle(b)
        return {
          height: Math.round(b.getBoundingClientRect().height),
          corner: parseFloat(s.borderTopLeftRadius),
          pressed: b.getAttribute('aria-pressed') === 'true',
          plane: s.backgroundColor !== 'rgba(0, 0, 0, 0)',
        }
      }),
    )

test('filters · the project filter is the app’s segmented group, as the format filter is', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click() // the older report has a PDF: Format is offered
  await expect(page.getByRole('group', { name: 'Format' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Project', exact: true })).toHaveClass(/\bsegmented\b/)
  const project = await buttonsOf(page, 'Project')
  const format = await buttonsOf(page, 'Format')
  for (const b of [...project, ...format]) {
    expect(b.corner, 'a square corner').toBeLessThanOrEqual(8)
    expect(b.height).toBe(format[0]?.height)
  }
  // The pressed choice has a quiet plane under it; the others none.
  for (const b of [...project, ...format]) expect(b.plane, JSON.stringify(b)).toBe(b.pressed)
})

test('filters · only the app’s type sizes in the filters', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'All projects' }).click()
  const sizes = await typeSizes(page, '.knowledge-filters')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
})

test('filters · every word in the filters reads: no contrast under 4.5:1, pressed or not', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click() // Format is offered
  await expect(page.getByRole('group', { name: 'Format' })).toBeVisible()
  expect(await lowContrast(page, '.knowledge-filters')).toEqual([])
})

test('filters · another project’s button and its count read at 4.5:1, pressed or not; pressed, it shows that project’s reports', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge&reports=elsewhere')
  await page.getByRole('button', { name: 'All projects' }).click()
  const other = page
    .getByRole('group', { name: 'Project', exact: true })
    .getByRole('button', { name: /Another project/ })
  await expect(other.locator('.count')).toHaveText('1')
  expect(await lowContrast(page, '.knowledge-filters')).toEqual([])
  await other.click()
  await expect(other).toHaveAttribute('aria-pressed', 'true')
  expect(await lowContrast(page, '.knowledge-filters')).toEqual([])
  // Its one report, filed there; none of this project's.
  const cards = page.locator('.report-card')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('An older fixture report')
})

test('order · the reports come first; what was carried in follows them', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&carried=1')
  const carried = page.getByRole('region', { name: 'Carried in from Personal' })
  await expect(carried).toBeVisible()
  const [tiles, heading] = await Promise.all([page.locator('.report-cards').boundingBox(), carried.boundingBox()])
  expect(tiles && heading && tiles.y < heading.y, 'the tiles above what was carried in').toBe(true)
})

test('demo · the first page is a library: two full rows of tiles, two of them with a designed cover', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await expect(page.locator('.report-card')).toHaveCount(6)
  await expect(page.locator('.report-cover iframe')).toHaveCount(2)
  await expect(page.locator('.report-cover[data-cover="lines"]')).toHaveCount(4)
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.locator('.report-card')).toHaveCount(7) // the pilot's plan
  await expect(page.locator('.report-cover[data-cover="mark"]')).toHaveCount(0) // every cover read and matched
})

test('demo · newest first across the pages: More reports brings only older ones', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.locator('.report-card')).toHaveCount(7)
  // Each tile's day ends its meta line («… · Sep 29»).
  const days = await page
    .locator('.report-meta')
    .evaluateAll((all) => all.map((p) => Date.parse(`${(p.textContent ?? '').split(' · ').at(-1) ?? ''} 2026`)))
  for (const d of days) expect(d, 'a day the check can read').not.toBeNaN()
  expect(days).toEqual(days.toSorted((a, b) => b - a))
})

test('demo · a library report opens from its tile, its sources read', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await page.getByRole('button', { name: 'Setup checklist: five steps, one owner', exact: true }).click()
  const pane = page.getByRole('complementary', { name: 'Setup checklist: five steps, one owner' })
  await expect(pane.getByText(/one person who answers setup questions/)).toBeVisible()
  await pane.getByRole('tab', { name: /Sources/ }).click()
  await expect(pane.getByText('This version cites no source you can read.')).toBeVisible()
})
