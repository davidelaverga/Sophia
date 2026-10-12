// The next ask on Home and on a task's sheet (docs/plans/next-ask-places.md): the field's placeholder is the next ask,
// its key cap «Tab» while focused and empty; Tab puts it in, Esc puts it away.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

const line = (page: Page) => page.getByRole('textbox', { name: 'Say something to Sophia' })

test('next ask · Home: the line suggests the busiest room’s ask; focused, Tab stands; Tab fills the line', async ({
  page,
}) => {
  await page.goto('/home.html?demo=1')
  await drawn(page, DRAWN.home)
  await expect(line(page)).toHaveAttribute('placeholder', /^Catch me up on /)
  const suggested = (await line(page).getAttribute('placeholder')) ?? ''
  await line(page).focus()
  await expect(page.locator('.hw-say .next-ask kbd')).toHaveText('Tab')
  await page.keyboard.press('Tab')
  await expect(line(page)).toHaveValue(suggested)
  await expect(line(page)).toBeFocused()
  await expect(page.locator('.hw-say .next-ask')).toHaveCount(0)
})

test('next ask · Home: Esc puts the suggestion away for the visit', async ({ page }) => {
  await page.goto('/home.html?demo=1')
  await drawn(page, DRAWN.home)
  await line(page).focus()
  await page.keyboard.press('Escape')
  await expect(line(page)).toHaveAttribute('placeholder', 'Say something to Sophia')
  await expect(page.locator('.hw-say .next-ask')).toHaveCount(0)
})

test('next ask · Home: put away, it comes back on the next visit to Home (Codex on #268)', async ({ page }) => {
  await page.goto('/home.html?demo=1&leave=1')
  await drawn(page, DRAWN.home)
  const suggested = (await line(page).getAttribute('placeholder')) ?? ''
  expect(suggested).toMatch(/^Catch me up on /)
  await line(page).focus()
  await page.keyboard.press('Escape')
  await expect(line(page)).toHaveAttribute('placeholder', 'Say something to Sophia')
  // Another place and back: Home stays mounted under a hidden place, and the visit is a new one.
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(line(page)).toHaveAttribute('placeholder', suggested)
})

test('next ask · a task’s sheet: the field suggests the first question its state invites; Tab fills it', async ({
  page,
}) => {
  await page.goto('/work.html?viewer=davide')
  await page.locator('.task-tile').first().click()
  const field = page.getByRole('textbox', { name: 'Ask Sophia about this task' })
  await expect(field).toBeVisible()
  const first = (await page.locator('.ask-chips .ask-chip').first().textContent()) ?? ''
  expect(first).not.toBe('')
  await expect(field).toHaveAttribute('placeholder', first)
  await field.focus()
  await expect(page.locator('.act-guide .next-ask kbd')).toHaveText('Tab')
  await page.keyboard.press('Tab')
  await expect(field).toHaveValue(first)
})

test('next ask · a task’s sheet: Escape in its empty field puts the suggestion away and leaves the sheet open (Codex on #268)', async ({
  page,
}) => {
  await page.goto('/work.html?viewer=davide')
  await page.locator('.task-tile').first().click()
  const field = page.getByRole('textbox', { name: 'Ask Sophia about this task' })
  await expect(field).toBeVisible()
  const first = (await field.getAttribute('placeholder')) ?? ''
  await field.focus()
  await page.keyboard.press('Escape')
  await expect(page.locator('.task-sheet')).toBeVisible()
  await expect(field).not.toHaveAttribute('placeholder', first)
  // A second Escape, nothing left to put away, is the sheet's: it closes.
  await page.keyboard.press('Escape')
  await expect(page.locator('.task-sheet')).toHaveCount(0)
})
