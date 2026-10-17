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

test('version · a word that came before the notice was drawn still shows it (Codex P2 on #415)', async ({ page }) => {
  // As soon as the page's own scripts have run: App's eager imports may hear of a stale part before React draws.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new Event('vite:preloadError')))
  })
  await page.goto(`${APP}/app.html`)
  await expect(notice(page)).toBeVisible()
})

test('version · the notice stands over the opening, its Reload under the pointer (Codex P2 on #415)', async ({
  page,
}) => {
  await page.goto(`${APP}/app.html`)
  // The opening's overlay, shown, as a sign-in's return shows it.
  await page.evaluate(() => {
    const entry = document.getElementById('entry')
    if (entry) entry.hidden = false
  })
  await deployed(page)
  const reload = notice(page).getByRole('button', { name: 'Reload' })
  await expect(reload).toBeVisible()
  const box = await reload.boundingBox()
  const under = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.textContent ?? '',
    [(box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2],
  )
  expect(under).toBe('Reload')
})

test('version · Not now gives the focus back to where it was (Codex P2 on #415)', async ({ page }) => {
  await page.goto(`${APP}/app.html`)
  // The sign-in's email field: where the person was when the notice came.
  const email = page.locator('input[type="email"]')
  await email.focus()
  await deployed(page)
  await notice(page).getByRole('button', { name: 'Not now' }).focus()
  await page.keyboard.press('Enter')
  await expect(notice(page)).toHaveCount(0)
  await expect(email).toBeFocused()
})

test('version · Reload reloads the page', async ({ page }) => {
  await page.goto(`${APP}/app.html`)
  await page.evaluate(() => Reflect.set(window, 'beforeReload', true))
  await deployed(page)
  await notice(page).getByRole('button', { name: 'Reload' }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'beforeReload') === true)).toBe(false)
})
