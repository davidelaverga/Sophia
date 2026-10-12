// Nothing found: ask Sophia instead (docs/plans/ask-instead.md). A search that finds nothing offers the words to Sophia:
// Conversations' new form opens with them as its question and «Ask Sophia» on.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const WORDS = 'zebra crossings in the north'
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Conversations' form, opened with the words as its question and Sophia asked. */
async function formAsks(page: Page) {
  await expect(form(page)).toBeVisible()
  await expect(form(page).getByRole('textbox', { name: 'Question' })).toHaveValue(WORDS)
  await expect(form(page).getByRole('checkbox', { name: 'Ask Sophia' })).toBeChecked()
}

test('ask instead · Knowledge finding nothing offers the words to Sophia, in a new conversation', async ({ page }) => {
  await page.goto('/room.html?demo=1&conversations=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  await page.getByRole('searchbox', { name: 'Search reports' }).fill(WORDS)
  await expect(page.getByText('No reports match these filters.')).toBeVisible()
  await page.getByRole('button', { name: `Ask Sophia about “${WORDS}”` }).click()
  await formAsks(page)
})

test('ask instead · Search finding nothing offers the same', async ({ page }) => {
  await page.goto('/room.html?demo=1&conversations=1&place=updates')
  await drawn(page, DRAWN.updates)
  await page.keyboard.press('/')
  const sheet = page.getByRole('dialog', { name: 'Search this project' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('searchbox', { name: 'Search this project' }).fill(WORDS)
  await expect(sheet.getByText(`Nothing in this project matches “${WORDS}”.`)).toBeVisible()
  await sheet.getByRole('button', { name: `Ask Sophia about “${WORDS}”` }).click()
  await expect(sheet).toHaveCount(0)
  await formAsks(page)
})
