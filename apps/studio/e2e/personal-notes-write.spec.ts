import { expect, test, type Page } from '@playwright/test'

// Writing a note, and finding one, in Personal (docs/plans/personal-notes-write-find.md): a line at the top of the notes
// keeps a note with no turn behind it, and from six notes Find narrows them by their words. Every note is synthetic.

const panel = (page: Page) => page.locator('#c-notes')
const field = (page: Page) => panel(page).getByRole('textbox', { name: 'Write a note' })
const find = (page: Page) => panel(page).getByRole('searchbox', { name: 'Find in notes' })
const listed = (page: Page) => panel(page).locator('.c2-t p')

test('notes · a note written in the notes is kept, said so, and the field empties', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1')
  await field(page).fill('Call Ana about the venue')
  await field(page).press('Enter')
  await expect(listed(page).filter({ hasText: 'Call Ana about the venue' })).toHaveCount(1)
  await expect(field(page)).toHaveValue('')
  expect(await page.evaluate(() => window.personalFixture?.toasts.at(-1))).toBe('Kept')
})

test('notes · with eight notes, Find narrows them by their words, any case or accent, and says when none hold it', async ({
  page,
}) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  await expect(listed(page)).toHaveCount(8)
  await find(page).fill('NUMERO')
  await expect(listed(page)).toHaveText(['Revisar el número de marzo'])
  await find(page).fill('zzz')
  await expect(listed(page)).toHaveCount(0)
  await expect(panel(page)).toContainText('No notes hold “zzz”.')
  await find(page).fill('')
  await expect(listed(page)).toHaveCount(8)
})

test('notes · with fewer than six, there is nothing to find', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1&many=1')
  await expect(listed(page).first()).toBeVisible()
  await expect(find(page)).toHaveCount(0)
})

test('notes · the field waits for the notes, and says Keeping… while a note goes (Codex P2s on #363)', async ({
  page,
}) => {
  await page.goto('/personal.html?notes=open&ready=1&spaceAfter=1200&keepSlow=1')
  await expect(field(page)).toHaveCount(0)
  await expect(field(page)).toBeVisible()
  await field(page).fill('Ask Bea about Friday')
  await field(page).press('Enter')
  await expect(panel(page).getByRole('status').filter({ hasText: 'Keeping…' })).toBeVisible()
  await expect(listed(page).filter({ hasText: 'Ask Bea about Friday' })).toHaveCount(1)
  await expect(panel(page).getByText('Keeping…')).toHaveCount(0)
})
