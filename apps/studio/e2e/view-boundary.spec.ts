import { expect, test, type Page } from '@playwright/test'

// A view that fails to draw doesn't take the Studio with it (docs/plans/view-boundary.md): its place says so, with Try
// again and Load the page again, while the header, the other views and the call stay. The fixture's Resources view fails
// to draw (`resources=crash`) until `healView`, as a bug in a view would. (A snapshot shaped other than the contract never
// reaches a view: it is refused as unreachable.)

const failed = (page: Page) => page.getByRole('alert').filter({ hasText: 'This view couldn’t be drawn.' })
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('boundary · a view that fails to draw says so in its place; the header’s views stay and another opens', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=resources&resources=crash')
  await expect(failed(page)).toBeVisible()
  await expect(page.getByText('Sophia couldn’t finish opening')).toHaveCount(0)
  await views(page).getByRole('link', { name: 'Knowledge' }).click()
  await expect(failed(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Knowledge', level: 2 })).toBeVisible()
})

test('boundary · Try again draws the view anew, once what it reads is whole again', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=resources&resources=crash')
  await expect(failed(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.healView())
  await failed(page).getByRole('button', { name: 'Try again' }).click()
  await expect(failed(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Resources', level: 2 })).toBeVisible()
})

// The pressed button goes with the fallback, so a keyboard would start again from the top of the page: the focus goes on
// from where Try again was (Codex P2 on #416, focus-and-webgl-follow-ups.md).
const focusedNow = (page: Page) =>
  page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || null)

/** Resources failing to draw, its Try again focused as a keyboard reaches it. */
async function againFocused(page: Page) {
  await page.goto('/room.html?demo=1&place=resources&resources=crash')
  const again = failed(page).getByRole('button', { name: 'Try again' })
  await again.focus()
  return again
}

test('boundary · Try again from the keyboard leaves the focus on the view drawn again, at its heading', async ({
  page,
}) => {
  await againFocused(page)
  await page.evaluate(() => window.fixture?.healView())
  await page.keyboard.press('Enter')
  await expect(failed(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Resources', level: 2 })).toBeVisible()
  await expect.poll(() => focusedNow(page)).toBe('resources-title')
})

test('boundary · Try again from the keyboard, still failing, keeps the focus on Try again', async ({ page }) => {
  const again = await againFocused(page)
  await page.keyboard.press('Enter')
  await expect(failed(page)).toBeVisible()
  await expect(again).toBeFocused()
})

test('boundary · in Tasks, its pulse is the view’s too: drawn inside the view’s boundary (Codex P1 on #416)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work')
  const pulse = page.locator('aside.pulse')
  await expect(pulse).toBeVisible()
  // A pulse that fails to draw is then the view's failure, said in its place; the boundary's own way is checked above.
  expect(await pulse.evaluate((el) => el.closest('[data-view-boundary]') !== null)).toBe(true)
})
