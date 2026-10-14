// Notes on a goal (docs/plans/goal-notes.md): written in its sheet, newest first; the latest said on its row; a
// difficulty a call for attention.
import { expect, test, type Page } from '@playwright/test'

const ROLLOUT = 'Roll the new onboarding out to every region'
const READY = 'Keep teams through an admin change'
const row = (page: Page, title: string) => page.locator('li.goal', { hasText: title })
const sheetOf = (page: Page, title: string) => page.getByRole('dialog', { name: title })
const open = async (page: Page, title: string) => {
  await page.getByRole('button', { name: title, exact: true }).click()
  return sheetOf(page, title)
}

test('notes · the demo’s rollout says Sophia’s difficulty on its row, and holds its notes newest first', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals')
  await expect(row(page, ROLLOUT).locator('.goal-row-line')).toContainText('Sophia “From the call: legal review')
  const sheet = await open(page, ROLLOUT)
  const notes = sheet.locator('.goal-notes li')
  await expect(notes).toHaveCount(2)
  await expect(notes.first()).toContainText('Sophia')
  await expect(notes.first().locator('.goal-note-kind')).toHaveText('Difficulty')
  await expect(notes.nth(1)).toContainText('You')
  await expect(notes.nth(1).locator('.goal-note-kind')).toHaveCount(0)
})

test('notes · a Difficulty written on the ready goal comes first as «You» and calls its row to attention', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals')
  await expect(row(page, READY).locator('.goal-health')).toHaveText('Not started')
  const sheet = await open(page, READY)
  await expect(sheet.locator('.goal-notes li')).toHaveCount(0)
  await expect(sheet).toContainText('No notes yet')
  await sheet.getByRole('textbox', { name: 'A note on this goal' }).fill('The new admin checklist has no owner yet.')
  await sheet.getByRole('radio', { name: 'Difficulty' }).click()
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  const first = sheet.locator('.goal-notes li').first()
  await expect(first).toContainText('The new admin checklist has no owner yet.')
  await expect(first).toContainText('You')
  await expect(first.locator('.goal-note-kind')).toHaveText('Difficulty')
  await expect(sheet.getByRole('textbox', { name: 'A note on this goal' })).toHaveValue('')
  await expect(sheet.getByRole('radio', { name: 'Note', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(row(page, READY).locator('.goal-health')).toHaveText('Needs attention')
  await expect(row(page, READY).locator('.goal-row-line')).toContainText(
    'You “The new admin checklist has no owner yet.”',
  )
})

test('notes · a note Sophia writes from a call reaches the row as the project moves, with no reload (Codex P1 on #305)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=goals')
  await expect(row(page, READY).locator('.goal-health')).toHaveText('Not started')
  await page.evaluate(() =>
    window.fixture?.noteOnGoal(
      'Keep teams through an admin change',
      'From the call: nobody owns the admin checklist yet.',
    ),
  )
  await expect(row(page, READY).locator('.goal-health')).toHaveText('Needs attention')
  await expect(row(page, READY).locator('.goal-row-line')).toContainText('Sophia “From the call: nobody owns')
})

test('notes · ⌘/Ctrl+Enter adds the note', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  const sheet = await open(page, READY)
  const field = sheet.getByRole('textbox', { name: 'A note on this goal' })
  await field.fill('Ana will own the checklist from Monday.')
  await field.press('ControlOrMeta+Enter')
  await expect(sheet.locator('.goal-notes li').first()).toContainText('Ana will own the checklist from Monday.')
})

test('notes · with notes off, the sheet says why and offers no field', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals&notes=off')
  const sheet = await open(page, ROLLOUT)
  await expect(sheet).toContainText('Notes are off for you here.')
  await expect(sheet.getByRole('textbox', { name: 'A note on this goal' })).toHaveCount(0)
})
