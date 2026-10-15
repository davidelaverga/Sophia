import { expect, test, type Page } from '@playwright/test'

// A note kept can be forgotten later (docs/plans/personal-forget-note.md), not only by the notice's Undo: beside Carry,
// Forget asks first, since forgetting erases its words for good, and the focus goes on to the next note. Every note
// here is synthetic.

const PAGE = '/personal.html?notes=open&ready=1&many=1'
const panel = (page: Page) => page.locator('#c-notes')
const forgotten = (page: Page) => page.evaluate(() => [...(window.personalFixture?.forgotten ?? [])])
const note = (page: Page, words: string) => panel(page).locator('.c2-t', { hasText: words })

test('notes · Forget asks first; confirmed, the note goes for good, said so, and the focus goes to the next one', async ({
  page,
}) => {
  await page.goto(PAGE)
  const first = note(page, 'Start the deck from one number I trust')
  await first.getByRole('button', { name: 'Forget' }).click()
  // It asks, the focus on the safe answer.
  await expect(first).toContainText('Her copy of this note is erased.')
  await expect(first.getByRole('button', { name: 'Keep it' })).toBeFocused()
  await first.getByRole('button', { name: 'Keep it' }).click()
  expect(await forgotten(page)).toEqual([])
  // Asked again and confirmed.
  await first.getByRole('button', { name: 'Forget' }).click()
  await first.getByRole('button', { name: 'Forget it' }).click()
  await expect(note(page, 'Start the deck from one number I trust')).toHaveCount(0)
  expect(await forgotten(page)).toEqual(['note-1'])
  expect(await page.evaluate(() => window.personalFixture?.toasts.at(-1))).toBe('Forgotten')
  await expect(panel(page).locator('.c2-t').first().getByRole('button', { name: 'Carry' })).toBeFocused()
})

test('notes · the last note forgotten leaves the notes saying none are kept', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1')
  const only = note(page, 'Start the deck from one number I trust')
  await only.getByRole('button', { name: 'Forget' }).click()
  await only.getByRole('button', { name: 'Forget it' }).click()
  await expect(panel(page).locator('.c2-t')).toHaveCount(0)
  await expect(panel(page).locator('.ps-empty')).toBeVisible()
})
