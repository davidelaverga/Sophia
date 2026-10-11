// A task's sheet by its keys (docs/plans/task-keys-micro-type.md): H holds or resumes, S asks to stop, on the Tasks
// fixture page.
import { expect, test } from '@playwright/test'

const PAGE = '/work.html'

test('keys · H holds, then resumes; S asks to stop and the safe answer takes the focus; a field keeps the keys', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  await page.locator('[data-task="work-2"]').click()
  const sheet = page.getByRole('dialog', { name: 'Review the report pane' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.task-sheet-plan')).toContainText('H hold or resume')
  await expect(sheet.locator('.task-sheet-plan')).toContainText('S stop')
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-steps')).toContainText('Held.')
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-steps')).toContainText('Resumed.')
  await page.keyboard.press('s')
  const ask = sheet.getByRole('group', { name: 'Stop' })
  await expect(ask).toBeVisible()
  await expect(ask.getByRole('button', { name: /^Keep/ })).toBeFocused()
  await page.keyboard.press('s') // it asks already: nothing more is asked, nothing is stopped
  await expect(sheet.getByRole('group', { name: 'Stop' })).toHaveCount(1)
  await ask.getByRole('button', { name: /^Keep/ }).click()
  await expect(sheet.getByRole('group', { name: 'Stop' })).toHaveCount(0)
  const guide = sheet.getByRole('textbox', { name: 'Guidance for its session' })
  await guide.fill('')
  await guide.press('h')
  await expect(guide).toHaveValue('h')
  await expect(sheet.getByRole('group', { name: 'Stop' })).toHaveCount(0)
})
