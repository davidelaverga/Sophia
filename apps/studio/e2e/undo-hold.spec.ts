// Undo after Hold (docs/plans/undo-hold.md): once a Hold from a task's sheet is confirmed, «Put on hold.» offers Undo
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
  await expect(line).toContainText('Put on hold.')
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
