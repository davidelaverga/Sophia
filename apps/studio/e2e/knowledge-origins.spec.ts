import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Knowledge: a source says where it came from, and goes there (docs/plans/knowledge-origins.md; A19, proposed). The
// demo's pilot readout cites four project records: a file, a conversation, a meeting's notes, a decision. On the fixture
// page; only the API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const KNOWLEDGE = '/room.html?place=knowledge&demo=1'
const pane = (page: Page) => page.locator('.report-pane:not([hidden])')
const rows = (page: Page) => pane(page).locator('.sources > li')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function openSources(page: Page, url = KNOWLEDGE) {
  await page.goto(url)
  await page.locator('.report-card').first().locator('.report-card-title').click()
  await pane(page)
    .getByRole('tab', { name: /Sources/ })
    .click()
  await expect(rows(page)).toHaveCount(4)
}

test('origins · each project source says where it came from; a file in words, a conversation and a meeting as presses', async ({
  page,
}) => {
  await openSources(page)
  await expect(rows(page).nth(0)).toContainText('A file Lucía added · Sep 29')
  await expect(rows(page).nth(0).getByRole('button')).toHaveCount(0)
  await expect(
    rows(page).nth(1).getByRole('button', { name: 'From the conversation “Who owns setup when an admin changes?”' }),
  ).toBeVisible()
  await expect(rows(page).nth(2).getByRole('button', { name: 'From the meeting on Oct 4' })).toBeVisible()
  await expect(pane(page).getByText('From the project')).toHaveCount(0)
  // Every word reads, and on the app's sizes.
  expect(await lowContrast(page, '.sources')).toEqual([])
  const sizes = await typeSizes(page, '.sources')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
})

test('origins · a conversation’s press shows it open in Conversations, the report still beside it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSources(page)
  await rows(page).nth(1).getByRole('button').click()
  await expect(page.getByRole('heading', { name: 'Who owns setup when an admin changes?' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Conversations' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(pane(page)).toBeVisible()
})

test('origins · a meeting’s press shows Updates with that meeting’s recap open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSources(page)
  await rows(page).nth(2).getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'This meeting' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Updates' }),
  ).toHaveAttribute('aria-current', 'page')
})

test('origins · on a phone, where the report covers the page, the press closes it first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSources(page)
  await rows(page).nth(1).getByRole('button').click()
  await expect(page.locator('.report-pane')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Who owns setup when an admin changes?' })).toBeVisible()
})

test('origins · with the origins’ read failing, every project source says «From the project»', async ({ page }) => {
  await openSources(page, `${KNOWLEDGE}&origins=fail`)
  await expect(pane(page).getByText('From the project')).toHaveCount(4)
  await expect(rows(page).getByRole('button')).toHaveCount(0)
})
