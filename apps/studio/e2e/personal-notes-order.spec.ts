import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Your notes, by date, and to a file (docs/plans/notes-order-export.md): each note says its day, Newest and Oldest sort
// them, and «Download notes» saves a file of them. Every note is synthetic.

const panel = (page: Page) => page.locator('#c-notes')
const listed = (page: Page) => panel(page).locator('.c2-t p')
const order = (page: Page) => panel(page).getByRole('radiogroup', { name: 'Order' })
const note = (page: Page, words: string) => panel(page).locator('.c2-t', { hasText: words })

test('order · each note says its day; Oldest puts the oldest first, Newest gives the order back', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  await expect(listed(page)).toHaveCount(8)
  await expect(listed(page).first()).toContainText('Start the deck from one number I trust')
  await expect(panel(page).locator('.c2-t time')).toHaveCount(8)
  await order(page).getByRole('radio', { name: 'Oldest' }).click()
  await expect(listed(page).first()).toContainText('Read the vendor contract')
  await order(page).getByRole('radio', { name: 'Newest' }).click()
  await expect(listed(page).first()).toContainText('Start the deck from one number I trust')
})

test('order · Newest and Oldest are one choice: one stop, the arrows move it (Codex P2 on #394)', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  await expect(listed(page)).toHaveCount(8)
  const newest = order(page).getByRole('radio', { name: 'Newest' })
  await expect(newest).toHaveAttribute('aria-checked', 'true')
  await newest.focus()
  await page.keyboard.press('ArrowRight')
  await expect(order(page).getByRole('radio', { name: 'Oldest' })).toHaveAttribute('aria-checked', 'true')
  await expect(listed(page).first()).toContainText('Read the vendor contract')
})

test('order · a note forgotten under Oldest hands the focus to the next one shown (Codex P2 on #394)', async ({
  page,
}) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  await expect(listed(page)).toHaveCount(8)
  await order(page).getByRole('radio', { name: 'Oldest' }).click()
  const words = await listed(page).allTextContents()
  const second = note(page, words[1] ?? '')
  await second.getByRole('button', { name: 'Forget' }).click()
  await second.getByRole('button', { name: 'Forget it' }).click()
  await expect(listed(page)).toHaveCount(7)
  await expect(note(page, words[2] ?? '').getByRole('button', { name: 'Carry' })).toBeFocused()
})

test('order · a note’s day stands under its words, and Carry and Forget side by side beside them (Codex P2 on #394)', async ({
  page,
}) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  const first = panel(page).locator('.c2-t').first()
  const box = async (locator: ReturnType<Page['locator']>) =>
    (await locator.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const words = await box(first.locator('p'))
  const day = await box(first.locator('time'))
  const carry = await box(first.getByRole('button', { name: 'Carry' }))
  const forget = await box(first.getByRole('button', { name: 'Forget' }))
  expect(day.y).toBeGreaterThanOrEqual(words.y + words.height - 1)
  expect(Math.abs(day.x - words.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(carry.y - forget.y)).toBeLessThanOrEqual(1)
  expect(forget.x).toBeGreaterThan(carry.x + carry.width - 1)
  expect(carry.x).toBeGreaterThan(words.x + words.width - 1)
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
