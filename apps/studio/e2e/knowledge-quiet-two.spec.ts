import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'

// Knowledge, the quiet pass (docs/plans/knowledge-quiet-two.md): a Markdown report's cover is a page, as a designed
// one's is; the lines say it in words, the size and the hash at Download; «Edit summary»; nothing after «Knowledge».
// On the fixture page; only the API is faked.

const KNOWLEDGE = '/room.html?place=knowledge&demo=1'
const pane = (page: Page) => page.locator('.report-pane:not([hidden])')
const first = (page: Page) => page.locator('.report-card').first()

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Relative luminance of an element's own background; 0 when it is not opaque (a tint over the dark is no page). */
const luminanceOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const [r, g, b, a = 1] = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).map(Number)
      if (a < 0.98) return 0
      const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c = 0) =>
        c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4,
      )
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
    })

test('quiet two · a Markdown report’s cover is a page: light, its words reading on it', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  const sheet = '.report-cover[data-cover="lines"] .report-cover-page'
  await expect(page.locator(sheet).first()).toBeVisible()
  expect(await luminanceOf(page, sheet)).toBeGreaterThan(0.8)
  expect(await lowContrast(page, sheet)).toEqual([])
})

test('quiet two · the card’s line and the pane’s head are in the app’s sans, not mono', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  const family = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(await family('.report-card .report-meta')).not.toMatch(/mono/i)
  await first(page)
    .getByRole('button', { name: /, HTML page$/ })
    .click()
  await expect(pane(page).locator('.report-meta')).toBeVisible()
  expect(await family('.report-pane:not([hidden]) .report-meta')).not.toMatch(/mono/i)
})

test('quiet two · the head says the format, the version and the check; Download says the size and the hash', async ({
  page,
}) => {
  await page.goto(KNOWLEDGE)
  await first(page)
    .getByRole('button', { name: /, HTML page$/ })
    .click()
  await expect(pane(page).locator('.report-meta')).toHaveText('HTML · v2 · design checked')
  await expect(pane(page).locator('.report-download .tip')).toContainText(/[\d.]+ (B|KB|MB) · [0-9a-f]{8}$/)
})

test('quiet two · a Markdown version’s head says its length in words, not its bytes', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  await first(page).locator('.report-card-title').click()
  await pane(page).getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Markdown' }).click()
  await expect(pane(page).locator('.report-meta')).toHaveText(/^Markdown · v2 · [\d,]+ words$/)
})

test('quiet two · the tile’s press says what it edits; nothing follows «Knowledge»', async ({ page }) => {
  await page.goto(KNOWLEDGE)
  await expect(first(page).getByRole('button', { name: 'Edit summary', exact: true })).toBeVisible()
  await expect(page.locator('.knowledge .view-head')).toHaveText('Knowledge')
})
