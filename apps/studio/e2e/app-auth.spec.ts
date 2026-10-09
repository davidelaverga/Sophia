// The Studio app itself (fixtures/app.tsx: App, its sign-in and the Supabase client, unchanged), signed in by a
// synthetic Supabase Auth service these checks answer in the page (vite.app.config.ts): what the app keeps on the
// device as who is in changes. Codex's re-review of 6e9e2a9b found every page load forgetting the review proposals kept
// unanswered (review-proposal.ts): App forgot them in an effect's cleanup, which ran as each load went from finding out
// who is in to signed in. The fixture pages, which have no App, could not see it. The sessions and proposals here are
// synthetic, for accounts at sophia.test; nothing reaches an Auth service or an API.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const APP = 'http://127.0.0.1:5198'
/** supabase-js's own key for a session with the synthetic Auth service at 127.0.0.1: `sb-<host's first label>-…`. */
const SESSION_KEY = 'sb-127-auth-token'
const PREFIX = 'sophia.review.proposal.v1:'
const PROJECT_A = '00000000-0000-4000-8000-0000000000a1'
const PROJECT_B = '00000000-0000-4000-8000-0000000000b1'
/** What another part of the Studio keeps in the tab: never a proposal, so it always stays. */
const OTHER_PART = 'sophia.plan.seen.v3:["synthetic"]'

interface Person {
  id: string
  email: string
}
const DAVIDE: Person = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
const LUIS: Person = { id: '00000000-0000-4000-8000-00000000e001', email: 'luis@sophia.test' }

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A synthetic session, unsigned: only the synthetic Auth service ever sees it, and it signs nothing. */
function session(person: Person) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const claims = { sub: person.id, email: person.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.synthetic`,
    refresh_token: `synthetic-refresh-${person.id}`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    user: {
      id: person.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: person.email,
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

/** A kept proposal's place in the tab (review-proposal.ts's proposalKey) and what is kept there. */
const keyOf = (viewer: Person, project: string, goal: string) =>
  `${PREFIX}${JSON.stringify([viewer.email, project, goal])}`
const keptAs = (goal: string, key: string) =>
  JSON.stringify({
    key,
    request: { goalId: goal, goalRevision: 2, sourceIds: ['source-1'], allowanceUsd: 0.5, purpose: 'Synthetic check' },
  })

/** Davide's two proposals (two projects), Luis's one, and another part's entry. */
const LUIS_A = keyOf(LUIS, PROJECT_A, 'goal-1')
const LUIS_KEPT = keptAs('goal-1', '6f1c7d3e-0b5a-4c2e-9d8f-00000000e0a1')
const HELD: Record<string, string> = {
  [keyOf(DAVIDE, PROJECT_A, 'goal-1')]: keptAs('goal-1', '6f1c7d3e-0b5a-4c2e-9d8f-00000000d0a1'),
  [keyOf(DAVIDE, PROJECT_B, 'goal-7')]: keptAs('goal-7', '6f1c7d3e-0b5a-4c2e-9d8f-00000000d0b7'),
  [LUIS_A]: LUIS_KEPT,
  [OTHER_PART]: '{}',
}
const only = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, HELD[k]]))
const DAVIDES = [keyOf(DAVIDE, PROJECT_A, 'goal-1'), keyOf(DAVIDE, PROJECT_B, 'goal-7')]

/** What the tab keeps: every proposal, and the other part's entry. */
const tabHolds = (page: Page) =>
  page.evaluate(
    ([prefix, other]) =>
      Object.fromEntries(
        Object.entries(sessionStorage).filter(([k]) => k.startsWith(prefix ?? '') || k === other),
      ) as Record<string, string>,
    [PREFIX, OTHER_PART],
  )

interface Watch {
  /** Each screen the app showed, in turn: finding out who is in, then the signed-in Studio or the sign-in. */
  screens: string[]
}
declare global {
  interface Window {
    appWatch?: Watch
  }
}

/** Every request that left the app's own server: none may (no Auth service, API or font of anyone's is reached). */
const elsewhere = new WeakMap<BrowserContext, string[]>()
test.afterEach(({ context }) => expect(elsewhere.get(context) ?? []).toEqual([]))

/**
 * The synthetic Auth service, and an API that answers nothing (the checks need none of its reads). `logout` waits for
 * `release` when given one; every call to the Auth service is counted.
 */
async function serve(context: BrowserContext, logout?: Promise<void>) {
  const calls: string[] = []
  const left: string[] = []
  elsewhere.set(context, left)
  context.on('request', (request) => {
    const { protocol, origin } = new URL(request.url())
    if (origin !== APP && protocol !== 'data:' && protocol !== 'blob:') left.push(request.url())
  })
  await context.route(`${APP}/synthetic-auth/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    calls.push(`${route.request().method()} ${pathname}`)
    if (pathname.endsWith('/auth/v1/logout')) {
      await logout
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic Auth: nothing here' } })
  })
  await context.route(`${APP}/api/**`, (route) =>
    route.fulfill({ status: 503, json: { code: 'unavailable', message: 'Synthetic: no API in this check' } }),
  )
  await context.addInitScript(() => {
    const seen: Watch = { screens: [] }
    window.appWatch = seen
    new MutationObserver(() => {
      const screen = document.querySelector('button[aria-label="Account"]')
        ? 'signed_in'
        : document.querySelector('main.screen[aria-busy="true"]')
          ? 'finding_out'
          : document.querySelector('input[type="email"]')
            ? 'sign_in'
            : null
      if (screen && seen.screens.at(-1) !== screen) seen.screens.push(screen)
    }).observe(document, { subtree: true, childList: true, attributes: true })
  })
  return calls
}

/** A tab whose Supabase session is `person`'s, and whose session storage holds `held`, before the app first loads. */
async function signedInTab(context: BrowserContext, person: Person, held: Record<string, string> = HELD) {
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(
    ([key, signedIn, items]) => {
      localStorage.setItem(key, JSON.stringify(signedIn))
      for (const [k, v] of Object.entries(items)) sessionStorage.setItem(k, v)
    },
    [SESSION_KEY, session(person), held] as const,
  )
  return page
}

const account = (page: Page) => page.getByRole('button', { name: 'Account' }).first()

/** Another tab of this browser, as Supabase's client there tells this one: another account in, or nobody. */
async function anotherTab(context: BrowserContext, now: ReturnType<typeof session> | null) {
  const other = await context.newPage()
  await other.goto(`${APP}/favicon.svg`)
  await other.evaluate(
    ([key, signedIn]) => {
      if (signedIn) localStorage.setItem(key, JSON.stringify(signedIn))
      else localStorage.removeItem(key)
      // A BroadcastChannel's message has no target origin: the channel is this origin's alone.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      new BroadcastChannel(key).postMessage({ event: signedIn ? 'SIGNED_IN' : 'SIGNED_OUT', session: signedIn })
    },
    [SESSION_KEY, now] as const,
  )
  await other.close()
}

test('codex · 6e9e2a9b · a page load keeps the viewer’s proposals: finding out who is in, signed in, and a reload', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(page.getByRole('note')).toContainText('Simulated')
  await expect(account(page)).toBeVisible()
  // The load went through the boundary the regression was at: the app found out who is in, then signed in.
  expect((await page.evaluate(() => window.appWatch?.screens)) ?? []).toEqual(['finding_out', 'signed_in'])
  await expect.poll(() => tabHolds(page)).toEqual(only(...DAVIDES, OTHER_PART))
  await page.reload()
  await expect(account(page)).toBeVisible()
  expect((await page.evaluate(() => window.appWatch?.screens)) ?? []).toEqual(['finding_out', 'signed_in'])
  // Kept as they were: the same keys and the same requests, so the form proposes the same one again.
  expect(await tabHolds(page)).toEqual(only(...DAVIDES, OTHER_PART))
})

test('codex · 6e9e2a9b · another account coming in, in another tab, keeps only theirs', async ({ context }) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await expect.poll(() => tabHolds(page)).toEqual(only(...DAVIDES, OTHER_PART))
  // Luis's was forgotten as Davide came in; kept again here, it is what Luis's coming in must keep.
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [LUIS_A, LUIS_KEPT] as const)
  await anotherTab(context, session(LUIS))
  await expect.poll(() => tabHolds(page)).toEqual(only(LUIS_A, OTHER_PART))
  await expect(account(page)).toBeVisible()
})

test('codex · 6e9e2a9b · signing out forgets every proposal at once, before the Auth service answers', async ({
  context,
}) => {
  const held = Promise.withResolvers<void>()
  const calls = await serve(context, held.promise)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await expect.poll(() => tabHolds(page)).toEqual(only(...DAVIDES, OTHER_PART))
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect.poll(() => calls.filter((c) => c.endsWith('/auth/v1/logout')).length).toBe(1)
  // The sign-out is still on its way (its answer is held), and nothing of anyone's is kept.
  expect(await tabHolds(page)).toEqual(only(OTHER_PART))
  expect(await account(page).isVisible()).toBe(true)
  held.resolve()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  expect(await tabHolds(page)).toEqual(only(OTHER_PART))
})

test('codex · 6e9e2a9b · a sign-out in another tab forgets every proposal here', async ({ context }) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await expect.poll(() => tabHolds(page)).toEqual(only(...DAVIDES, OTHER_PART))
  await anotherTab(context, null)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect.poll(() => tabHolds(page)).toEqual(only(OTHER_PART))
})
