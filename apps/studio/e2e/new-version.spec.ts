import { expect, test, type Page } from '@playwright/test'

// A new version is said, with Reload (docs/plans/new-version.md): after a deploy a tab left open asks for files that are
// gone, and Vite says so (`vite:preloadError`); the Studio shows a notice that stays until answered. The app's fixture
// page, as app-auth.spec.ts opens it.

const APP = 'http://127.0.0.1:5198'
const notice = (page: Page) => page.getByRole('status').filter({ hasText: 'Sophia was updated' })
const deployed = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError')))

test('version · a part that can’t load after a deploy says Sophia was updated; Not now hides it until the next', async ({
  page,
}) => {
  await page.goto(`${APP}/app.html`)
  await expect(notice(page)).toHaveCount(0)
  await deployed(page)
  await expect(notice(page)).toHaveText(/Sophia was updated\. Reload to keep going\./)
  await notice(page).getByRole('button', { name: 'Not now' }).click()
  await expect(notice(page)).toHaveCount(0)
  await deployed(page)
  await expect(notice(page)).toBeVisible()
})

test('version · Reload reloads the page', async ({ page }) => {
  await page.goto(`${APP}/app.html`)
  await page.evaluate(() => Reflect.set(window, 'beforeReload', true))
  await deployed(page)
  await notice(page).getByRole('button', { name: 'Reload' }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'beforeReload') === true)).toBe(false)
})
