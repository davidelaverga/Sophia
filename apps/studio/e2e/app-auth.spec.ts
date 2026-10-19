// The Studio app itself (fixtures/app.tsx: App, its sign-in and the Supabase client, unchanged), signed in by a
// synthetic Supabase Auth service these checks answer in the page (vite.app.config.ts): what the app keeps on the
// device as who is in changes. Codex's re-review of 6e9e2a9b found every page load forgetting the review proposals kept
// unanswered (review-proposal.ts): App forgot them in an effect's cleanup, which ran as each load went from finding out
// who is in to signed in. The fixture pages, which have no App, could not see it. Codex's automatic review of 06bf6229
// (P2) found them kept by the email, which an account can change: they are its account's, its token's subject. The
// sessions and proposals here are synthetic, for accounts at sophia.test; nothing reaches an Auth service or an API
// (`work=lost` answers the app's reads in the page, fixtures/app.tsx).
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { withProbe } from './reliability/measure.ts'

const APP = 'http://127.0.0.1:5198'
/** supabase-js's own key for a session with the synthetic Auth service at 127.0.0.1: `sb-<host's first label>-…`. */
const SESSION_KEY = 'sb-127-auth-token'
const PREFIX = 'sophia.review.proposal.v1:'
const PROJECT_A = '00000000-0000-4000-8000-0000000000a1'
const PROJECT_B = '00000000-0000-4000-8000-0000000000b1'
/** What another part of the Studio keeps in the tab: never a proposal, so it always stays. */
const OTHER_PART = 'sophia.plan.seen.v4:["synthetic"]'

interface Person {
  id: string
  email: string
}
const DAVIDE: Person = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
const LUIS: Person = { id: '00000000-0000-4000-8000-00000000e001', email: 'luis@sophia.test' }
/** Davide's account under the address it changed to: the same account, its token's subject unchanged. */
const RENAMED: Person = { ...DAVIDE, email: 'davide.new@sophia.test' }
/** Another account at Davide's old address (his deleted, a new one made): another subject, so nothing of his. */
const SAME_ADDRESS: Person = { id: '00000000-0000-4000-8000-00000000d002', email: DAVIDE.email }
/** The project and goal `work=lost` serves (fixtures/data.ts's PROJECT, work-data.ts's goal). */
const WORK_PROJECT = '00000000-0000-4000-8000-0000000000aa'
const WORK_GOAL = '00000000-0000-4000-8000-0000000000b1'

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * A synthetic session, unsigned: only the synthetic Auth service ever sees it, and it signs nothing. `life`: seconds its
 * access token has left, a day unless told; below zero it has expired, and supabase-js asks for a refresh as it loads.
 */
function session(person: Person, life = 24 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + life
  const claims = { sub: person.id, email: person.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.synthetic`,
    refresh_token: `synthetic-refresh-${person.id}`,
    token_type: 'bearer',
    expires_in: Math.max(0, life),
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

/** A kept proposal's place in the tab (review-proposal.ts's proposalKey: its account, the subject) and what is kept. */
const keyOf = (viewer: Person, project: string, goal: string) =>
  `${PREFIX}${JSON.stringify([viewer.id, project, goal])}`
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
    appFixture?: {
      proposals: readonly { key: string; body: unknown }[]
      asked: readonly string[]
      unexpected: readonly string[]
      attention: readonly string[]
      hold: (by: string, path: string, method?: string) => void
      release: () => void
      expireToken: () => void
      refuseTokens: () => void
      dropStream: () => void
      /** Each request refused for its token (`expireToken`, `refuseTokens`), as `METHOD /path`. */
      refused: readonly string[]
      /** Each request with an Idempotency-Key, refused or not, as `METHOD /path key`. */
      keys: readonly string[]
    }
    /** "Review sources" buttons the page added since the check began counting them. */
    reviewSourcesAdded?: number
  }
}

/** Every request that left the app's own server: none may (no Auth service, API or font of anyone's is reached). */
const elsewhere = new WeakMap<BrowserContext, string[]>()
test.afterEach(({ context }) => expect(elsewhere.get(context) ?? []).toEqual([]))

/** The code the synthetic Auth refuses a refresh with, when a check sets one (`serve`). */
const refusedWith = new WeakMap<BrowserContext, string>()

/** Whose session the synthetic Auth renews on a refresh, when a check says (`serve`): a new access token each time. */
const renewing = new WeakMap<BrowserContext, Person>()

/**
 * The synthetic Auth service, and an API that answers nothing (the checks need none of its reads). `logout` waits for
 * `release` when given one, and answers `logoutStatus` (a 503: the service unavailable); a refresh is refused as Auth
 * refuses one (API 2024-01-01: a 400 whose body names the cause), a refresh token it no longer knows (every device
 * signed out elsewhere) unless the check set another code (`refusedWith`), or renewed when the check says whose
 * (`renewing`); every call to the Auth service is counted.
 */
async function serve(context: BrowserContext, logout?: Promise<void>, logoutStatus = 204) {
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
      if (logoutStatus !== 204)
        return route.fulfill({ status: logoutStatus, json: { code: logoutStatus, msg: 'Synthetic Auth: unavailable' } })
      return route.fulfill({ status: 204 })
    }
    const renewed = renewing.get(context)
    if (pathname.endsWith('/auth/v1/token') && renewed) {
      const fresh = session(renewed)
      const token = fresh.access_token.replace(/synthetic$/u, `renewed-${String(calls.length)}`)
      return route.fulfill({ json: { ...fresh, access_token: token } })
    }
    if (pathname.endsWith('/auth/v1/token')) {
      const code = refusedWith.get(context) ?? 'refresh_token_not_found'
      const refused = { code, message: `Invalid Refresh Token (synthetic Auth: ${code})` }
      return route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01' }, json: refused })
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

/** A tab whose kept Supabase session is `kept`, and whose session storage holds `held`, before the app first loads. */
async function keptTab(context: BrowserContext, kept: ReturnType<typeof session>, held: Record<string, string>) {
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(
    ([key, signedIn, items]) => {
      localStorage.setItem(key, JSON.stringify(signedIn))
      for (const [k, v] of Object.entries(items)) sessionStorage.setItem(k, v)
    },
    [SESSION_KEY, kept, held] as const,
  )
  return page
}

/** A tab whose Supabase session is `person`'s, and whose session storage holds `held`, before the app first loads. */
const signedInTab = (context: BrowserContext, person: Person, held: Record<string, string> = HELD) =>
  keptTab(context, session(person), held)

const account = (page: Page) => page.getByRole('button', { name: 'Account' }).first()

/**
 * Another tab of this browser, as Supabase's client there tells this one: another account in, or nobody; `event`
 * USER_UPDATED, the same account changed there (its address).
 */
async function anotherTab(
  context: BrowserContext,
  now: ReturnType<typeof session> | null,
  event = now ? 'SIGNED_IN' : 'SIGNED_OUT',
) {
  const other = await context.newPage()
  await other.goto(`${APP}/favicon.svg`)
  await other.evaluate(
    ([key, signedIn, said]) => {
      if (signedIn) localStorage.setItem(key, JSON.stringify(signedIn))
      else localStorage.removeItem(key)
      // A BroadcastChannel's message has no target origin: the channel is this origin's alone.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      new BroadcastChannel(key).postMessage({ event: said, session: signedIn })
    },
    [SESSION_KEY, now, event] as const,
  )
  await other.close()
}

/**
 * Who the app says is in: the address its account menu heads with, read by a poll (`expect.poll`). Each read is bounded
 * and closes the menu again: an identity that changes while the menu is open closes it, and the poll reads again.
 */
async function signedInAs(page: Page) {
  const head = page.locator('.menu-head')
  try {
    await account(page).click({ timeout: 1000 })
    // The head's name line: the picture's initial and how they signed in sit beside it (account-menu.md).
    return (await head.locator('.account-name').textContent({ timeout: 1000 })) ?? ''
  } catch {
    return ''
  } finally {
    if (await head.count()) await page.keyboard.press('Escape')
    await expect(head).toHaveCount(0)
  }
}

/** Each proposal the fixture's service was sent (`work=lost`), with its key and its body. */
const sentTo = (page: Page) => page.evaluate(() => window.appFixture?.proposals ?? [])
/** The API requests the app made (`work=lost`), as `METHOD /path by <subject>`, and those it did not expect. */
const askedOf = (page: Page) => page.evaluate(() => window.appFixture?.asked ?? [])
const unexpectedOf = (page: Page) => page.evaluate(() => window.appFixture?.unexpected)

/** Davide on Tasks (`work=lost`), with a proposal sent and its reply lost: K1, kept, its form still open. */
async function lostOnTasks(context: BrowserContext) {
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/p/${WORK_PROJECT}/work?work=lost`)
  await page.getByRole('button', { name: 'Review sources' }).first().click()
  const form = page.getByRole('form', { name: 'Review sources' })
  await form.getByRole('checkbox', { name: 'Press plan v2' }).check()
  await form.getByLabel('Purpose (optional)').fill('Check the budgets agree')
  await form.getByRole('button', { name: 'Propose review' }).click()
  await expect(form.getByRole('alert')).toHaveText(
    'No reply from Sophia. Propose again to check; it is the same proposal.',
  )
  const [first] = await sentTo(page)
  if (!first) throw new Error('the fixture was sent no proposal')
  return { page, form, first }
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

test('codex · 06bf6229 · another account at the viewer’s old address is another account: it keeps none of theirs', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await expect.poll(() => tabHolds(page)).toEqual(only(...DAVIDES, OTHER_PART))
  await anotherTab(context, session(SAME_ADDRESS))
  await expect.poll(() => tabHolds(page)).toEqual(only(OTHER_PART))
  await expect(account(page)).toBeVisible()
})

test('codex · 06bf6229 · the viewer’s account under a new address keeps its unanswered proposal: the same one after a reload', async ({
  context,
}) => {
  await serve(context)
  const { page, form, first } = await lostOnTasks(context)
  const purpose = form.getByLabel('Purpose (optional)')
  expect(first.body).toMatchObject({ goalId: WORK_GOAL, purpose: 'Check the budgets agree', allowanceUsd: 0.5 })
  const k1 = keyOf(DAVIDE, WORK_PROJECT, WORK_GOAL)
  const keptAsSent = () => ({ [k1]: { key: first.key, request: first.body }, [OTHER_PART]: {} })
  const parsed = async () =>
    Object.fromEntries(Object.entries(await tabHolds(page)).map(([k, v]) => [k, JSON.parse(v) as unknown]))
  expect(await parsed()).toEqual(keptAsSent())
  await expect.poll(() => signedInAs(page)).toBe(DAVIDE.email)

  // Davide changes his address, in another tab: Supabase's client there tells this one, the same account updated.
  await anotherTab(context, session(RENAMED), 'USER_UPDATED')
  await expect.poll(() => signedInAs(page)).toBe(RENAMED.email)
  expect(await parsed()).toEqual(keptAsSent())
  expect(await unexpectedOf(page)).toEqual([])
  await page.reload()
  await expect(account(page)).toBeVisible()
  await expect.poll(() => signedInAs(page)).toBe(RENAMED.email)
  expect(await parsed()).toEqual(keptAsSent())

  // Under the new address, the form finds the same proposal, frozen, and proposes it again: its key, its request.
  await page.getByRole('button', { name: 'Review sources' }).first().click()
  await expect(form.getByRole('alert')).toHaveText(
    'An earlier proposal may already be recorded. Propose again to check; it is the same proposal, never a second one.',
  )
  await expect(purpose).toHaveValue('Check the budgets agree')
  await expect(purpose).toHaveJSProperty('readOnly', true)
  await expect(form.getByRole('checkbox', { name: 'Press plan v2' })).toBeChecked()
  await expect(form.getByRole('checkbox', { name: 'Launch brief v3' })).toBeDisabled()
  await form.getByRole('button', { name: 'Propose again' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Proposed.' })).toBeVisible()
  const sent = await sentTo(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(first)
  // Answered: nothing is kept.
  await expect.poll(() => tabHolds(page)).toEqual(only(OTHER_PART))
  // Every request the app made, before the reload and after it, was the fixture's to answer.
  expect(await unexpectedOf(page)).toEqual([])
})

test('codex · 1581b4f0 · another account at the same address finds nothing of the viewer’s open proposal: its form, its reads, its key', async ({
  context,
}) => {
  await serve(context)
  const { page, first } = await lostOnTasks(context)
  const asked = askedOf(page)
  const board = `GET /api/v1/projects/${WORK_PROJECT}/plans`
  expect(await asked).toContain(`${board} by ${DAVIDE.id}`)
  expect(await unexpectedOf(page)).toEqual([])

  // Another account, at Davide's address (another subject), comes in from another tab while his form is open.
  await anotherTab(context, session(SAME_ADDRESS))
  await expect.poll(() => tabHolds(page)).toEqual(only(OTHER_PART))
  // Nothing of Davide's stays on the screen: not the form he left open with K1 frozen, nor a way to send it again.
  await expect(page.getByRole('button', { name: 'Propose again' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Review sources' })).toHaveCount(0)
  // Nor what was read for him: the board, and what Sophia offers the viewer (kept fresh for 30 s, under the address
  // both accounts share), are read afresh under the new account's token.
  await expect.poll(() => askedOf(page)).toContain(`${board} by ${SAME_ADDRESS.id}`)
  await expect.poll(() => askedOf(page)).toContain(`${board}/source-review by ${SAME_ADDRESS.id}`)

  // The new account's own proposal is its own: a fresh form, a new key, sent under its token and kept under it.
  await page.getByRole('button', { name: 'Review sources' }).first().click()
  const form = page.getByRole('form', { name: 'Review sources' })
  await expect(form.getByRole('alert')).toHaveCount(0)
  await expect(form.getByLabel('Purpose (optional)')).toHaveValue('')
  await form.getByRole('checkbox', { name: 'Launch brief v3' }).check()
  await form.getByRole('button', { name: 'Propose review' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Proposed.' })).toBeVisible()
  const sent = await sentTo(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]?.key).not.toBe(first.key)
  const proposals = (await askedOf(page)).filter((a) => a.startsWith('POST ') && a.includes('/plans/source-review'))
  expect(proposals).toEqual([
    `POST /api/v1/projects/${WORK_PROJECT}/plans/source-review by ${DAVIDE.id}`,
    `POST /api/v1/projects/${WORK_PROJECT}/plans/source-review by ${SAME_ADDRESS.id}`,
  ])
  await expect.poll(() => tabHolds(page)).toEqual(only(OTHER_PART))
  expect(await unexpectedOf(page)).toEqual([])
})

test('codex · a06db118 · the next account’s first render reads nothing the last one’s cache held', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/p/${WORK_PROJECT}/work?work=lost`)
  // What Sophia offers Davide is read and cached, under the address both accounts share.
  await expect(page.getByRole('button', { name: 'Review sources' }).first()).toBeVisible()
  const offer = `/api/v1/projects/${WORK_PROJECT}/plans/source-review`
  // The next account's own read of it waits, and from now on every "Review sources" the page adds is counted.
  await page.evaluate(
    ([by, path]) => {
      window.appFixture?.hold(by, path)
      window.reviewSourcesAdded = 0
      new MutationObserver((records) => {
        for (const added of records.flatMap((r) => [...r.addedNodes])) {
          const buttons = added instanceof HTMLElement ? [added, ...added.querySelectorAll('button')] : []
          if (buttons.some((b) => b.tagName === 'BUTTON' && b.textContent === 'Review sources')) {
            window.reviewSourcesAdded = (window.reviewSourcesAdded ?? 0) + 1
          }
        }
      }).observe(document, { subtree: true, childList: true })
    },
    [SAME_ADDRESS.id, offer] as const,
  )
  await anotherTab(context, session(SAME_ADDRESS))
  await expect.poll(() => askedOf(page)).toContain(`GET ${offer} by ${SAME_ADDRESS.id}`)
  // Until the next account's own answer comes, nothing offered to Davide was shown to it, not even for a frame.
  expect(await page.evaluate(() => window.reviewSourcesAdded)).toBe(0)
  await expect(page.getByRole('button', { name: 'Review sources' })).toHaveCount(0)
  await page.evaluate(() => window.appFixture?.release())
  await expect(page.getByRole('button', { name: 'Review sources' }).first()).toBeVisible()
  expect(await unexpectedOf(page)).toEqual([])
})

test('sign out · one that fails says so, the person still in; Try again signs out (Codex P2 on #410)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  // The browser's storage refuses to let the session go while the root says so: the sign-out fails, the session stays.
  await page.evaluate((key) => {
    const removeItem = Storage.prototype.removeItem.bind(localStorage)
    Storage.prototype.removeItem = (name: string) => {
      if (name === key && document.documentElement.dataset['refuse'] === 'yes') throw new Error('Storage refused')
      removeItem(name)
    }
    document.documentElement.dataset['refuse'] = 'yes'
  }, SESSION_KEY)
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  const toast = page.locator('.toast')
  await expect(toast).toContainText('Couldn’t sign out: this device is still signed in.')
  await expect(account(page)).toBeVisible()
  await page.evaluate(() => {
    delete document.documentElement.dataset['refuse']
  })
  await toast.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('input[type="email"]')).toBeVisible()
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

test('sign out everywhere · a logout that fails signs out here, and the sign-in says the others may still be in (Codex P1 on #410)', async ({
  context,
}) => {
  const calls = await serve(context, undefined, 503)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('button', { name: 'Sign out of all devices' }).click()
  await settings.getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect.poll(() => calls.filter((c) => c.endsWith('/auth/v1/logout')).length).toBe(1)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.getByText('Your other devices may still be signed in', { exact: false })).toBeVisible()
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

// --- Browser-account stores: viewer state and personal flags key by the account (token subject), not the email. ---

const personalFlagOf = (subject: string, flag: string) => `sophia.personal.${flag}.v1.${subject}`
const viewerKeyOf = (subject: string, project: string) => `sophia.viewer.v1.${subject}.${project}`

/** Press Enter from Home (body focused) to navigate to the last-visited place. */
async function enterFromHome(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.keyboard.press('Enter')
}

test('browser-account · navigating to Work stores the flag under the subject, and Enter restores it after an email change', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  // Navigate to Work via shortcut: Places writes `last = work` under the subject.
  await page.keyboard.press('w')
  await expect(page.locator('div.places[data-place="work"]')).toBeVisible()
  const flagKey = personalFlagOf(DAVIDE.id, 'last')
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), flagKey)).toBe('work')
  // No entry was written under the email (the old bug's key).
  const emailFlagKey = personalFlagOf(DAVIDE.email, 'last')
  expect(await page.evaluate((k) => localStorage.getItem(k), emailFlagKey)).toBeNull()
  // Go Home, then Enter: the app reads the subject flag and goes to Work.
  await page.keyboard.press('h')
  await expect(page.locator('div.places[data-place="home"]')).toBeVisible()
  await enterFromHome(page)
  await expect(page.locator('div.places[data-place="work"]')).toBeVisible()
  // Davide changes address from another tab: USER_UPDATED, same subject.
  await page.keyboard.press('h')
  await expect(page.locator('div.places[data-place="home"]')).toBeVisible()
  await anotherTab(context, session(RENAMED), 'USER_UPDATED')
  await expect.poll(() => signedInAs(page)).toBe(RENAMED.email)
  // Enter still goes to Work: same subject, same stored flag.
  await enterFromHome(page)
  await expect(page.locator('div.places[data-place="work"]')).toBeVisible()
})

test('browser-account · another subject at the same address enters Personal, not the first subject stored Work', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  // Seed: Davide's subject flag says Work; a conflicting legacy email flag also says Work.
  const davideFlagKey = personalFlagOf(DAVIDE.id, 'last')
  const emailFlagKey = personalFlagOf(DAVIDE.email, 'last')
  await page.evaluate(
    ([sk, ek]) => {
      localStorage.setItem(sk, 'work')
      localStorage.setItem(ek, 'work')
    },
    [davideFlagKey, emailFlagKey] as const,
  )
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  // Another account at the same address comes in: a different subject.
  await anotherTab(context, session(SAME_ADDRESS))
  await expect.poll(() => signedInAs(page)).toBe(SAME_ADDRESS.email)
  // Enter from Home: the new account has no flag of its own, so it goes to Personal (default),
  // not Work (which would mean it read Davide's subject flag or the legacy email flag).
  await enterFromHome(page)
  await expect(page.locator('.places[data-place="personal"]')).toBeVisible()
  // Davide's flag is untouched.
  expect(await page.evaluate((k) => localStorage.getItem(k), davideFlagKey)).toBe('work')
})

test('browser-account · a legacy email-keyed flag is not read: Enter goes to Personal, not the legacy Work', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  // A legacy entry keyed by the email says Work; no entry under the subject.
  const legacyFlagKey = personalFlagOf(DAVIDE.email, 'last')
  await page.evaluate((k) => localStorage.setItem(k, 'work'), legacyFlagKey)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  // Enter from Home: the subject has no flag, so the app goes to Personal (default).
  // If the app read the legacy email key, it would go to Work — that is the old bug.
  await enterFromHome(page)
  await expect(page.locator('.places[data-place="personal"]')).toBeVisible()
  // The legacy entry is still on the device, undisturbed but never read.
  expect(await page.evaluate((k) => localStorage.getItem(k), legacyFlagKey)).toBe('work')
})

test('browser-account · viewer-state lens restores under same subject after email change, resets for another subject', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  // Seed: Davide's viewer state has lens=explore for the project.
  const davideViewerKey = viewerKeyOf(DAVIDE.id, WORK_PROJECT)
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [
    davideViewerKey,
    JSON.stringify({ lens: 'explore', drafts: {} }),
  ] as const)
  // Navigate to the project's studio: the lens should restore from the seeded state.
  await page.goto(`${APP}/p/${WORK_PROJECT}/studio?work=lost`)
  await expect(account(page)).toBeVisible()
  await expect(page.locator('#lens-explore[aria-selected="true"]')).toBeVisible()
  // Davide changes address: same subject, the lens stays.
  await anotherTab(context, session(RENAMED), 'USER_UPDATED')
  await expect.poll(() => signedInAs(page)).toBe(RENAMED.email)
  await expect(page.locator('#lens-explore[aria-selected="true"]')).toBeVisible()
  // Another subject at the same address: no seeded viewer state, so the default lens (converse) shows.
  await anotherTab(context, session(SAME_ADDRESS))
  await expect.poll(() => signedInAs(page)).toBe(SAME_ADDRESS.email)
  await expect(page.locator('#lens-converse[aria-selected="true"]')).toBeVisible()
  // Davide's stored viewer state is untouched.
  expect(await page.evaluate((k) => localStorage.getItem(k), davideViewerKey)).toContain('"explore"')
})

test('browser-account · pending Start survives USER_UPDATED: started conversation appears without reload', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/p/${WORK_PROJECT}/conversations?work=lost`)
  const list = page.locator('section[aria-label="All conversations"]')
  await expect(list).toBeVisible()
  // The seeded list has 3 conversations.
  await expect(list.locator('.conv-row')).toHaveCount(3)
  // Hold POST only on the start endpoint (same path as the GET list read; holding both would race).
  const startPath = `/api/v1/projects/${WORK_PROJECT}/conversations`
  await page.evaluate(([by, path]) => window.appFixture?.hold(by, path, 'POST'), [DAVIDE.id, startPath] as const)
  // Open the new conversation form, turn off Ask Sophia (no feed-publishing answer), and start one.
  await page.getByRole('button', { name: 'New conversation' }).click()
  const form = page.getByRole('form', { name: 'New conversation' })
  await form.getByLabel('Ask Sophia').uncheck()
  await form.getByLabel('Question').fill('Which numbers need checking?')
  await form.getByRole('button', { name: 'Start' }).click()
  await expect(form.getByRole('button', { name: 'Starting…' })).toBeVisible()
  // Verify the held POST was actually reached before changing the identity.
  await expect.poll(() => askedOf(page)).toContain(`POST ${startPath} by ${DAVIDE.id}`)
  // While the start is in flight, Davide changes email from another tab.
  await anotherTab(context, session(RENAMED), 'USER_UPDATED')
  await expect.poll(() => signedInAs(page)).toBe(RENAMED.email)
  // Barrier: the rendered list still shows the original 3 conversations (on da769 the changed-email key
  // triggers a refetch that settles here; on the fix the cached data is already in place).
  await expect(list.locator('.conv-row')).toHaveCount(3)
  // Release the held POST: the callback must write to the stable-account cache key, so the started
  // conversation appears in the list without feed event or reload.
  await page.evaluate(() => window.appFixture?.release())
  await expect(list.locator('.conv-row').filter({ hasText: 'Which numbers need checking?' })).toBeVisible()
  expect(await unexpectedOf(page)).toEqual([])
})

test('browser-account · pending Send survives USER_UPDATED: sent message appears without reload', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/p/${WORK_PROJECT}/conversations?work=lost`)
  const list = page.locator('section[aria-label="All conversations"]')
  await expect(list).toBeVisible()
  // Open the first conversation (reading): its newest page has 6 messages.
  const READING = '00000000-0000-4000-8000-0000000000c1'
  await list.locator('.conv-row').first().click()
  await expect(page.locator('.conv-open')).toBeVisible()
  const MESSAGE_COUNT = 6
  await expect(page.locator('.conv-msg')).toHaveCount(MESSAGE_COUNT)
  // Turn off Ask Sophia so no feed-publishing answer is scheduled.
  await page.getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  // Hold POST only on the send endpoint (GET messages uses the same path prefix; holding both would race).
  const sendPath = `/api/v1/conversations/${READING}/messages`
  await page.evaluate(([by, path]) => window.appFixture?.hold(by, path, 'POST'), [DAVIDE.id, sendPath] as const)
  // Type and send a message.
  const field = page.getByLabel('Continue this question with the team')
  await field.fill('Check the March figures')
  await page.keyboard.press('Enter')
  // Verify the held POST was actually reached before changing the identity.
  await expect.poll(() => askedOf(page)).toContain(`POST ${sendPath} by ${DAVIDE.id}`)
  // While the send is in flight, Davide changes email from another tab.
  await anotherTab(context, session(RENAMED), 'USER_UPDATED')
  await expect.poll(() => signedInAs(page)).toBe(RENAMED.email)
  // Barrier: the rendered transcript still shows the original messages (on da769 the changed-email key
  // triggers a refetch that settles here; on the fix the cached data is already in place).
  await expect(page.locator('.conv-msg')).toHaveCount(MESSAGE_COUNT)
  // Release the held POST: the callback must write to the stable-account cache key, so the sent message
  // appears in the thread without feed event or reload.
  await page.evaluate(() => window.appFixture?.release())
  await expect(page.locator('.conv-msg').filter({ hasText: 'Check the March figures' })).toBeVisible()
  expect(await unexpectedOf(page)).toEqual([])
})

test('browser-account · blocked storage does not break navigation or account transitions', async ({ context }) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  // Block getItem/setItem for Sophia per-account prefixes only; the Supabase session stays readable.
  await page.evaluate(() => {
    const real = { getItem: localStorage.getItem.bind(localStorage), setItem: localStorage.setItem.bind(localStorage) }
    localStorage.getItem = (key: string) => {
      if (key.startsWith('sophia.personal.') || key.startsWith('sophia.viewer.'))
        throw new DOMException('blocked', 'SecurityError')
      return real.getItem(key)
    }
    localStorage.setItem = (key: string, value: string) => {
      if (key.startsWith('sophia.personal.') || key.startsWith('sophia.viewer.'))
        throw new DOMException('blocked', 'SecurityError')
      real.setItem(key, value)
    }
  })
  // Navigation still works: the flag is not stored (storage is blocked), but the app does not crash.
  await page.keyboard.press('w')
  await expect(page.locator('.places[data-place="work"]')).toBeVisible()
  // Another account coming in still works.
  await anotherTab(context, session(SAME_ADDRESS))
  await expect.poll(() => signedInAs(page)).toBe(SAME_ADDRESS.email)
})

test('browser-account · at Home the palette and the index know the places’ keys (docs/plans/places-commands.md)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/`)
  await expect(account(page)).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Commands' })
  await expect(palette).toBeVisible()
  const words = (await palette.getByRole('option').allInnerTexts()).join('\n')
  for (const w of ['Home', 'Personal', 'Your projects', 'Your data', 'Lock your space', 'Your notes']) {
    expect(words).toContain(w)
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+/')
  const index = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(index).toBeVisible()
  await expect(index.locator('.keys-list li')).toContainText([/Home\s*H$/, /Personal\s*P$/, /Your projects\s*W$/])
  await expect(index.locator('.keys-list li')).toContainText([
    /Your data\s*D$/,
    /Lock your space\s*L$/,
    /Your notes\s*T$/,
  ])
  await page.keyboard.press('Escape')
  await account(page).click()
  await expect(page.getByRole('menuitem', { name: /Keyboard shortcuts/ })).toBeVisible()
})

test('browser-account · at Home the palette’s veil covers the page, not the bar alone (Codex on #243)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/`)
  await expect(account(page)).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible()
  const veil = await page.locator('.palette-veil').boundingBox()
  const size = page.viewportSize()
  expect(veil?.height).toBe(size?.height)
  expect(veil?.width).toBe(size?.width)
})

/** A project as the list reads it, known by its title. */
const listed = (projectId: string, title: string) => ({
  projectId,
  title,
  role: 'editor',
  members: 3,
  room: null,
  nextSession: null,
  releases: [],
})

/** Seven projects, past the five where Work offers finding one (find-projects.md). */
function seven() {
  const titles = [
    'Copper launch',
    'Fixture project',
    'Another project',
    'Atlas',
    'Beacon',
    'Delta pitch',
    'Ember notes',
  ]
  return titles.map((title, i) =>
    listed(title === 'Fixture project' ? WORK_PROJECT : `00000000-0000-4000-8000-0000000000c${String(i)}`, title),
  )
}

/** The seven as the project list, answered in place of serve()'s unavailable API (a later route wins). */
async function sevenProjects(context: BrowserContext) {
  const projects = seven()
  await context.route(`${APP}/api/v1/projects`, (route) => route.fulfill({ json: { projects, personalEpoch: 1 } }))
}

test('browser-account · past five projects, Work finds one by its title and orders them A–Z (find-projects.md)', async ({
  context,
}) => {
  await serve(context)
  await sevenProjects(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await page.keyboard.press('w')
  const work = page.locator('section[data-place-view="work"]')
  const titles = work.locator('.c3-proj h3')
  const field = work.getByRole('searchbox', { name: 'Find a project' })
  await expect(titles).toHaveCount(7)
  // The list keeps the row that scrolls, under the finder, and the finder keeps the column (Codex on #347).
  await page.setViewportSize({ width: 1280, height: 560 })
  // Polled: the view's entrance moves the column a few pixels until it settles.
  const laid = () =>
    work.evaluate((section) => {
      const box = (s: string) => section.querySelector(s)?.getBoundingClientRect()
      const list = section.querySelector('.c3-projects')
      const [head, find, all] = [box('.c3-head'), box('.c3-find'), section.getBoundingClientRect()]
      return {
        scrolls: !!list && list.scrollHeight > list.clientHeight,
        inside: !!list && list.getBoundingClientRect().bottom <= all.bottom + 1,
        column: !!head && !!find && Math.abs(head.left - find.left) < 1 && Math.abs(head.width - find.width) < 1,
      }
    })
  await expect.poll(laid).toEqual({ scrolls: true, inside: true, column: true })
  await field.fill('copper')
  await expect(titles).toHaveText(['Copper launch'])
  await field.fill('nothing like it')
  // Said to a screen reader too; New project stays, for the project not made yet (Codex on #347).
  await expect(work.getByRole('status')).toContainText('No project is called «nothing like it»')
  await expect(work.getByRole('button', { name: 'New project' })).toBeVisible()
  await work.locator('.c3-none').getByRole('button', { name: 'Clear' }).click()
  await expect(titles).toHaveCount(7)
  await expect(field).toBeFocused()
  await work.getByRole('radio', { name: 'A–Z' }).click()
  await expect(titles).toHaveText([
    'Another project',
    'Atlas',
    'Beacon',
    'Copper launch',
    'Delta pitch',
    'Ember notes',
    'Fixture project',
  ])
})

test('browser-account · ⌘K opens a project by its name (find-projects.md)', async ({ context }) => {
  await serve(context)
  await sevenProjects(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Commands' })
  // Blank, the palette names no project.
  expect((await palette.getByRole('option').allInnerTexts()).join('\n')).not.toContain('Open Fixture project')
  await page.keyboard.type('fixture')
  await expect(palette.getByRole('option').first()).toContainText('Open Fixture project')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(WORK_PROJECT))
})

// The reliability baseline's gap #2 (reliability-retry-5xx-and-write-timeouts.md): what Render's proxy answers while a
// deploy or a cold start runs, a 502 page with no contract body, is asked again by a read. The project list goes through
// the network here (this page fakes no fetch), so the proxy's page is the browser's own reply.
test('reliability · the project list answered twice by a proxy’s 502 page loads by itself, nothing pressed', async ({
  context,
}) => {
  await serve(context)
  const projects = seven()
  let asked = 0
  await context.route(`${APP}/api/v1/projects`, (route) => {
    asked += 1
    if (asked <= 2)
      return route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>',
      })
    return route.fulfill({ json: { projects, personalEpoch: 1 } })
  })
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await page.keyboard.press('w')
  const work = page.locator('section[data-place-view="work"]')
  // TanStack's own waits, 1 s then 2 s, and the list; well before the list's 20 s interval would read it again.
  await expect(work.locator('.c3-proj h3')).toHaveCount(7, { timeout: 8000 })
  await expect(work.getByRole('alert')).toHaveCount(0)
  expect(asked).toBe(3)
})

// Review P2 on the same branch: a gateway timeout may come after the API committed. A new project answered by a 504 page
// is an unknown outcome: the press sends it again under the same Idempotency-Key, so the server records one project.
test('reliability · a new project answered by a proxy’s 504 page is sent again with the same key: one project', async ({
  context,
}) => {
  await serve(context)
  const projects = seven()
  const keys: string[] = []
  const recorded = new Set<string>()
  await context.route(`${APP}/api/v1/projects`, (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fulfill({ json: { projects, personalEpoch: 1 } })
    const key = request.headers()['idempotency-key'] ?? ''
    keys.push(key)
    const first = !recorded.has(key)
    recorded.add(key) // the API commits under the key; a key seen before gets the same project back
    if (keys.length === 1)
      return route.fulfill({
        status: 504,
        contentType: 'text/html',
        body: '<html><head><title>504 Gateway Timeout</title></head><body><h1>Gateway Timeout</h1></body></html>',
      })
    return route.fulfill({ status: first ? 201 : 200, json: { projectId: WORK_PROJECT, cursor: '1' } })
  })
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await page.keyboard.press('w')
  const work = page.locator('section[data-place-view="work"]')
  await expect(work.locator('.c3-proj h3')).toHaveCount(7)
  await work.getByRole('button', { name: 'New project' }).click()
  const form = work.locator('form.c3-newproj')
  await form.getByLabel('Project title').fill('Harbour pilot')
  const start = form.locator('button[type="submit"]')
  await start.click()
  await expect.poll(() => keys.length).toBe(1)
  // The outcome is unknown: the person presses again, and the same intent goes, under its key.
  await expect(start).toBeEnabled()
  await start.click()
  await expect.poll(() => keys.length).toBe(2)
  expect(keys[1]).toBe(keys[0])
  expect(recorded.size).toBe(1)
  await expect(page).toHaveURL(new RegExp(WORK_PROJECT))
})

// The reliability baseline's gap #3 (auth-session-renewal.md): a laptop that wakes past its token's hour asks the API
// before supabase-js has refreshed, and the API answers 401. `expireToken` is that moment: every token the API has seen
// is refused from now on, and the synthetic Auth renews Davide's session when asked. The person is still signed in, so
// the read, the feed and the write go on, after one refresh, and «You’ve been signed out» is never said.

/** The conversation open as the view opens (reading, the first row): its newest page has 6 messages. */
const READING = '00000000-0000-4000-8000-0000000000c1'
/** The second row's (Short or long briefs?), read only once opened: 2 messages. */
const BRIEFS = '00000000-0000-4000-8000-0000000000c2'

/** Davide on `view` of the project (`work=lost`), his session renewed when the app asks; the Auth service's calls. */
async function renewableIn(context: BrowserContext, view: string) {
  renewing.set(context, DAVIDE)
  const calls = await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await page.goto(`${APP}/p/${WORK_PROJECT}/${view}?work=lost`)
  return { page, calls }
}

/** How many refreshes the app asked the synthetic Auth for. */
const refreshes = (calls: readonly string[]) => calls.filter((c) => c === 'POST /synthetic-auth/auth/v1/token').length
const refusedOf = (page: Page) => page.evaluate(() => [...(window.appFixture?.refused ?? [])])
const keysOf = (page: Page) => page.evaluate(() => [...(window.appFixture?.keys ?? [])])
const signedOutNotice = (page: Page) => page.getByRole('heading', { name: 'You’ve been signed out' })
const pill = (page: Page) => page.locator('.topbar .connection')

const rows = (page: Page) => page.locator('section[aria-label="All conversations"] .conv-row')

/** The conversations' list read, and the first one open with its 6 messages: every read the view opens with is in. */
async function readingOpen(page: Page) {
  await expect(rows(page)).toHaveCount(3)
  await expect(page.locator('.conv-open')).toBeVisible()
  await expect(page.locator('.conv-msg')).toHaveCount(6)
}

/**
 * The page has asked the API nothing for a second: a project event's refresh (the snapshot, the archived list) is in,
 * so the request the check makes next is the one that meets an expired token, not a refresh that renewed it before.
 */
async function quiet(page: Page) {
  let last = -1
  await expect
    .poll(
      async () => {
        const now = (await askedOf(page)).length
        const still = now === last
        last = now
        return still
      },
      { intervals: [1000] },
    )
    .toBe(true)
}

test('session · a conversation opened after the token expired shows its messages: one refresh, asked again (gap #3)', async ({
  context,
}) => {
  const { page, calls } = await renewableIn(context, 'conversations')
  await readingOpen(page)
  await quiet(page)
  await page.evaluate(() => window.appFixture?.expireToken())
  await rows(page).nth(1).click()
  await expect(page.locator('.conv-msg').filter({ hasText: 'One page. Anything longer, nobody reads.' })).toBeVisible()
  await expect(page.locator('.conv-msg')).toHaveCount(2)
  expect(await refusedOf(page)).toContain(`GET /api/v1/projects/${WORK_PROJECT}/conversations/${BRIEFS}/messages`)
  expect(refreshes(calls)).toBe(1)
  await expect(signedOutNotice(page)).toHaveCount(0)
  expect(await unexpectedOf(page)).toEqual([])
})

/**
 * Another tab of this browser signs in as `person` and keeps the session where every tab reads it, and its word hasn't
 * reached this tab yet (no BroadcastChannel message): supabase-js here reads that session on its next look.
 */
async function storedByAnotherTab(context: BrowserContext, person: Person) {
  const other = await context.newPage()
  await other.goto(`${APP}/favicon.svg`)
  await other.evaluate(([key, kept]) => localStorage.setItem(key, JSON.stringify(kept)), [
    SESSION_KEY,
    session(person),
  ] as const)
  await other.close()
}

// Independent review, P1: the session a renewal reads is the storage every tab shares. Another tab signed in as Luis,
// not yet heard here, must never lend his token to Davide's refused read: no request goes out as Luis, and the read
// fails as it did before renewals.
test('session · another account signed in by another tab, not yet heard here: Davide’s refused read is never sent as them (review P1)', async ({
  context,
}) => {
  const { page, calls } = await renewableIn(context, 'conversations')
  await readingOpen(page)
  await quiet(page)
  await storedByAnotherTab(context, LUIS)
  await page.evaluate(() => window.appFixture?.expireToken())
  await rows(page).nth(1).click()
  const briefs = `GET /api/v1/projects/${WORK_PROJECT}/conversations/${BRIEFS}/messages`
  await expect.poll(() => refusedOf(page)).toContain(briefs)
  const cannotRead = page.getByText('This conversation can’t be read now.')
  await expect(cannotRead.or(page.locator('.conv-msg').filter({ hasText: 'One page.' }))).toBeVisible()
  expect((await askedOf(page)).filter((a) => a.endsWith(` by ${LUIS.id}`))).toEqual([])
  await expect(cannotRead).toBeVisible()
  expect(refreshes(calls)).toBe(0)
})

test('session · the feed dropped after the token expired comes back up to date, never «signed out» (gap #3)', async ({
  context,
}) => {
  const { page, calls } = await renewableIn(context, 'studio')
  await expect(pill(page)).toHaveAttribute('data-state', 'live')
  const stream = `GET /api/v1/projects/${WORK_PROJECT}/events by ${DAVIDE.id}`
  const streamAsks = async () => (await askedOf(page)).filter((a) => a === stream).length
  const before = await streamAsks()
  await page.evaluate(() => {
    window.appFixture?.expireToken()
    window.appFixture?.dropStream()
  })
  // The feed asked for its stream again, and the expired token was met: by the stream, or by the snapshot's read when
  // that asks first (a busy machine). What the project settles on is «Up to date» or the closed door.
  await expect.poll(streamAsks).toBeGreaterThan(before)
  await expect.poll(async () => (await refusedOf(page)).length).toBeGreaterThan(0)
  await expect(signedOutNotice(page).or(page.locator('.topbar .connection[data-state="live"]'))).toBeVisible()
  await expect(signedOutNotice(page)).toHaveCount(0)
  await expect(pill(page)).toHaveAttribute('data-state', 'live')
  expect(refreshes(calls)).toBe(1)
  expect(await unexpectedOf(page)).toEqual([])
})

test('session · a message sent after the token expired goes again with its key and appears: one refresh (gap #3)', async ({
  context,
}) => {
  const { page, calls } = await renewableIn(context, 'conversations')
  await readingOpen(page)
  // No Sophia's answer, which would publish to the feed.
  await page.getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await quiet(page)
  await page.evaluate(() => window.appFixture?.expireToken())
  await page.getByLabel('Continue this question with the team').fill('Check the March figures')
  await page.keyboard.press('Enter')
  await expect(page.locator('.conv-msg').filter({ hasText: 'Check the March figures' })).toBeVisible()
  const sendPath = `/api/v1/conversations/${READING}/messages`
  expect(await refusedOf(page)).toContain(`POST ${sendPath}`)
  const sent = (await keysOf(page)).filter((k) => k.startsWith(`POST ${sendPath} `))
  expect(sent).toHaveLength(2)
  expect(sent[1]).toBe(sent[0])
  expect(refreshes(calls)).toBe(1)
  expect(await unexpectedOf(page)).toEqual([])
})

test('session · an API that refuses every token: one refresh, then the door closes as today, and nothing loops (gap #3)', async ({
  context,
}) => {
  const { page, calls } = await renewableIn(context, 'studio')
  await expect(pill(page)).toHaveAttribute('data-state', 'live')
  await page.evaluate(() => {
    window.appFixture?.refuseTokens()
    window.appFixture?.dropStream()
  })
  await expect(signedOutNotice(page)).toBeVisible()
  await expect.poll(() => refreshes(calls)).toBe(1)
  // Nothing asks again: the feed's restart on the renewed token ends at the same door. Time is the only witness; the
  // stream's asks are counted, not every read (a list's own interval may ask meanwhile).
  const streamAsks = async () => (await refusedOf(page)).filter((r) => r.endsWith('/events')).length
  const settled = await streamAsks()
  await page.waitForTimeout(3000)
  expect(await streamAsks()).toBe(settled)
  expect(refreshes(calls)).toBe(1)
})

// The reliability measure's M7 (docs/plans/silent-views.md): Updates' «Since you last looked» answered twice by
// a proxy's 503 page comes back by itself, as the other reads do. `work=lost` answers the app's reads in the page, so
// the measuring suite's probe (e2e/reliability/measure.ts) answers the first two «since» reads before it.
test('reliability · «Since you last looked» answered twice by a proxy’s 503 page comes back by itself, nothing pressed', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, { [OTHER_PART]: '{}' })
  await withProbe(page, [{ pattern: '/since$', answer: 'html503', times: 2 }])
  await page.goto(`${APP}/p/${WORK_PROJECT}/updates?work=lost`)
  const since = page.locator('section[aria-labelledby="since-title"]')
  await expect.poll(() => page.evaluate(() => window.reliability?.hits.length ?? 0)).toBe(2)
  // TanStack's own waits, 1 s then 2 s, and the window; no Try again pressed.
  await expect(since.locator('.sheet-lead:not([role])')).toBeVisible({ timeout: 8000 })
  await expect(since.getByRole('alert')).toHaveCount(0)
  await expect(since).not.toContainText('This may be out of date.')
})

// --- A message sent with no reply, kept in the tab across a reload (docs/plans/reliability-held-on-reload.md). ---

const HELD_PREFIX = 'sophia.held.v1:'
/** The first conversation `work=lost` serves (reading): its newest page has six messages. */
const READING_TALK = '00000000-0000-4000-8000-0000000000c1'
const heldKeyOf = (person: Person, kind: 'talk' | 'room', project: string) =>
  `${HELD_PREFIX}${JSON.stringify([person.id, kind, project])}`
/** Davide's message to the reading conversation, sent with no reply, as the tab keeps it: its key and its words. */
const DAVIDE_TALK = heldKeyOf(DAVIDE, 'talk', WORK_PROJECT)
const DAVIDE_HELD = JSON.stringify({
  [READING_TALK]: {
    key: '6f1c7d3e-0b5a-4c2e-9d8f-00000000d0c1',
    ask: { text: 'Check the March figures', askSophia: false },
  },
})
/** Luis's message to the room, held in this tab before Davide came in. */
const LUIS_ROOM = heldKeyOf(LUIS, 'room', WORK_PROJECT)
const LUIS_HELD = JSON.stringify({ key: '6f1c7d3e-0b5a-4c2e-9d8f-00000000e0c1', text: 'Luis was here', replyTo: null })

/** What the tab keeps of held writes, and the other part's entry. */
const heldInTab = (page: Page) =>
  page.evaluate(
    ([prefix, other]) =>
      Object.fromEntries(
        Object.entries(sessionStorage).filter(([k]) => k.startsWith(prefix ?? '') || k === other),
      ) as Record<string, string>,
    [HELD_PREFIX, OTHER_PART],
  )

test('reliability · a message held with no reply is offered again as the page loads, and Sign out forgets it (baseline gap #8)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE, {
    [DAVIDE_TALK]: DAVIDE_HELD,
    [LUIS_ROOM]: LUIS_HELD,
    [OTHER_PART]: '{}',
  })
  await page.goto(`${APP}/p/${WORK_PROJECT}/conversations?work=lost`)
  const list = page.locator('section[aria-label="All conversations"]')
  await list.locator('.conv-row').first().click()
  const open = page.locator('.conv-open')
  // Finding out who is in forgot nothing of Davide's: his message is offered again, its words; Luis's went.
  await expect(open).toContainText('Not confirmed: “Check the March figures”')
  await expect.poll(() => heldInTab(page)).toEqual({ [DAVIDE_TALK]: DAVIDE_HELD, [OTHER_PART]: '{}' })
  await page.reload()
  await list.locator('.conv-row').first().click()
  await expect(open).toContainText('Not confirmed: “Check the March figures”')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  expect(await heldInTab(page)).toEqual({ [OTHER_PART]: '{}' })
  expect(await unexpectedOf(page)).toEqual([])
})

test('legal · a sign-out in another tab forgets the views’ unsent words here too (Codex P1 on #366)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  const key = viewerKeyOf(DAVIDE.id, WORK_PROJECT)
  await page.evaluate(
    (k) => localStorage.setItem(k, JSON.stringify({ lens: 'build', drafts: { build: 'secret plan' } })),
    key,
  )
  await anotherTab(context, null)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as unknown, key))
    .toEqual({ lens: 'build', drafts: {} })
})

// --- Signed out by a cause this tab did not start: the sign-in says so, once (docs/plans/signed-out-elsewhere.md). ---

const ENDED_ELSEWHERE = 'You were signed out in another tab or on another device, so this tab signed out too.'
const ENDED_REFUSED = 'Your sign-in on this device ended, so this tab signed out.'
const ENDED_AWAY = 'Your sign-in on this device ended while you were away.'
const WORDS_CLEARED = 'Unsent words here were cleared.'
/** A first visit's line under the title, which the sign-in says when nothing else happened. */
const LEDE = 'Where your team and Sophia think together.'
const emailField = (page: Page) => page.locator('#email')

test('seam · signed out in another tab: the sign-in says so politely, once, and the email field keeps the focus', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await anotherTab(context, null)
  await expect(emailField(page)).toBeVisible()
  // A status in the lede's place, not the form's alert; no unsent words were kept here, so it says none went.
  await expect(page.getByRole('status')).toHaveText(ENDED_ELSEWHERE)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(LEDE)).toHaveCount(0)
  await expect(emailField(page)).toBeFocused()
  // Said once: after a reload nothing signed this tab out, and the sign-in is a first visit's again.
  await page.reload()
  await expect(emailField(page)).toBeVisible()
  await expect(page.getByText(LEDE)).toBeVisible()
  await expect(page.getByText(ENDED_ELSEWHERE)).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('seam · a sign-in that ended while the page was closed: said once as it loads, with the unsent words that went', async ({
  context,
}) => {
  const calls = await serve(context)
  // Davide's session, kept on this device, expired an hour ago, and the Auth service refuses its refresh.
  const page = await keptTab(context, session(DAVIDE, -3600), { [OTHER_PART]: '{}' })
  const key = viewerKeyOf(DAVIDE.id, WORK_PROJECT)
  await page.evaluate(
    (k) => localStorage.setItem(k, JSON.stringify({ lens: 'build', drafts: { build: 'secret plan' } })),
    key,
  )
  await page.goto(`${APP}/app.html`)
  await expect(emailField(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(`${ENDED_AWAY} ${WORDS_CLEARED}`)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(emailField(page)).toBeFocused()
  expect(calls).toContain('POST /synthetic-auth/auth/v1/token')
  // The words it says went are gone: the view keeps its lens, never its unsent words.
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as unknown, key)).toEqual({
    lens: 'build',
    drafts: {},
  })
  await page.reload()
  await expect(emailField(page)).toBeVisible()
  await expect(page.getByText(LEDE)).toBeVisible()
  await expect(page.getByText(ENDED_AWAY)).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
})

/**
 * In an open tab, the access token runs out: the session kept here as supabase-js finds it then, expired, and the tab
 * shown again, which has the client refresh at once (`visibilitychange`) instead of at its next 30 s tick.
 */
const tokenRunsOut = (page: Page, person: Person) =>
  page.evaluate(
    ([key, kept]) => {
      localStorage.setItem(key, JSON.stringify(kept))
      window.dispatchEvent(new Event('visibilitychange'))
    },
    [SESSION_KEY, session(person, -60)] as const,
  )

test('seam · an open tab’s refresh refused for another cause: its sign-in ended, and no one elsewhere is blamed', async ({
  context,
}) => {
  const calls = await serve(context)
  // A refresh token used twice: an earlier refresh's answer was lost on the way, and the client tried the old token.
  refusedWith.set(context, 'refresh_token_already_used')
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await tokenRunsOut(page, DAVIDE)
  await expect(emailField(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(ENDED_REFUSED)
  await expect(page.getByText(ENDED_ELSEWHERE)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(emailField(page)).toBeFocused()
  expect(calls).toContain('POST /synthetic-auth/auth/v1/token')
})

test('seam · every device signed out elsewhere: an open tab’s refused refresh says it was signed out elsewhere', async ({
  context,
}) => {
  // The Auth service no longer knows the refresh token: «Sign out of all devices» ran on another device.
  const calls = await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await expect(account(page)).toBeVisible()
  await tokenRunsOut(page, DAVIDE)
  await expect(emailField(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(ENDED_ELSEWHERE)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(emailField(page)).toBeFocused()
  expect(calls).toContain('POST /synthetic-auth/auth/v1/token')
})

test('seam · this tab’s own Sign out says nothing of it: the sign-in is a first visit’s (control)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/app.html`)
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(emailField(page)).toBeVisible()
  await expect(page.getByText(LEDE)).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('legal · /terms and /privacy keep their address and their page, signed out or in (Codex P1 on #366)', async ({
  context,
}) => {
  await serve(context)
  const out = await context.newPage()
  await out.goto(`${APP}/terms`)
  await expect(out.getByRole('heading', { level: 1 })).toHaveText('Terms of use')
  await out.waitForTimeout(1500)
  expect(new URL(out.url()).pathname).toBe('/terms')
  await expect(out.getByRole('heading', { level: 1 })).toHaveText('Terms of use')
  const signedIn = await signedInTab(context, DAVIDE)
  await signedIn.goto(`${APP}/privacy`)
  await expect(signedIn.getByRole('heading', { level: 1 })).toHaveText('Privacy notice')
  await signedIn.waitForTimeout(1500)
  expect(new URL(signedIn.url()).pathname).toBe('/privacy')
  await expect(signedIn.getByRole('heading', { level: 1 })).toHaveText('Privacy notice')
})

/** What the join page says back from a sign-in link opened in a browser that never asked for it. */
const OTHER_BROWSER_LINE =
  'This sign-in link opened in a different browser from the one you started in. Type the email’s code there, or open your invitation link again here.'

test('join · a sign-in link opened in another browser says where to finish, once (join-other-browser.md)', async ({
  context,
}) => {
  const calls = await serve(context)
  const page = await context.newPage()
  // The sign-in email's link, in a browser that holds no invitation token and never asked for the link.
  await page.goto(`${APP}/join?code=synthetic-code`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You started in another browser')
  await expect(page.getByText(OTHER_BROWSER_LINE)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to Sophia' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This door is closed' })).toHaveCount(0)
  await expect(page.getByText('This link is incomplete', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  // Nothing was exchanged or asked: this browser holds no sign-in of its own to finish.
  expect(calls).toEqual([])
  // The code has left the address, so a reload is an ordinary visit: said once per link opened.
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/join')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This door is closed')
  await expect(page.getByText(OTHER_BROWSER_LINE)).toHaveCount(0)
})

test('join · with no invitation token and no sign-in’s return, the page keeps its closed door (join-other-browser.md)', async ({
  context,
}) => {
  await serve(context)
  const page = await context.newPage()
  await page.goto(`${APP}/join`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This door is closed')
  await expect(page.getByText('This link is incomplete. Ask for the whole link, or a new one.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to Sophia' })).toBeVisible()
  await expect(page.getByText(OTHER_BROWSER_LINE)).toHaveCount(0)
})

test('feedback · opened from Home during a call, the call’s switches stay in reach (Codex P1 on #367)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/p/${WORK_PROJECT}/studio?work=lost&sentry=1`)
  await page
    .getByRole('navigation', { name: 'Room controls' })
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await page.keyboard.press('h')
  await expect(page.locator('div.places[data-place="home"]')).toBeVisible()
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  const sheet = page.getByRole('dialog', { name: 'Send feedback' })
  await expect(
    sheet.getByRole('group', { name: 'Your call' }).getByRole('button', { name: 'Leave the room' }),
  ).toBeVisible()
})

test('places · in the bar’s call, Leave is rose at rest and its plane answers the pointer (room-dock-people.md)', async ({
  context,
}) => {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/p/${WORK_PROJECT}/studio?work=lost`)
  await page
    .getByRole('navigation', { name: 'Room controls' })
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await page.keyboard.press('h')
  const out = page.locator('.places .room-pill').getByRole('button', { name: 'Leave the room' })
  await expect(out).toBeVisible()
  await page.mouse.move(0, 0)
  const rest = await out.evaluate((b) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--rose)'
    document.body.append(probe)
    const rose = getComputedStyle(probe).color
    probe.remove()
    return { color: getComputedStyle(b).color, plane: getComputedStyle(b).backgroundColor, rose }
  })
  // The bar keeps its squares bare at rest: the rose ink alone says the way out.
  expect(rest.color).toBe(rest.rose)
  expect(rest.plane).toBe('rgba(0, 0, 0, 0)')
  await out.hover()
  await expect(out).not.toHaveCSS('background-color', rest.plane)
})

/** `projects=two`'s second project (fixtures/app.tsx): listed after the fixture project, and read as it is. */
const SECOND_PROJECT = '00000000-0000-4000-8000-00000000009a'

/** In the fixture project's call, then Home: the call follows in the places' bar. */
async function inCallAtHome(context: BrowserContext) {
  await serve(context)
  const page = await signedInTab(context, DAVIDE)
  await page.goto(`${APP}/p/${WORK_PROJECT}/studio?work=lost&projects=two`)
  await page
    .getByRole('navigation', { name: 'Room controls' })
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  await page.keyboard.press('h')
  await expect(page.locator('.places .room-pill')).toBeVisible()
  return page
}

/** From the places, ⌘K «Open <title>»; its project is on screen once any call before it has gone. */
async function openFromPlaces(page: Page, title: string, projectId: string) {
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Commands' })
  await expect(palette).toBeVisible()
  await page.keyboard.type(title.toLowerCase())
  await expect(palette.getByRole('option').first()).toContainText(`Open ${title}`)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/p/${projectId}`))
  await expect(page.locator('h1.project-name:visible')).toContainText(title)
}

const openResearchNotes = (page: Page) => openFromPlaces(page, 'Research notes', SECOND_PROJECT)

const shownToast = (page: Page) => page.locator('.toast[data-shown]')

test('places · opening another project in a call says it ended the call, with Rejoin back into it (call-ends-on-open.md)', async ({
  context,
}) => {
  const page = await inCallAtHome(context)
  await openResearchNotes(page)
  const toast = shownToast(page)
  await expect(toast).toHaveAttribute('role', 'status')
  await expect(toast).toContainText('Your call in “Fixture project” ended when you opened “Research notes”.')
  const rejoin = toast.getByRole('button', { name: 'Rejoin' })
  await expect(rejoin).toBeVisible()
  // Polite: the line never takes the focus.
  await expect(rejoin).not.toBeFocused()
  await rejoin.click()
  await expect(page).toHaveURL(new RegExp(`/p/${WORK_PROJECT}`))
  await expect(
    page.getByRole('navigation', { name: 'Room controls' }).getByRole('button', { name: 'Leave the room' }),
  ).toBeVisible()
  // Each hang-up is its own: left the same way again, it is said again.
  await page.keyboard.press('h')
  await expect(page.locator('.places .room-pill')).toBeVisible()
  await openResearchNotes(page)
  await expect(toast).toContainText('ended when you opened “Research notes”.')
  await toast.getByRole('button', { name: 'Rejoin' }).click()
  await expect(
    page.getByRole('navigation', { name: 'Room controls' }).getByRole('button', { name: 'Leave the room' }),
  ).toBeVisible()
  // Each end forgets its cause: a Leave pressed after is said as a Leave, with nothing to press (from Home, where the
  // room is out of sight and the toast says it).
  await page.keyboard.press('h')
  await page.locator('.places .room-pill').getByRole('button', { name: 'Leave the room' }).click()
  await expect(toast).toContainText('You left Fixture project.')
  await expect(toast.getByRole('button')).toHaveCount(0)
})

test('places · Leave pressed in the bar keeps «You left …», with nothing to press (call-ends-on-open.md)', async ({
  context,
}) => {
  const page = await inCallAtHome(context)
  await page.locator('.places .room-pill').getByRole('button', { name: 'Leave the room' }).click()
  const toast = shownToast(page)
  await expect(toast).toContainText('You left Fixture project.')
  await expect(toast.getByRole('button')).toHaveCount(0)
  // With no call left, opening another project ends nothing, so nothing is said of it.
  await openResearchNotes(page)
  await expect(page.locator('.toast')).not.toContainText('ended when you opened')
})

test('places · ⌘K pressed as Leave in the bar ends the call keeps its typing in the palette (call-ends-on-open.md)', async ({
  context,
}) => {
  const page = await inCallAtHome(context)
  await page.locator('.places .room-pill').getByRole('button', { name: 'Leave the room' }).click()
  // The palette opens while the call is still ending: the pill's going must not take the focus from its field.
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Commands' })
  await expect(palette).toBeVisible()
  await expect(page.locator('.places .room-pill')).toHaveCount(0)
  await page.keyboard.type('research notes')
  await expect(palette.getByRole('option').first()).toContainText('Open Research notes')
})

/** The room tokens the fixture project's room asked for: one for each join. */
const roomTokens = async (page: Page) =>
  (await askedOf(page)).filter((a) => a === `POST /api/v1/projects/${WORK_PROJECT}/room-token by ${DAVIDE.id}`).length

test('places · Rejoin pressed once back in that call by its own Join joins nothing later: Leave stays out (call-ends-on-open.md)', async ({
  context,
}) => {
  const page = await inCallAtHome(context)
  await openResearchNotes(page)
  const rejoin = shownToast(page).getByRole('button', { name: 'Rejoin' })
  await expect(rejoin).toBeVisible()
  // Back in the fixture project's call by the dock's own Join, while the line still offers Rejoin (it shows for 8 s).
  await page.keyboard.press('h')
  await openFromPlaces(page, 'Fixture project', WORK_PROJECT)
  const dock = page.getByRole('navigation', { name: 'Room controls' })
  await dock.getByRole('button', { name: /^Join the room/ }).click()
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await rejoin.click()
  const joins = await roomTokens(page)
  await dock.getByRole('button', { name: 'Leave the room' }).click()
  // The call it found answered Rejoin: out of the call, the room asks for no token of its own and stays out.
  await page.waitForTimeout(1500)
  expect(await roomTokens(page)).toBe(joins)
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toHaveCount(0)
})

// A chat message's anchor through a sign-in (Codex P2 on #435): kept on leaving, given back on a refused return.
test('sign-in · a refused return to a project gives back the chat message its link named, kept for the next try', async ({
  context,
}) => {
  await serve(context)
  const path = '/p/00000000-0000-4000-8000-0000000000aa/studio'
  const message = '#message-00000000-0000-4000-8000-0000000000ab' // linkHash(that id, MESSAGE)
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(
    ([at, hash]) => localStorage.setItem('sophia.return-anchor', JSON.stringify({ path: at, hash, at: Date.now() })),
    [path, message] as const,
  )
  await page.goto(`${APP}${path}?error=access_denied`)
  await expect(page.locator('#email')).toBeVisible()
  await expect
    .poll(() => {
      const url = new URL(page.url())
      return `${url.pathname}${url.search}${url.hash}`
    })
    .toBe(`${path}${message}`)
  expect(await page.evaluate(() => localStorage.getItem('sophia.return-anchor'))).toContain(message)
})

/**
 * The shown toast once its rise has ended: its frame, the lines its words take, the page's gutter, the width its own
 * words and press would take on one line, and how far the page scrolls sideways.
 */
async function toastFrame(page: Page) {
  const toast = shownToast(page)
  await expect.poll(() => toast.evaluate((t) => t.getAnimations().length)).toBe(0)
  return toast.evaluate((t) => {
    const box = t.getBoundingClientRect()
    const words = t.querySelector('span')
    const probe = document.createElement('div')
    probe.style.width = 'var(--gutter)'
    const alone = t.cloneNode(true)
    if (!(alone instanceof HTMLElement)) throw new Error('A toast clones as an element')
    alone.style.cssText = 'position: absolute; left: 0; width: max-content; max-width: none; visibility: hidden'
    document.body.append(probe, alone)
    const gutter = probe.getBoundingClientRect().width
    const oneLine = alone.getBoundingClientRect().width
    probe.remove()
    alone.remove()
    return {
      left: box.left,
      right: box.right,
      width: box.width,
      height: box.height,
      foot: box.bottom,
      centre: box.left + box.width / 2,
      lines: words
        ? Math.round(words.getBoundingClientRect().height / parseFloat(getComputedStyle(words).lineHeight))
        : 0,
      gutter,
      oneLine,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

// At 320 px the gutters leave the words 209.1 px beside Rejoin, and the sentence's second half needs 211.4 px: three
// lines there, by the words' own length (toast-phone-width.md).
for (const { width, height, lines } of [
  { width: 390, height: 844, lines: 2 },
  { width: 360, height: 740, lines: 2 },
  { width: 320, height: 640, lines: 3 },
]) {
  test.describe(`at ${String(width)}×${String(height)}`, () => {
    test.use({ viewport: { width, height } })

    test(`toast · on a phone the call-ended line takes the width the gutters leave, centred, ${String(lines)} lines at most (toast-phone-width.md)`, async ({
      context,
    }) => {
      const page = await inCallAtHome(context)
      await openResearchNotes(page)
      await expect(shownToast(page).getByRole('button', { name: 'Rejoin' })).toBeVisible()
      const at = await toastFrame(page)
      expect(at.lines).toBeLessThanOrEqual(lines)
      // Its line is longer than the screen is wide: the toast is as wide as its max-width, inside the gutters.
      expect(at.width).toBeCloseTo(width - 2 * at.gutter, 0)
      expect(at.left).toBeGreaterThanOrEqual(at.gutter - 0.5)
      expect(at.right).toBeLessThanOrEqual(width - at.gutter + 0.5)
      expect(Math.abs(at.centre - width / 2)).toBeLessThanOrEqual(1)
      expect(at.sideways).toBe(0)
    })
  })
}

test.describe('at 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('toast · on a computer the toast keeps its frame: its words on one line, centred, its foot above the floor (toast-phone-width.md)', async ({
    context,
  }) => {
    // Measured on main e395d63ea at 1280×800: #466's line 495.6 × 44 px, «You left Fixture project.» 165.7 × 40 px,
    // each centred on 640, their foot at 718 (the floor's 18 px and 64 above the bottom).
    const page = await inCallAtHome(context)
    await openResearchNotes(page)
    const toast = shownToast(page)
    await expect(toast.getByRole('button', { name: 'Rejoin' })).toBeVisible()
    const ended = await toastFrame(page)
    expect(ended.width).toBeCloseTo(ended.oneLine, 0)
    expect(ended.height).toBe(44)
    expect(Math.abs(ended.centre - 640)).toBeLessThanOrEqual(1)
    expect(ended.foot).toBeCloseTo(718, 0)
    await toast.getByRole('button', { name: 'Rejoin' }).click()
    await expect(
      page.getByRole('navigation', { name: 'Room controls' }).getByRole('button', { name: 'Leave the room' }),
    ).toBeVisible()
    await page.keyboard.press('h')
    await page.locator('.places .room-pill').getByRole('button', { name: 'Leave the room' }).click()
    await expect(toast).toContainText('You left Fixture project.')
    const left = await toastFrame(page)
    expect(left.width).toBeCloseTo(left.oneLine, 0)
    expect(left.height).toBe(40)
    expect(Math.abs(left.centre - 640)).toBeLessThanOrEqual(1)
    expect(left.foot).toBeCloseTo(718, 0)
    expect(left.sideways).toBe(0)
  })
})
