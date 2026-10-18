import { expect, test, type Page } from '@playwright/test'

// Skip to content (docs/plans/skip-link.md): first in the tab order on every page, shown once focused, takes the focus
// past the header to the page's content, and leaves the address alone (the Studio's anchors live there).

const APP = 'http://127.0.0.1:5198'
const skip = (page: Page) => page.getByRole('link', { name: 'Skip to content' })
const focusedContent = (page: Page) =>
  page.evaluate(() => document.activeElement?.hasAttribute('data-content') === true)

// With a pointer, the sign-in's address field takes the focus as it opens (signin-frictions.md): the focus is in the
// content already, where the link would take it. The link stands behind it, first in the tab order (Codex P2 on #417).
test('skip · signed out, Skip to content stands first in the tab order, and Enter goes to the sign-in, the address unchanged', async ({
  page,
}) => {
  await page.goto(`${APP}/app.html`)
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused({ timeout: 15_000 })
  // Back past whatever stands before the field (a provider row, when one shows), within what the page holds.
  for (let i = 0; i < 8 && !(await skip(page).evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Shift+Tab')
  }
  await expect(skip(page)).toBeFocused()
  // First: one more step back leaves the page's presses, and the next Tab comes to the link again.
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(
    true,
  )
  await page.keyboard.press('Tab')
  await expect(skip(page)).toBeFocused()
  await expect(skip(page)).toBeInViewport()
  const before = page.url()
  await page.keyboard.press('Enter')
  await expect.poll(() => focusedContent(page)).toBe(true)
  expect(page.url()).toBe(before)
})

test('skip · in a project’s view it goes past the header to that view’s content', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=goals')
  await expect(page.getByRole('navigation', { name: 'Project views' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(skip(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => focusedContent(page)).toBe(true)
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN')
})
