// The signed-in Studio's Resources, from A51's catalog (INC01-DES-002, docs/plans/inc01-resources-service-adapter.md),
// behind its own read flag, VITE_SOPHIA_NATIVE_RESOURCES, off by default. The app itself (fixtures/app.tsx, its own
// synthetic Auth answered here), its project's reads answered in the page (`work=lost`), and the catalog read answered by
// this check in the page, wrapping the page's fetch: synthetic pages, no account, host, tool or service read.
// Every page loads with `vision=off`: the fixture servers set the vision flag, which shows every view; off, the views are
// what production shows (docs/plans/prod-honesty.md), so only the read flag decides Resources.
// Off (the default build, on the checks' own server): no Resources in the project's views and no catalog read at all.
// On: a build of the same app with the flag set, on a server of this check's own (port 5197 for the desktop project and
// 5195 for the phone's, started and stopped here, its variables its own): Resources in the views, read as the signed-in
// account, refused at once on a 404.
// UX iteration 001: the project settled (its reads answered, its call joined through the fixtures' fake LiveKit), the
// call's switches in reach over the sheet, and a final 401's Sign in again, which only a press starts: this device's
// sign-out, the sign-in at the same address, a failure said with the person still in, no row shown again and no call
// joined again. Auth, API, room and devices are all synthetic, answered in the page or by this check.
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const OFF = 'http://127.0.0.1:5198'
/** The flagged build's server, one per project, so the desktop's and the phone's workers never share or stop it. */
const portOf = (project: string) => (project === 'phone' ? 5195 : 5197)
/** The synthetic Auth service the app's build names (vite.app.config.ts), answered here: whichever server serves. */
const AUTH = 'http://127.0.0.1:5198/synthetic-auth'
const SESSION_KEY = 'sb-127-auth-token'
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const DAVIDE = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
const T = '2026-11-12T14:00:00.000Z'

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A synthetic session, unsigned, for Davide: only this check's synthetic Auth ever sees it. */
function session() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const claims = { sub: DAVIDE.id, email: DAVIDE.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.synthetic`,
    refresh_token: `synthetic-refresh-${DAVIDE.id}`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    user: {
      id: DAVIDE.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: DAVIDE.email,
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

/** One synthetic catalog page, Davide's own Codex and a teammate's Claude Code. */
const PAGE = {
  observedAt: T,
  resources: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      tool: 'codex',
      state: 'active',
      owner: { id: DAVIDE.id, label: 'Davide', isYou: true, isMember: true },
      mine: {
        connection: { state: 'linked', expired: false },
        host: { state: 'active', helloOk: true, helloConflict: false, lastSeenAt: T, secondsSinceSeen: 120 },
        recordedQualification: { state: 'none', operations: [], qualifiedAt: null, expiresAt: null },
      },
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      tool: 'claude',
      state: 'active',
      owner: { id: '00000000-0000-4000-8000-00000000e001', label: 'Luis', isYou: false, isMember: true },
      mine: null,
    },
  ],
  nextCursor: null,
  complete: true,
  notReported: ['sessions', 'assignments', 'models', 'efforts', 'capacity', 'readiness', 'signIn', 'accounts'],
}

declare global {
  interface Window {
    catalogAsked?: { path: string; subject: string | null }[]
    /** How the catalog is answered now: a page, a 404 or a 401, each body never ending when refused. */
    catalogMode?: Mode
  }
}

type Mode = 'page' | 'refuse' | 'unauthorized'

/**
 * The page's catalog reads, answered in the page as `mode` says (changed later through `window.catalogMode`); every
 * other request goes to the app's own fetch. The app's fixture installs its fetch layers as it starts, each reading
 * `window.fetch` to call the one under it: each read hands it the layer under it, never itself, so the project's own
 * reads are answered as the fixture answers them and the project settles; only the catalog's path is answered here.
 */
async function answerCatalog(context: BrowserContext, mode: Mode) {
  await context.addInitScript(
    ([body, how]) => {
      const asked: { path: string; subject: string | null }[] = []
      window.catalogAsked = asked
      window.catalogMode = how
      const layers: (typeof fetch)[] = [window.fetch.bind(window)]
      const answer = (url: URL, init?: RequestInit) => {
        const token = new Headers(init?.headers).get('authorization')?.split('.')[1] ?? ''
        let subject: string | null = null
        try {
          const claims: unknown = JSON.parse(atob(token.replaceAll('-', '+').replaceAll('_', '/')))
          const sub: unknown = typeof claims === 'object' && claims !== null ? Reflect.get(claims, 'sub') : null
          subject = typeof sub === 'string' ? sub : null
        } catch {
          subject = null
        }
        asked.push({ path: url.pathname + url.search, subject })
        const now = window.catalogMode ?? 'page'
        if (now !== 'page') {
          const status = now === 'refuse' ? 404 : 401
          return Promise.resolve(new Response(new ReadableStream({ start() {} }), { status }))
        }
        return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      /** The fetch as read at `depth`: the catalog answered, anything else the layer under it. */
      const at =
        (depth: number): typeof fetch =>
        (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
          if (url.pathname.endsWith('/native-resources')) return answer(url, init)
          const under = layers[depth - 1] ?? layers[0]
          return under ? under(input, init) : Promise.reject(new Error('no fetch'))
        }
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        get: () => at(layers.length),
        set: (next: typeof fetch) => {
          layers.push(next)
        },
      })
    },
    [JSON.stringify(PAGE), mode] as const,
  )
}

/**
 * The synthetic Auth service, as this check answers it: a renewal gives Davide's session again (so a refused read is
 * the API's, never a session that ended by itself), a sign-out is answered or refused, anything else is not found.
 * Each sign-out's scope is kept.
 */
async function auth(context: BrowserContext, logoutStatus = 204) {
  const logouts: string[] = []
  await context.route(`${AUTH}/**`, (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/v1/logout')) {
      logouts.push(url.searchParams.get('scope') ?? 'none')
      return route.fulfill({ status: logoutStatus, json: logoutStatus === 204 ? {} : { code: logoutStatus } })
    }
    if (url.pathname.endsWith('/auth/v1/token')) return route.fulfill({ json: session() })
    return route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic' } })
  })
  return logouts
}

/** A tab already signed in as Davide, on `origin`. */
async function signedIn(context: BrowserContext, origin: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`${origin}/favicon.svg`)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify(session()),
  ] as const)
  return page
}

const nav = (page: Page) => page.getByRole('navigation').first()
const account = (page: Page) => page.getByRole('button', { name: 'Account' }).first()
const tiles = (page: Page) => page.locator('.resource-tile')
const leaveRoom = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const SCOPE = 'Saved coding-resource records. Live activity, usage and controls aren’t reported here.'

/** The fixture project opened and settled: its name read, nothing still loading or connecting. */
async function settled(page: Page) {
  await expect(page.locator('h1.project-name:visible')).toContainText('Fixture project', { timeout: 20_000 })
  await expect(page.getByText(/^Loading…$/)).toHaveCount(0)
  await expect(page.getByText(/Connecting/)).toHaveCount(0)
}

/** The project's call joined, from the room's own controls (the fixtures' fake LiveKit; no server behind it). */
async function joined(page: Page) {
  await page
    .getByRole('navigation', { name: 'Room controls' })
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(leaveRoom(page).first()).toBeVisible({ timeout: 15_000 })
}

test.describe('default build: the read flag off', () => {
  test('no Resources in the views, its address opens the Studio, and the catalog is never read', async ({
    context,
  }) => {
    await answerCatalog(context, 'page')
    await auth(context)
    const page = await signedIn(context, OFF)
    await page.goto(`${OFF}/p/${PROJECT}/resources?work=lost&vision=off`)
    await expect(account(page)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: 'Studio', exact: true }).first()).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Resources', exact: true })).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/p/${PROJECT}(/studio)?`))
    await settled(page)
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => window.catalogAsked?.length ?? 0)).toBe(0)
  })
})

/** Resources in the views; the catalog read as the signed-in account, its rows shown read only. */
async function viewsAndRows(context: BrowserContext, on: string) {
  await answerCatalog(context, 'page')
  await auth(context)
  const page = await signedIn(context, on)
  await page.goto(`${on}/p/${PROJECT}/studio?work=lost&vision=off`)
  await expect(account(page)).toBeVisible({ timeout: 20_000 })
  const resources = nav(page).getByRole('link', { name: 'Resources', exact: true })
  await expect(resources).toBeVisible()
  await resources.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/p/${PROJECT}/resources`))
  await expect(tiles(page)).toHaveCount(2)
  await expect(page.locator('.resources-scope')).toHaveText(SCOPE)
  const asked = await page.evaluate(() => window.catalogAsked ?? [])
  expect(asked.length).toBeGreaterThan(0)
  for (const a of asked) expect(a).toEqual({ path: `/api/v1/projects/${PROJECT}/native-resources`, subject: DAVIDE.id })
  await tiles(page).filter({ hasText: 'You' }).click()
  await expect(page.getByRole('dialog')).toContainText('Connection linked')
  await expect(page.getByRole('dialog')).toContainText(
    'Work activity, remaining usage and controls aren’t reported by this view.',
  )
  await page.keyboard.press('Escape')
  await tiles(page).filter({ hasText: 'Luis' }).click()
  await expect(page.getByRole('dialog')).toContainText('Its host and connection details are private to its owner.')
  await expect(page.getByRole('dialog').locator('.resource-evidence')).toHaveCount(0)
}

/** A 404 from the catalog, its body never ending: said at once, nothing read shown, no sign-in asked. */
async function refused404(context: BrowserContext, on: string) {
  await answerCatalog(context, 'refuse')
  await auth(context)
  const page = await signedIn(context, on)
  await page.goto(`${on}/p/${PROJECT}/resources?work=lost&vision=off`)
  await expect(account(page)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.resources-read')).toHaveAttribute('data-read', 'refused')
  await expect(page.locator('.resources-read')).toContainText('can’t be read with your access')
  await expect(page.getByRole('button', { name: 'Sign in again' })).toHaveCount(0)
  await expect(tiles(page)).toHaveCount(0)
}

/** What Sign in again says before it signs this device out (REC01). */
const SIGN_IN_WARNING =
  'Signing in again signs out this device. It ends any call you’re in and removes everything unsent on this device: drafts and messages in your projects and your personal space.'

/** The project view's stored draft (useViewerState's format, as app-auth's checks seed it): Davide's, in this project. */
const VIEWER_KEY = `sophia.viewer.v1.${DAVIDE.id}.${PROJECT}`
const VIEWER_DRAFT = JSON.stringify({ lens: 'build', drafts: { build: 'secret plan' } })
/** Words typed into a project conversation's composer and not sent: kept while the Studio is open (talk-store.ts). */
const UNSENT = 'words for the team, not sent yet'

const storedViewer = (page: Page) => page.evaluate((k) => localStorage.getItem(k), VIEWER_KEY)
const composer = (page: Page) => page.getByPlaceholder('Continue this question with the team')

/** The first conversation's composer: open already beside the list, or opened from it where the list comes first. */
async function openConversation(page: Page) {
  await expect(page.getByText('What makes a report worth reading?').first()).toBeVisible()
  if (!(await composer(page).isVisible())) await page.getByText('What makes a report worth reading?').first().click()
  await expect(composer(page)).toBeVisible()
}

/** The project's Conversations, by its views (never a reload, which a tab's kept words don't survive). */
async function toConversations(page: Page) {
  await nav(page).getByRole('link', { name: 'Conversations', exact: true }).click()
  await openConversation(page)
}

/**
 * Two real unsent drafts before the call: words typed into a project conversation's composer through the app, and the
 * project view's stored draft. The fixture's own views flag is on here, as it serves the Conversations view; only the
 * read flag decides Resources.
 */
async function withDrafts(page: Page, on: string) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [VIEWER_KEY, VIEWER_DRAFT] as const)
  await page.goto(`${on}/p/${PROJECT}/conversations?work=lost`)
  await expect(account(page)).toBeVisible({ timeout: 20_000 })
  await settled(page)
  await openConversation(page)
  await composer(page).fill(UNSENT)
  await nav(page).getByRole('link', { name: 'Studio', exact: true }).click()
  await settled(page)
  await joined(page)
}

/**
 * Back in (as another tab of this browser signs in), after Sign out and continue: read anew as Davide, rows shown, no
 * call joined by itself, still one sign-out, and the drafts that went stay gone.
 */
async function backInWithoutDrafts(page: Page, logouts: string[]) {
  await page.evaluate(() => {
    window.catalogMode = 'page'
  })
  const reads = await page.evaluate(() => window.catalogAsked?.length ?? 0)
  await page.evaluate(
    ([key, signed]) => {
      localStorage.setItem(key, signed)
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      new BroadcastChannel(key).postMessage({ event: 'SIGNED_IN', session: JSON.parse(signed) as unknown })
    },
    [SESSION_KEY, JSON.stringify(session())] as const,
  )
  await expect(account(page)).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(new RegExp(`/p/${PROJECT}/resources`))
  await expect(tiles(page)).toHaveCount(2)
  expect(await page.evaluate(() => window.catalogAsked?.length ?? 0)).toBeGreaterThan(reads)
  await expect(leaveRoom(page)).toHaveCount(0)
  expect(logouts).toEqual(['local'])
  await toConversations(page)
  await expect(composer(page)).toHaveValue('')
  expect(JSON.parse((await storedViewer(page)) ?? '{}')).toEqual({ lens: 'build', drafts: {} })
}

/**
 * A final 401 in a settled project, in a call, with two unsent drafts: Sign in again asks first. Stay here, or leaving
 * for another view before answering, signs nothing out, reads nothing, keeps the call and both drafts byte for byte.
 * Then Sign out and continue: this device only, once; both drafts gone; no row; the sign-in at the same address; back
 * in, a fresh read and no call joined by itself.
 */
async function stayThenSignOut(context: BrowserContext, on: string) {
  await answerCatalog(context, 'unauthorized')
  const logouts = await auth(context)
  const page = await signedIn(context, on)
  await withDrafts(page, on)
  await nav(page).getByRole('link', { name: 'Resources', exact: true }).click()
  const notice = page.locator('.resources-read')
  await expect(notice).toHaveAttribute('data-read', 'refused')
  await expect(notice).toContainText('Your session has ended. Sign in again to read the resources.')
  await expect(tiles(page)).toHaveCount(0)
  const asked = await page.evaluate(() => window.catalogAsked?.length ?? 0)
  const signIn = notice.getByRole('button', { name: 'Sign in again' })
  const choice = notice.getByRole('group', { name: 'Sign in again' })
  // Asked first: what it ends and removes, said plainly, Stay here focused. A second Enter keeps.
  await signIn.focus()
  await page.keyboard.press('Enter')
  await expect(choice).toContainText(SIGN_IN_WARNING)
  await expect(choice).toBeInViewport()
  await expect(choice.getByRole('button', { name: 'Stay here' })).toBeFocused()
  await expect(choice.getByRole('button', { name: 'Sign out and continue' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(choice).toHaveCount(0)
  await expect(signIn).toBeFocused()
  // Leaving for another view before answering is no answer either.
  await signIn.click()
  await expect(choice).toBeVisible()
  await toConversations(page)
  // Nothing signed out, nothing read, the call live with its switches, both drafts exactly as they were.
  await page.waitForTimeout(800)
  expect(logouts).toEqual([])
  expect(await page.evaluate(() => window.catalogAsked?.length ?? 0)).toBe(asked)
  await expect(account(page)).toBeVisible()
  await expect(leaveRoom(page).first()).toBeVisible()
  await expect(composer(page)).toHaveValue(UNSENT)
  expect(await storedViewer(page)).toBe(VIEWER_DRAFT)
  // Back to Resources (a new read, as any opening is), then Sign out and continue: the disclosed sign-out, once.
  await nav(page).getByRole('link', { name: 'Resources', exact: true }).click()
  await expect(notice).toHaveAttribute('data-read', 'refused')
  await signIn.click()
  await choice.getByRole('button', { name: 'Sign out and continue' }).click()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  expect(logouts).toEqual(['local'])
  await expect(page).toHaveURL(new RegExp(`/p/${PROJECT}/resources`))
  await expect(leaveRoom(page)).toHaveCount(0)
  await expect(tiles(page)).toHaveCount(0)
  expect(JSON.parse((await storedViewer(page)) ?? '{}')).toEqual({ lens: 'build', drafts: {} })
  await backInWithoutDrafts(page, logouts)
}

/**
 * A final 401 whose sign-out fails, confirmed: said, the person still in, the refusal kept, no row shown, no read again.
 * The drafts go even so (App's `leaving` forgets them before and after the attempt), as the warning says.
 */
async function signOutFails(context: BrowserContext, on: string) {
  await answerCatalog(context, 'unauthorized')
  await auth(context)
  const page = await signedIn(context, on)
  await page.goto(`${on}/p/${PROJECT}/resources?work=lost&vision=off`)
  await expect(account(page)).toBeVisible({ timeout: 20_000 })
  const notice = page.locator('.resources-read')
  await expect(notice).toHaveAttribute('data-read', 'refused')
  // The browser's storage refuses to let the session go: the sign-out fails, as app-auth's check makes it.
  await page.evaluate((key) => {
    const removeItem = Storage.prototype.removeItem.bind(localStorage)
    Storage.prototype.removeItem = (name: string) => {
      if (name === key && document.documentElement.dataset['refuse'] === 'yes') throw new Error('Storage refused')
      removeItem(name)
    }
    document.documentElement.dataset['refuse'] = 'yes'
  }, SESSION_KEY)
  // A good page now waits behind it: nothing may read it by itself.
  await page.evaluate(() => {
    window.catalogMode = 'page'
  })
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [VIEWER_KEY, VIEWER_DRAFT] as const)
  const asked = await page.evaluate(() => window.catalogAsked?.length ?? 0)
  await notice.getByRole('button', { name: 'Sign in again' }).click()
  const choice = notice.getByRole('group', { name: 'Sign in again' })
  await expect(choice).toContainText(SIGN_IN_WARNING)
  await choice.getByRole('button', { name: 'Sign out and continue' }).click()
  const toast = page.locator('.toast')
  await expect(toast).toContainText('Couldn’t sign out: this device is still signed in.')
  await expect(toast.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(account(page)).toBeVisible()
  await expect(notice).toHaveAttribute('data-read', 'refused')
  await page.waitForTimeout(1000)
  await expect(tiles(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.catalogAsked?.length ?? 0)).toBe(asked)
  expect(JSON.parse((await storedViewer(page)) ?? '{}')).toEqual({ lens: 'build', drafts: {} })
}

/**
 * A settled project in a call: Resources by its views, its sheet stepped and closed, the call's switches in reach in the
 * sheet and in the dock, and Leave ending the call with nothing rejoining it.
 */
async function settledInCall(context: BrowserContext, on: string, phone: boolean) {
  await answerCatalog(context, 'page')
  await auth(context)
  const page = await signedIn(context, on)
  await page.goto(`${on}/p/${PROJECT}/studio?work=lost&vision=off`)
  await expect(account(page)).toBeVisible({ timeout: 20_000 })
  await settled(page)
  await joined(page)
  // Resources while in the call, by the project's views: the project still settled, the call live in the dock.
  await nav(page).getByRole('link', { name: 'Resources', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/p/${PROJECT}/resources`))
  await settled(page)
  await expect(tiles(page)).toHaveCount(2)
  const dock = page.getByRole('group', { name: 'Project room' })
  await expect(dock).toBeVisible()
  await expect(dock).toHaveAttribute('data-live', 'true')
  await expect(dock.getByRole('button', { name: /Microphone/ })).toBeVisible()
  await expect(page.locator('.resources-scope')).toBeInViewport()
  // The owner's sheet: the call's switches in its head, inside the dialog; its evidence opens; J steps.
  await tiles(page).filter({ hasText: 'You' }).click()
  const sheet = page.getByRole('dialog')
  const call = sheet.getByRole('group', { name: 'Your call' })
  await expect(call).toBeVisible()
  await expect(call.getByRole('button', { name: /Microphone/ })).toBeVisible()
  await expect(call.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await sheet.getByText('Recorded host and capability evidence').click()
  await expect(sheet.getByText('Handshake recorded')).toBeVisible()
  await sheet.locator('.resource-connection').click()
  await page.keyboard.press('j')
  await expect(sheet).toContainText('Its host and connection details are private to its owner.')
  await expect(sheet.locator('.resource-evidence')).toHaveCount(0)
  await expect(call.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  if (phone) {
    const box = await sheet.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(390)
  }
  // The microphone from inside the sheet, by keys: its state turns; then Escape back to the tile.
  const mic = call.getByRole('button', { name: /Microphone/ })
  const before = await mic.getAttribute('aria-pressed')
  await mic.focus()
  await page.keyboard.press('Enter')
  await expect(mic).not.toHaveAttribute('aria-pressed', before ?? '')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  // Leave from the dock: the call ends here, and nothing rejoins it.
  await page.getByRole('group', { name: 'Project room' }).getByRole('button', { name: 'Leave the room' }).click()
  await expect(leaveRoom(page)).toHaveCount(0)
  await page.waitForTimeout(800)
  await expect(leaveRoom(page)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone ? 390 : 1280)
}

test.describe('a build with the read flag on (its own server)', () => {
  let server: ChildProcess | null = null
  let on = ''
  test.beforeAll(async () => {
    test.setTimeout(120_000)
    const port = portOf(test.info().project.name)
    on = `http://127.0.0.1:${String(port)}`
    server = spawn('pnpm', ['exec', 'vite', '--config', 'vite.app.config.ts', '--port', String(port), '--strictPort'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, VITE_SOPHIA_NATIVE_RESOURCES: '1' },
      stdio: 'ignore',
    })
    for (let i = 0; i < 100; i += 1) {
      const up = await fetch(`${on}/app.html`).then(
        (r) => r.ok,
        () => false,
      )
      if (up) return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('the flagged app server did not start')
  })
  test.afterAll(() => {
    server?.kill('SIGTERM')
  })

  test('Resources in the views; the catalog read as the signed-in account, its rows shown read only', ({ context }) =>
    viewsAndRows(context, on))
  test('a 404 from the catalog, its body never ending, is said at once and shows nothing read', ({ context }) =>
    refused404(context, on))
  test('a settled project in a call: Resources, its sheet stepped and closed, the call’s switches in reach', ({
    context,
  }) => settledInCall(context, on, false))
  test('@phone a settled project in a call: Resources, its sheet stepped and closed, the call’s switches in reach', ({
    context,
  }) => settledInCall(context, on, true))
  test('a final 401 in a call with unsent drafts: Sign in again asks first; Stay here keeps all; Sign out and continue signs this device out only', ({
    context,
  }) => stayThenSignOut(context, on))
  test('@phone a final 401 in a call with unsent drafts: Sign in again asks first; Stay here keeps all; Sign out and continue signs this device out only', ({
    context,
  }) => stayThenSignOut(context, on))
  test('a final 401 whose sign-out fails: said, the person still in, the refusal kept, no row shown, no read again', ({
    context,
  }) => signOutFails(context, on))
})
