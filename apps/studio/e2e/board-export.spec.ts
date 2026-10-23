import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// The board, exported (docs/plans/board-export.md): «Export» in the board's bar saves it as CSV or Markdown. The work
// fixture's data is labelled and simulated.

const board = (page: Page) => page.locator('.board').first()

async function save(page: Page, which: 'Download CSV' | 'Download Markdown') {
  await page.goto('/work.html')
  await expect(board(page)).toBeVisible()
  await board(page).getByRole('button', { name: 'Export', exact: true }).click()
  const saved = page.waitForEvent('download')
  await page.getByRole('menu', { name: 'Export', exact: true }).getByRole('menuitem', { name: which }).click()
  const file = await saved
  return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') }
}

test('export · the board saves as CSV, marked UTF-8 for a sheet, a header then a row a task', async ({ page }) => {
  const { name, text } = await save(page, 'Download CSV')
  expect(name).toMatch(/^tasks-plan-r\d+-\d{4}-\d{2}-\d{2}\.csv$/)
  // The mark Excel needs to read the file as UTF-8 (Codex P2 on #397).
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const lines = text.slice(1).trim().split('\r\n')
  expect(lines[0]).toBe('Lane,Task,Who,Status')
  const tiles = await board(page).locator('[data-task]').count()
  expect(lines.length - 1).toBeGreaterThanOrEqual(tiles)
})

test('export · the board saves as Markdown, its lanes as headings', async ({ page }) => {
  const { name, text } = await save(page, 'Download Markdown')
  expect(name).toMatch(/^tasks-plan-r\d+-\d{4}-\d{2}-\d{2}\.md$/)
  expect(text).toMatch(/^# Tasks · plan r\d+ · /)
  expect(text).toContain('## Active')
  expect(text).toMatch(/- \[[ x]\] /)
})
