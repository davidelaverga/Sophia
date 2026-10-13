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

test('ask instead · with the form already open, Search’s words land in its question with the focus (Codex on #267)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&conversations=1&place=conversations')
  await drawn(page, DRAWN.conversations)
  await page.locator('.conv-list-head button').first().click()
  await expect(form(page)).toBeVisible()
  await page
    .locator('.topbar')
    .getByRole('button', { name: /^Search/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Search this project' })
  await sheet.getByRole('searchbox', { name: 'Search this project' }).fill(WORDS)
  await sheet.getByRole('button', { name: `Ask Sophia about “${WORDS}”` }).click()
  await expect(sheet).toHaveCount(0)
  await formAsks(page)
  await expect(form(page).getByRole('textbox', { name: 'Question' })).toBeFocused()
})

test('ask instead · Knowledge’s ask goes while new words settle, never offering the old ones (Codex P2s on #267)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&conversations=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  const search = page.getByRole('searchbox', { name: 'Search reports' })
  await search.fill(WORDS)
  await expect(page.getByRole('button', { name: `Ask Sophia about “${WORDS}”` })).toBeVisible()
  await search.fill(`${WORDS} again`)
  // At once: no ask carries the old words. Read by its exact words, so the new words' ask, if a slow worker has already
  // settled them, is not mistaken for it (Codex on #276).
  const old = `Ask Sophia about “${WORDS}”`
  expect(
    await page.evaluate(
      (words) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === words),
      old,
    ),
  ).toBe(false)
  await expect(page.getByRole('button', { name: `Ask Sophia about “${WORDS} again”` })).toBeVisible()
})

test('ask instead @phone · a viewer’s ask shows the list, not a conversation (Codex P2 on #267)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/room.html?demo=1&conversations=1&place=knowledge&role=viewer')
  // A viewer has no Invite, which DRAWN.knowledge waits for: the search is the page drawn enough.
  await page.getByRole('searchbox', { name: 'Search reports' }).fill(WORDS)
  await page.getByRole('button', { name: `Ask Sophia about “${WORDS}”` }).click()
  await expect(page.locator('.conversations')).toHaveAttribute('data-screen', 'list')
  await expect(form(page)).toHaveCount(0)
})

test('ask instead @phone · a viewer reading a conversation, asked from Search, is taken back to the list (Codex on #276)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/room.html?demo=1&conversations=1&place=conversations&role=viewer')
  const view = page.locator('.conversations')
  await page.locator('.conv-row').first().click()
  await expect(view).toHaveAttribute('data-screen', 'thread')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Search this project' })
  await sheet.getByRole('searchbox', { name: 'Search this project' }).fill(WORDS)
  await sheet.getByRole('button', { name: `Ask Sophia about “${WORDS}”` }).click()
  await expect(sheet).toHaveCount(0)
  await expect(view).toHaveAttribute('data-screen', 'list')
})
