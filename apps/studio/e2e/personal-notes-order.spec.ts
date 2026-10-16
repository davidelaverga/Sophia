import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Your notes, by date, and to a file (docs/plans/notes-order-export.md): each note says its day, Newest and Oldest sort
// them, and «Download notes» saves a file of them. Every note is synthetic.

const panel = (page: Page) => page.locator('#c-notes')
const listed = (page: Page) => panel(page).locator('.c2-t p')
const order = (page: Page) => panel(page).getByRole('group', { name: 'Order' })

test('order · each note says its day; Oldest puts the oldest first, Newest gives the order back', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  await expect(listed(page)).toHaveCount(8)
  await expect(listed(page).first()).toContainText('Start the deck from one number I trust')
  await expect(panel(page).locator('.c2-t time')).toHaveCount(8)
  await order(page).getByRole('button', { name: 'Oldest' }).click()
  await expect(listed(page).first()).toContainText('Read the vendor contract')
  await order(page).getByRole('button', { name: 'Newest' }).click()
  await expect(listed(page).first()).toContainText('Start the deck from one number I trust')
})

test('order · «Download notes» saves a file of every note, named by the day', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  await expect(listed(page)).toHaveCount(8)
  const saved = page.waitForEvent('download')
  await panel(page).getByRole('button', { name: 'Download notes' }).click()
  const file = await saved
  expect(file.suggestedFilename()).toMatch(/^sophia-notes-\d{4}-\d{2}-\d{2}\.md$/)
  const text = readFileSync(await file.path(), 'utf8')
  expect(text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(8)
  expect(text).toContain('- Read the vendor contract · ')
})
