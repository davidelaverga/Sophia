// The Studio app itself (fixtures/app.tsx: App, its sign-in and the Supabase client, unchanged), signed in by a
// synthetic Supabase Auth service these checks answer in the page (vite.app.config.ts): what the app keeps on the
// device as who is in changes. Codex's re-review of 6e9e2a9b found every page load forgetting the review proposals kept
// unanswered (review-proposal.ts): App forgot them in an effect's cleanup, which ran as each load went from finding out
// who is in to signed in. The fixture pages, which have no App, could not see it. Codex's automatic review of 06bf6229
// (P2) found them kept by the email, which an account can change: they are its account's, its token's subject. The
// sessions and proposals here are synthetic, for accounts at sophia.test; nothing reaches an Auth service or an API
// (`work=lost` answers the app's reads in the page, fixtures/app.tsx).
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
/** Davide's account under the address it changed to: the same account, its token's subject unchanged. */
const RENAMED: Person = { ...DAVIDE, email: 'davide.new@sophia.test' }
/** Another account at Davide's old address (his deleted, a new one made): another subject, so nothing of his. */
const SAME_ADDRESS: Person = { id: '00000000-0000-4000-8000-00000000d002', email: DAVIDE.email }
/** The project and goal `work=lost` serves (fixtures/data.ts's PROJECT, work-data.ts's goal). */
const WORK_PROJECT = '00000000-0000-4000-8000-0000000000aa'
const WORK_GOAL = '00000000-0000-4000-8000-0000000000b1'

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
      hold: (by: string, path: string, method?: string) => void
      release: () => void
    }
    /** "Review sources" buttons the page added since the check began counting them. */
    reviewSourcesAdded?: number
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
    return (await head.textContent({ timeout: 1000 })) ?? ''
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
