// Undo after Hold (docs/plans/undo-hold.md): once a Hold from a task's sheet is confirmed, an Undo is offered
// for about six seconds, beside it, on the Tasks fixture page. Undo is the Resume press.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/work.html'

const open = async (page: Page, query = 'viewer=davide&settle=confirmed') => {
  await page.goto(`${PAGE}?${query}`)
  await page.locator('[data-task="work-2"]').click()
  const sheet = page.getByRole('dialog', { name: 'Review the report pane' })
  await expect(sheet).toBeVisible()
  return sheet
}

const kinds = (page: Page) => page.evaluate(() => (window.workFixture?.commands ?? []).map((c) => c.kind))

test('undo hold · H holds, Undo is offered without the focus, and Undo resumes once', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-steps')).toContainText('Held.')
  const line = sheet.locator('.act-undo')
  // Only the button: the status line above already says «Held.» (Luis, 2026-11-19).
  await expect(line).toHaveText('Undo')
  const undo = line.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  // Said politely, in a live region of its own; nothing hands it the focus.
  await expect(line).toHaveAttribute('role', 'status')
  await expect(undo).not.toBeFocused()
  // Keyboard reachable: Tab from where the focus was handed (the status line) lands on it.
  await sheet.locator('.act-status').focus()
  await page.keyboard.press('Tab')
  await expect(undo).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(line.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await expect(line).toHaveText('')
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Working')
  expect(await kinds(page)).toEqual(['hold', 'resume'])
  // The focus went back into the sheet, never to the page.
  expect(await page.evaluate(() => document.activeElement?.closest('.session-acts') !== null)).toBe(true)
})

test('undo hold · it leaves on its own after about six seconds', async ({ page }) => {
  const sheet = await open(page)
  await sheet.getByRole('button', { name: /^Hold/ }).click()
  const undo = sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  await expect(undo).toHaveCount(0, { timeout: 9000 })
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
  expect(await kinds(page)).toEqual(['hold'])
})

test('undo hold · turning the sheet ends it, and coming back does not bring it again', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })).toBeVisible()
  await page.keyboard.press('j')
  await expect(page.locator('.act-undo').getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.keyboard.press('k')
  await expect(page.getByRole('dialog', { name: 'Review the report pane' })).toBeVisible()
  await expect(page.locator('.act-undo').getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

test('undo hold · nothing when the Hold was refused', async ({ page }) => {
  const sheet = await open(page, 'viewer=davide&admission=refused')
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-steps')).toContainText('Nothing was sent.')
  await expect(sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

test('undo hold · another attempt in its place ends it: nothing is sent to it', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })).toBeVisible()
  await page.evaluate(() => window.workFixture?.nextAttempt?.('work-2'))
  await expect(sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })).toHaveCount(0)
  expect(await kinds(page)).toEqual(['hold'])
})

// Review on attempt 1 (P2-1): Resume out of offer for a moment (the task unobserved) and back. The Undo leaves while it
// isn't offered, and never stays past its six seconds.
test('undo hold · out of offer for a moment and back: it never outlives its six seconds', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  const undo = sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  await page.evaluate(() => window.workFixture?.setLifecycle?.('work-2', 'unknown'))
  await expect(undo).toHaveCount(0)
  await page.evaluate(() => window.workFixture?.setLifecycle?.('work-2', 'held'))
  await expect(sheet.getByRole('button', { name: /^Resume/ })).toBeVisible()
  await expect(undo).toHaveCount(0, { timeout: 9000 })
  expect(await kinds(page)).toEqual(['hold'])
})

// P2-2: only a Hold the sheet saw on its way. Closed, or turned away, before its runtime confirmed it, the sheet opened
// again later offers no Undo for it.
test('undo hold · a Hold confirmed while its sheet was closed offers none when it opens again', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
  await page.locator('[data-task="work-2"]').click()
  const again = page.getByRole('dialog', { name: 'Review the report pane' })
  await expect(again.locator('.act-steps')).toContainText('Held.')
  await expect(again.getByRole('button', { name: /^Resume/ })).toBeVisible()
  await expect(again.locator('.act-undo').getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

test('undo hold · a Hold confirmed while the sheet showed another task offers none on coming back', async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press('h')
  await page.keyboard.press('j')
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
  await page.keyboard.press('k')
  const back = page.getByRole('dialog', { name: 'Review the report pane' })
  await expect(back.getByRole('button', { name: /^Resume/ })).toBeVisible()
  await expect(back.locator('.act-undo').getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

// P2-3: its time running out while it has the focus hands the focus to the status line, never to the page.
test('undo hold · timed out while focused: the focus goes to the status line', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  const undo = sheet.locator('.act-undo').getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  await undo.focus()
  await expect(undo).toHaveCount(0, { timeout: 9000 })
  await expect(sheet.locator('.act-status')).toBeFocused()
})

// P3: Undo is the Resume press, and says what Resume does, as Resume's own press does.
test('undo hold · Undo says what Resume does', async ({ page }) => {
  const sheet = await open(page)
  await page.keyboard.press('h')
  const undo = sheet.locator('.act-undo').getByRole('button', { name: /^Undo/ })
  await expect(undo).toHaveAccessibleName('Undo: Resumes from its saved state.')
  await expect(undo.locator('.tip')).toHaveText('Resumes from its saved state.')
})
