import { expect, test, type Page } from '@playwright/test'

// Skip to content (docs/plans/skip-link.md): the first press on every page, shown once focused, takes the focus past the
// header to the page's content, and leaves the address alone (the Studio's anchors live there).

const APP = 'http://127.0.0.1:5198'
const skip = (page: Page) => page.getByRole('link', { name: 'Skip to content' })
const focusedContent = (page: Page) =>
  page.evaluate(() => document.activeElement?.hasAttribute('data-content') === true)

test('skip · signed out, the first Tab shows Skip to content, and Enter goes to the sign-in, the address unchanged', async ({
  page,
}) => {
  await page.goto(`${APP}/app.html`)
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
