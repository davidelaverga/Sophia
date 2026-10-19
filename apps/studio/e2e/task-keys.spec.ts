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
  await expect(sheet.locator('.task-sheet-plan kbd')).toHaveText(['J', 'K', 'H', 'S'])
  await page.keyboard.press('h')
  await expect(sheet.locator('.act-steps')).toContainText('Held.')
  await expect(sheet.locator('.task-sheet-plan kbd')).toHaveText(['J', 'K', 'H', 'S']) // H now presses Resume
  // The key held down repeats: a repeat is not a press, so the Resume the hold brought is not pressed by it.
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', repeat: true, bubbles: true })),
  )
  await expect(sheet.locator('.act-steps')).not.toContainText('Resumed.')
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
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
  // A field keeps the keys: the sheet's question to Sophia (the guidance field is offered only to a task's own session).
  const guide = sheet.getByRole('textbox', { name: 'Ask Sophia about this task' })
  await guide.fill('')
  await guide.press('h')
  await expect(guide).toHaveValue('h')
  await expect(sheet.getByRole('group', { name: 'Stop' })).toHaveCount(0)
})

// The foot names H and S only beside their press (informe-25 DL-12): a reader, a stale read and a task with nothing to
// send have none, so the keys do nothing there and aren't said.
test('keys · the foot names H and S only beside their press: a reader, a stale read, a task with nothing to send', async ({
  page,
}) => {
  const open = async (query: string, task: string) => {
    await page.goto(`${PAGE}?${query}`)
    await page.locator(`[data-task="${task}"]`).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    return sheet
  }
  const reader = await open('viewer=mara', 'work-2')
  await expect(reader.getByRole('button', { name: /^(Hold|Resume|Stop)/ })).toHaveCount(0)
  await expect(reader.locator('.task-sheet-plan kbd')).toHaveText(['J', 'K'])
  await page.keyboard.press('h')
  await expect(reader.locator('.act-steps')).toHaveCount(0)
  const stale = await open('viewer=davide&coverage=unavailable', 'work-2')
  await expect(stale.locator('.session-acts .act-note')).toBeVisible()
  await expect(stale.locator('.task-sheet-plan kbd')).toHaveText(['J', 'K'])
  const asks = await open('viewer=davide', 'work-0b')
  await expect(asks.locator('.task-sheet-plan kbd')).toHaveText(['J', 'K'])
})
