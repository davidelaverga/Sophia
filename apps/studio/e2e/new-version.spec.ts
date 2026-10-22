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

test('version · a word after the notice was drawn, before it listened, still shows it (Codex P2 on #432)', async ({
  page,
}) => {
  // Its own fixture page (fixtures/new-version.tsx): the word comes as React commits, between the two.
  await page.goto('/new-version.html')
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

// After a deploy, a Join whose part is gone (docs/plans/stale-part-call.md, costuras.md seam #4): the room's LiveKit is
// loaded only at the first Join or check, and the host no longer has it. `part=gone`: the fake LiveKit says so as the
// build's preload helper does (fake-livekit.ts). The press says the tab is on an older version, politely, with Reload,
// never the connection's or the permission's words; nothing reloads by itself.

const STALE = 'This tab is on an older version of Sophia, so the call couldn’t load.'
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const staleLine = (page: Page) => page.locator('.dock-note[role="status"]').filter({ hasText: STALE })

test('version · after a deploy, Join says this tab is on an older version, with Reload, never the connection words (seam #4)', async ({
  page,
}) => {
  await page.goto('/room.html?part=gone')
  await page.evaluate(() => Reflect.set(window, 'beforeReload', true))
  await dock(page)
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(staleLine(page)).toBeVisible()
  await expect(staleLine(page).getByRole('button', { name: 'Reload' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Check your connection')
  // Try again fails the same way: said again, once on screen, and still nothing reloaded.
  await dock(page)
    .getByRole('button', { name: /^Try again/ })
    .click()
  await expect(staleLine(page)).toHaveCount(1)
  await expect(page.locator('body')).not.toContainText('Check your connection')
  expect(await page.evaluate(() => Reflect.get(window, 'beforeReload') === true)).toBe(true)
  await staleLine(page).getByRole('button', { name: 'Reload' }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'beforeReload') === true)).toBe(false)
})

test('version · after a deploy, the check names no permission: the tab is on an older version, with Reload (seam #4)', async ({
  page,
}) => {
  await page.goto('/room.html?part=gone')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  const check = page.getByRole('dialog', { name: 'Check your audio and video' })
  await expect(check.getByRole('status').filter({ hasText: STALE })).toBeVisible()
  await expect(
    check.getByRole('status').filter({ hasText: STALE }).getByRole('button', { name: 'Reload' }),
  ).toBeVisible()
  await expect(check.getByRole('button', { name: /^Microphone: / })).toHaveAccessibleName('Microphone: Needs a reload')
  await expect(check).not.toContainText('Not allowed')
  await expect(check).not.toContainText('site settings')
  // Join from the check meets the same gone part, and says so in the dock.
  await check.getByRole('button', { name: 'Join the room' }).click()
  await expect(staleLine(page)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Check your connection')
})

test('version · once: the same room with its part there joins with no word of an older version (seam #4)', async ({
  page,
}) => {
  await page.goto('/room.html')
  await dock(page)
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('older version')
})
