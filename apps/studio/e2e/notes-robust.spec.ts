// Notes on goals, honest when the ledger is slow or fails (docs/plans/notes-robust.md): the brief says the notes are
// being read, or that they can't be, with Try again; a note kept while reads fail says the list couldn't be read again.
import { expect, test } from '@playwright/test'

const READY = 'Keep teams through an admin change'

test('notes · while the ledger is held, the brief says the notes are being read', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&mission=hold')
  await expect(page.locator('.goals-brief')).toContainText('Reading the notes…')
})

test('notes · a ledger that fails says so with Try again, and Try again brings the difficulty back', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals&mission=fail')
  const failed = page.locator('.goals-notes-failed')
  await expect(failed).toContainText('The notes can’t be read right now', { timeout: 20_000 })
  await page.evaluate(() => window.fixture?.failMission(false))
  await failed.getByRole('button', { name: 'Try again' }).click()
  await expect(failed).toHaveCount(0)
  await expect(page.locator('li.goal').first().locator('.goal-row-line')).toContainText('Sophia “From the call')
})

test('notes · a note kept while reads fail says the list couldn’t be read again', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  await page.getByRole('button', { name: READY, exact: true }).click()
  const sheet = page.getByRole('dialog', { name: READY })
  await expect(sheet.getByText('No notes yet.')).toBeVisible()
  await page.evaluate(() => window.fixture?.failMission(true))
  await sheet.getByRole('textbox', { name: 'A note on this goal' }).fill('The checklist has no owner yet.')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText('The notes couldn’t be read again.', { timeout: 20_000 })
  await expect(sheet.getByRole('alert').getByRole('button', { name: 'Try again' })).toBeVisible()
})
