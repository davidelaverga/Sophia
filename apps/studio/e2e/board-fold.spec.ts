// Complete folds beside Blocked, so the other lanes keep their measure (docs/plans/board-fold-complete.md), on the
// Tasks fixture page, whose plan has a blocked task.
import { expect, test, type Locator, type Page } from '@playwright/test'

const PAGE = '/work.html'
const board = (page: Page) => page.locator('.board').first()
const lane = (page: Page, name: string) => board(page).getByRole('region', { name, exact: true })
const fold = (page: Page) => lane(page, 'Complete').getByRole('button', { name: /^Complete\s*1$/ })

/** How many lines a title takes: its words' line boxes, counted by their tops. */
const lines = (title: Locator) =>
  title.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
  })
const width = async (l: Locator) => (await l.boundingBox())?.width ?? 0

test('fold · at 1280 Complete folds to a column with its count; the other lanes keep one-line titles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(PAGE)
  await expect(lane(page, 'Blocked')).toBeVisible()
  await expect(fold(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(lane(page, 'Complete').locator('.task-tile')).toHaveCount(0)
  expect(await width(lane(page, 'Complete'))).toBeLessThan(48)
  for (const name of ['Active', 'Up next', 'Blocked', 'Unassigned'])
    expect(await width(lane(page, name)), name).toBeGreaterThanOrEqual(270)
  const title = (text: string) => board(page).locator('.task-tile-title', { hasText: text })
  // Both took two lines in five equal lanes (231 px each).
  expect(await lines(title('Review the retry’s candidate'))).toBe(1)
  expect(await lines(title('Write the export’s release note'))).toBe(1)
  // Its 211 px of title is short of it on the four-lane board too: its two lines are the tile's, not the fifth lane's.
  expect(await lines(title('Measure render time on large reports'))).toBeLessThanOrEqual(2)
})

test('fold · Enter opens Complete and Space folds it again, the focus on its press; the keys pass a folded lane', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(PAGE)
  const press = fold(page)
  await press.focus()
  await page.keyboard.press('Enter')
  await expect(press).toHaveAttribute('aria-expanded', 'true')
  await expect(lane(page, 'Complete').locator('.task-tile-title')).toHaveText(['Reproduce the failed render'])
  await expect(press).toBeFocused()
  // Opened, the arrows reach it: from Unassigned's last tile, Complete's.
  await page.locator('[data-task="work-4"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-task="work-0a"]')).toBeFocused()
  await press.focus()
  await page.keyboard.press('Space')
  await expect(press).toHaveAttribute('aria-expanded', 'false')
  await expect(lane(page, 'Complete').locator('.task-tile')).toHaveCount(0)
  await expect(press).toBeFocused()
  // Folded, they pass it, as they pass an empty lane: nothing on the right takes the focus.
  await page.locator('[data-task="work-4"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-task="work-4"]')).toBeFocused()
  // J in the sheet follows the plan's order, the folded lane's task among it; the sheet closed, the focus is back.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Measure render time on large reports' })).toBeVisible()
  await page.keyboard.press('j')
  await expect(page.getByRole('dialog', { name: 'Reproduce the failed render' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-task="work-4"]')).toBeFocused()
})

test('fold · at 1600 the board is no wider (the page stops at 1280), so Complete folds there too', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(PAGE)
  await expect(fold(page)).toHaveAttribute('aria-expanded', 'false')
  expect(await width(board(page))).toBeLessThanOrEqual(1208)
})

test('fold · in three lanes and two nothing folds', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto(PAGE)
  await expect(lane(page, 'Complete').locator('.task-tile-title')).toHaveText(['Reproduce the failed render'])
  await expect(lane(page, 'Complete').locator('[aria-expanded]')).toHaveCount(0)
})

test('fold @phone · one lane under another: nothing folds', async ({ page }) => {
  await page.goto(PAGE)
  await expect(lane(page, 'Complete').locator('.task-tile-title')).toHaveText(['Reproduce the failed render'])
  await expect(lane(page, 'Complete').locator('[aria-expanded]')).toHaveCount(0)
})
