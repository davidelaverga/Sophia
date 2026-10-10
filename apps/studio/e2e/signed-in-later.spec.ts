// The sign-in page downloads only what signing in needs (docs/plans/signed-in-later.md): the signed-in Studio, the
// API's client and the contract validators it brings come once a session is there, or once the person starts to sign
// in. On the app itself (fixtures/app.tsx, vite.app.config.ts), whose modules the dev server serves one by one, so
// what the page asks for is what it would download. Nobody is signed in but a synthetic account at sophia.test in the
// last check; nothing reaches an Auth service or an API.
import { expect, test, type Page } from '@playwright/test'

const APP = 'http://127.0.0.1:5198'
/** supabase-js's own key for a session with the synthetic Auth service at 127.0.0.1 (as app-auth.spec.ts). */
const SESSION_KEY = 'sb-127-auth-token'

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * A synthetic session, unsigned, for an account at sophia.test (or a guest's, anonymous, as a room's door leaves):
 * only the synthetic Auth service ever sees it.
 */
function session(anonymous = false) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const user = { id: '00000000-0000-4000-8000-00000000d001', email: anonymous ? '' : 'davide@sophia.test' }
  const claims = { sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: anonymous })}.synthetic`,
    refresh_token: `synthetic-refresh-${user.id}`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    user: {
      ...user,
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: anonymous,
      app_metadata: { provider: anonymous ? 'anonymous' : 'email' },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

/** The signed-in Studio's own modules, and what only it needs: none is the sign-in's. */
const LATER = ['/src/app/SignedIn.tsx', '/src/api/client.ts', '/contracts/src/generated/validators.js']

/** How long the page is left at rest before what it asked for is read: past any idle callback or short timer. */
const AT_REST_MS = 2000

/** Every module and file the page asks for, by its path, as each request leaves (not once its answer is in). */
function recorded(page: Page) {
  const paths: string[] = []
  page.on('request', (request) => paths.push(new URL(request.url()).pathname))
  return paths
}

const later = (paths: readonly string[]) => paths.filter((p) => LATER.some((l) => p.endsWith(l)))

test.beforeEach(async ({ context }) => {
  // No session: the synthetic Auth service has nothing; no API answers.
  await context.route(`${APP}/synthetic-auth/**`, (route) => route.fulfill({ status: 404, json: { code: 404 } }))
  await context.route(`${APP}/api/**`, (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }))
})

test('later · the sign-in page at rest asks for none of the signed-in Studio, its client or the validators', async ({
  page,
}) => {
  const asked = recorded(page)
  // supabase-js's own keys beside the session's, no session: a provider's sign-in started and left, and an account's
  // user as it is kept apart (its `-user` key) — an account's, by its value, but no session by its key.
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(
    ([verifier, user, value]) => {
      localStorage.setItem(verifier, '"synthetic-verifier"')
      localStorage.setItem(user, value)
    },
    [`${SESSION_KEY}-code-verifier`, `${SESSION_KEY}-user`, JSON.stringify({ user: session().user })] as const,
  )
  await page.goto(`${APP}/app.html`)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  // Nothing asked for at rest: not on drawing, nor on an idle moment or a timer after it.
  await page.waitForTimeout(AT_REST_MS)
  expect(later(asked)).toEqual([])
})

test('later · a guest’s session left from a room’s door, back at the Studio, asks for none of it', async ({ page }) => {
  const asked = recorded(page)
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify(session(true)),
  ] as const)
  await page.goto(`${APP}/app.html`)
  // A guest is no account: the Studio asks them to sign in, and fetches nothing for it at rest.
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await page.waitForTimeout(AT_REST_MS)
  expect(later(asked)).toEqual([])
})

test('later · a sign-in’s return fetches the signed-in Studio while who is in is still found out', async ({ page }) => {
  const asked = recorded(page)
  await page.route('**/synthetic-auth/auth/v1/token*', () => undefined)
  await page.goto(`${APP}/app.html?code=synthetic-code`)
  await expect.poll(() => asked.some((p) => p.endsWith('/src/app/SignedIn.tsx'))).toBe(true)
})

test('later · the person starting to sign in fetches the signed-in Studio ahead', async ({ page }) => {
  const asked = recorded(page)
  await page.goto(`${APP}/app.html`)
  const email = page.locator('input[type="email"]')
  await expect(email).toBeVisible()
  await email.press('a')
  await expect.poll(() => asked.some((p) => p.endsWith('/src/app/SignedIn.tsx'))).toBe(true)
})

test('later · a signed-in Studio that doesn’t arrive says so, with the page again one press away', async ({ page }) => {
  // Its chunk refused, as a deploy that replaced it or a dropped connection would.
  await page.route('**/src/app/SignedIn.tsx*', (route) => route.abort())
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify(session()),
  ] as const)
  await page.goto(`${APP}/app.html`)
  await expect(page.getByRole('heading', { name: 'Sophia couldn’t finish opening' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load again' })).toBeVisible()
})

test('later · with a session kept, the signed-in Studio is asked for beside the app’s modules', async ({ page }) => {
  const asked = recorded(page)
  // The app's own modules held at App: what the page asks for meanwhile goes beside them (index.html's early script).
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route('**/src/app/App.tsx*', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify(session()),
  ] as const)
  await page.goto(`${APP}/app.html`, { waitUntil: 'commit' })
  try {
    await expect.poll(() => asked.some((p) => p.endsWith('/src/app/SignedIn.tsx'))).toBe(true)
  } finally {
    release()
  }
  await expect(page.getByRole('button', { name: 'Account' }).first()).toBeVisible()
})

test('later · with a session kept, the signed-in Studio is fetched while who is in is still found out', async ({
  page,
}) => {
  const asked = recorded(page)
  // A session past its time: finding out who is in waits on its refresh, which this check holds.
  await page.route('**/synthetic-auth/auth/v1/token*', () => undefined)
  await page.goto(`${APP}/favicon.svg`)
  const past = Math.floor(Date.now() / 1000) - 60
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify({ ...session(), expires_at: past, expires_in: -60 }),
  ] as const)
  await page.goto(`${APP}/app.html`)
  // Still finding out, the chunk already asked for: never one after the other.
  await expect.poll(() => asked.some((p) => p.endsWith('/src/app/SignedIn.tsx'))).toBe(true)
  await expect(page.locator('main.screen[aria-busy="true"]')).toBeVisible()
})
