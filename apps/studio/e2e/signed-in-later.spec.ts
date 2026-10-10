// The sign-in page downloads only what signing in needs (docs/plans/signed-in-later.md): the signed-in Studio, the
// API's client and the contract validators it brings come once a session is there, or once the person starts to sign
// in. On the app itself (fixtures/app.tsx, vite.app.config.ts), whose modules the dev server serves one by one, so
// what the page asked for is what it would download. Nobody is signed in; nothing reaches an Auth service or an API.
import { expect, test, type Page } from '@playwright/test'

const APP = 'http://127.0.0.1:5198'

/** The signed-in Studio's own modules, and what only it needs: none is the sign-in's. */
const LATER = ['/src/app/SignedIn.tsx', '/src/api/client.ts', '/contracts/src/generated/validators.js']

/** Every module and file the page has asked for, by its path. */
const asked = (page: Page) =>
  page.evaluate(() => performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname))

const later = (paths: string[]) => paths.filter((p) => LATER.some((l) => p.endsWith(l)))

test.beforeEach(async ({ context }) => {
  // No session: the synthetic Auth service has nothing; no API answers.
  await context.route(`${APP}/synthetic-auth/**`, (route) => route.fulfill({ status: 404, json: { code: 404 } }))
  await context.route(`${APP}/api/**`, (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }))
})

test('later · the sign-in page at rest asks for none of the signed-in Studio, its client or the validators', async ({
  page,
}) => {
  await page.goto(`${APP}/app.html`)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect(later(await asked(page))).toEqual([])
})

test('later · the person starting to sign in fetches the signed-in Studio ahead', async ({ page }) => {
  await page.goto(`${APP}/app.html`)
  const email = page.locator('input[type="email"]')
  await expect(email).toBeVisible()
  await email.press('a')
  await expect.poll(async () => (await asked(page)).some((p) => p.endsWith('/src/app/SignedIn.tsx'))).toBe(true)
})
