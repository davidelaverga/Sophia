// The attention flag served (docs/handoffs/FND-C-ATTENTION-BOUNDARY-attempt-1.md): the Studio app itself
// (fixtures/app.tsx, `work=lost`), built with VITE_SOPHIA_ATTENTION=1 and WITHOUT the vision flag on 5198, and with
// neither on 5199 (vite.attention.config.ts). Signed in by a synthetic Auth service these checks answer, against the
// fixture's API in the page, where Updates' «since» and «seen» are A34's, strict and each account's own
// (`attention=a34`, attention-data.ts). Nothing leaves the app's own server. Every account and word is synthetic.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const ON = 'http://127.0.0.1:5198'
const OFF = 'http://127.0.0.1:5199'
const SESSION_KEY = 'sb-127-auth-token'
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const DAVIDE = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
/** No member of the project: A34 refuses him (attention-data.ts's OUTSIDER). */
const LUIS = { id: '00000000-0000-4000-8000-00000000e001', email: 'luis@sophia.test' }
const OPEN = 'work=lost&attention=a34'
/** What only the vision flag reads: A12's meetings and recaps, A13's search and so-far, A14's focus, A19's origins. */
const VISION_ONLY = /\/meetings|\/recap|\/so-far|\/search|\/focus|\/source-origins/

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A synthetic session, unsigned: only the synthetic Auth service ever sees it, and it signs nothing. */
function session(person: { id: string; email: string }) {
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

/** Every request that left the app's own servers: none may. */
const elsewhere = new WeakMap<BrowserContext, string[]>()

test.beforeEach(async ({ context }) => {
  const left: string[] = []
  elsewhere.set(context, left)
  context.on('request', (request) => {
    const { protocol, origin } = new URL(request.url())
    if (origin !== ON && origin !== OFF && protocol !== 'data:' && protocol !== 'blob:') left.push(request.url())
  })
  await context.route(
    (url) => url.origin !== ON && url.origin !== OFF,
    (route) => route.abort(),
  )
  for (const app of [ON, OFF]) {
    await context.route(`${app}/synthetic-auth/**`, (route) =>
      route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic Auth: nothing here' } }),
    )
  }
})

test.afterEach(async ({ context, page }) => {
  expect(elsewhere.get(context) ?? []).toEqual([])
  expect(await page.evaluate(() => window.appFixture?.unexpected ?? [])).toEqual([])
  // Nothing only the vision flag reads was asked: no meeting, recap or other proposed read.
  expect((await asked(page)).filter((a) => VISION_ONLY.test(a))).toEqual([])
})

/** A tab of `app` whose Supabase session is `person`'s, before the app first loads. */
async function signedIn(context: BrowserContext, app: string, person: { id: string; email: string }) {
  const page = await context.newPage()
  await page.goto(`${app}/favicon.svg`)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify(session(person)),
  ] as const)
  return page
}

const asked = (page: Page) => page.evaluate(() => [...(window.appFixture?.asked ?? [])])
const attention = (page: Page) => page.evaluate(() => [...(window.appFixture?.attention ?? [])])
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' }).getByRole('link')
const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const lines = (page: Page) => since(page).locator('li')
const markSeen = (page: Page) => since(page).getByRole('button', { name: 'Mark as seen' })
/** The view on screen: the nav's current one (an address to a view not shown opens the Studio, the address kept). */
const current = (page: Page) => views(page).and(page.locator('[aria-current="page"]'))

test('attention · Home lists what needs you (A15), read for who is in', async ({ context }) => {
  const page = await signedIn(context, ON, DAVIDE)
  await page.goto(`${ON}/?${OPEN}`)
  const needs = page.getByRole('list', { name: 'Needs you' }).getByRole('button')
  await expect(needs).toHaveCount(4)
  await expect(needs.first()).toContainText('Ship the retry with the hotfix?')
  expect(await asked(page)).toContain(`GET /api/v1/me/needs by ${DAVIDE.id}`)
})

test('attention · Updates is a project view, and the only one the flag adds', async ({ context }) => {
  const page = await signedIn(context, ON, DAVIDE)
  await page.goto(`${ON}/p/${PROJECT}/updates?${OPEN}`)
  await expect(views(page)).toHaveText(['Studio', 'Goals', 'Tasks', 'Knowledge', 'Updates'])
  await expect(page.getByRole('heading', { name: 'Updates', level: 2 })).toBeVisible()
  // The meetings and their recaps are the vision flag's: neither shown nor read.
  await expect(page.getByRole('heading', { name: 'Meetings' })).toHaveCount(0)
  await expect(since(page)).toBeVisible()
  await expect(current(page)).toHaveText('Updates')
  // Conversations' address opens the project's Studio, as without the flag.
  await page.goto(`${ON}/p/${PROJECT}/conversations?${OPEN}`)
  await expect(current(page)).toHaveText('Studio')
  await expect(page.getByRole('heading', { name: 'Updates', level: 2 })).toHaveCount(0)
})

test('attention · a window naming nobody, with no moment and more after it, is said as it is; seen reads on', async ({
  context,
}) => {
  const page = await signedIn(context, ON, DAVIDE)
  await page.goto(`${ON}/p/${PROJECT}/updates?${OPEN}`)
  await expect(since(page)).toContainText(
    'You haven’t looked before. This is only the first part: mark it as seen to read on.',
  )
  await expect(lines(page)).toHaveCount(3)
  // Nobody named and no moment: no «by» at all, never «a member», never a date.
  await expect(lines(page).filter({ hasText: 'Ship on Friday' }).locator('.recap-by')).toHaveText('')
  await expect(lines(page).filter({ hasText: 'Keep the retry' }).locator('.recap-by')).toHaveText(
    /^decided by Marco · /,
  )
  await expect(lines(page).filter({ hasText: 'Launch notes · v2' }).locator('.recap-by')).toHaveText('')
  await expect(since(page)).not.toContainText('a member')
  await expect(since(page)).not.toContainText('proposed by')
  await expect(since(page)).not.toContainText('everything so far')

  // Mark as seen writes the window's own bound, and the next window is read: the rest, with nothing after it.
  await markSeen(page).click()
  await expect(lines(page)).toHaveText([/Move the review to Monday\?/])
  await expect(since(page)).not.toContainText('only the first part')
  await markSeen(page).click()
  await expect(since(page)).toContainText('Nothing new since you last looked.')
  await expect(markSeen(page)).toHaveCount(0)
  // Each mark the bound of the window shown, in turn; every read Davide's own (the feed moving reads again).
  const said = await attention(page)
  expect(said.filter((s) => s.startsWith('seen'))).toEqual([`seen 12 by ${DAVIDE.id}`, `seen 15 by ${DAVIDE.id}`])
  expect(said.filter((s) => !s.endsWith(`by ${DAVIDE.id}`))).toEqual([])
  expect(said.at(-1)).toBe(`since by ${DAVIDE.id}`)
})

test('attention · another account coming in reads its own: refused, and nothing of the last one', async ({
  context,
}) => {
  const page = await signedIn(context, ON, DAVIDE)
  await page.goto(`${ON}/p/${PROJECT}/updates?${OPEN}`)
  await expect(lines(page).filter({ hasText: 'Ship on Friday' })).toHaveCount(1)
  // Luis signs in in another tab of this browser: this one follows (Supabase's own channel).
  const other = await context.newPage()
  await other.goto(`${ON}/favicon.svg`)
  await other.evaluate(
    ([key, signedInNow]) => {
      localStorage.setItem(key, JSON.stringify(signedInNow))
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      new BroadcastChannel(key).postMessage({ event: 'SIGNED_IN', session: signedInNow })
    },
    [SESSION_KEY, session(LUIS)] as const,
  )
  await other.close()
  await expect(since(page).getByRole('alert')).toContainText('What changed couldn’t be read.')
  await expect(page.getByText('Ship on Friday')).toHaveCount(0)
  await expect(markSeen(page)).toHaveCount(0)
  const reads = (await asked(page)).filter((a) => a.startsWith(`GET /api/v1/projects/${PROJECT}/since`))
  expect(reads.at(-1)).toBe(`GET /api/v1/projects/${PROJECT}/since by ${LUIS.id}`)
  // Refused, so no window was answered him, and nothing was marked.
  const said = await attention(page)
  expect(said.length).toBeGreaterThan(0)
  expect(said.filter((s) => s !== `since by ${DAVIDE.id}`)).toEqual([])
})

test('attention · off by default: no needs read, no Updates view', async ({ context }) => {
  const page = await signedIn(context, OFF, DAVIDE)
  await page.goto(`${OFF}/?${OPEN}`)
  await expect(page.getByRole('button', { name: 'Account' }).first()).toBeVisible()
  await expect(page.getByRole('list', { name: 'Needs you' })).toHaveCount(0)
  await page.goto(`${OFF}/p/${PROJECT}/updates?${OPEN}`)
  await expect(views(page)).toHaveText(['Studio', 'Goals', 'Tasks', 'Knowledge'])
  await expect(current(page)).toHaveText('Studio')
  await expect(since(page)).toHaveCount(0)
  const read = await asked(page)
  expect(read.filter((a) => a.includes('/me/needs') || a.includes('/since') || a.includes('/seen'))).toEqual([])
})
