import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// A44 (FND-B-HTML-READ-CONTRACT-FIX-01, controlled room fixture, synthetic words): a report whose newest version a
// design published names that design as what made it (trigger kind design, 0040/0041), in the version list the report
// pane reads through its strict parser (listArtifactVersions). The designed page opens, reloads and downloads, and the
// Markdown reads; a kind no contract names is still refused. (The project snapshot carries no trigger: artifacts.ts
// notesOf.) This is the Vite fixture page, not built bytes and not production.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const SECOND = 'The second version of a labelled fixture report, published while the first was read.'
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const frame = (page: Page) => page.frameLocator('iframe.report-html-frame')
const refused = (page: Page) => page.getByText('The report couldn’t be loaded.')

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('a44 · a report a design published opens on its designed page, reads again after a reload, and saves its bytes', async ({
  page,
}) => {
  await page.goto(`/room.html?place=work&versions=2&trigger=design&report=${REPORT}&format=html`)
  await expect(frame(page).getByText('A labelled fixture designed page')).toBeVisible()
  await expect(pane(page).locator('.report-meta')).toHaveText('HTML · v2 · design checked')
  await expect(refused(page)).toHaveCount(0)
  // The same view after a reload: the version list is read, and parsed, again.
  await page.reload()
  await expect(frame(page).getByText('A labelled fixture designed page')).toBeVisible()
  await expect(refused(page)).toHaveCount(0)
  const saved = page.waitForEvent('download')
  await pane(page).getByRole('button', { name: 'Download', exact: true }).click()
  const download = await saved
  expect(download.suggestedFilename()).toMatch(/\.html$/)
  const path = await download.path()
  expect(await readFile(path, 'utf8')).toContain('A labelled fixture designed page')
})

test('a44 · its Markdown reads too, and the origin line beside it never breaks the pane', async ({ page }) => {
  await page.goto(`/room.html?place=work&versions=2&trigger=design&report=${REPORT}`)
  await expect(pane(page).locator('.md')).toContainText(SECOND)
  await expect(refused(page)).toHaveCount(0)
})

test('a44 · a version made by a kind no contract names is still refused', async ({ page }) => {
  await page.goto(`/room.html?place=work&versions=2&trigger=unknown&report=${REPORT}&format=html`)
  // A refused contract is read again a few times before the pane says so (the API client's retries).
  await expect(refused(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('iframe.report-html-frame')).toHaveCount(0)
})
