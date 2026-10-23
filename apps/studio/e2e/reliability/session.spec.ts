import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { record, type Timed } from './measure.ts'

// M8 (docs/plans/reliability-measure.md, the baseline's §4 and gap 3; auth-session-renewal.md): a laptop that wakes past
// its token's hour asks the API before supabase-js has refreshed, and the API answers 401. On the Studio app itself
// (fixtures/app.tsx, `work=lost`), `appFixture.expireToken()` is that moment, and the synthetic Auth renews the session
// when asked. Per kind (a read, a keyed write, the feed): renewed without «You’ve been signed out», the refused request
// sent again (a write under its key), one refresh, and the time from the press (or the lever) to the answer on screen.
// Measured, not judged: the checks assert only that each scenario ran.

const APP = 'http://127.0.0.1:5198'
/** supabase-js's own key for a session with the synthetic Auth service at 127.0.0.1 (e2e/app-auth.spec.ts). */
const SESSION_KEY = 'sb-127-auth-token'
/** The project `work=lost` serves (fixtures/data.ts's PROJECT). */
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const DAVIDE = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
/** A line of the second row's conversation (Short or long briefs?), read only once opened. */
const BRIEFS_LINE = 'One page. Anything longer, nobody reads.'
/**
 * What a sign-out says: the project's notice (ProjectShell), and the App's when the tab itself signed out
 * (ended-notice.ts: «… so this tab signed out.», «Your sign-in on this device ended …»).
 */
const SIGNED_OUT = ['You’ve been signed out', 'so this tab signed out', 'Your sign-in on this device ended']
/** How long an answer is waited for, from the press. */
const LIMIT = 15_000
const ROUNDS = 3

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A synthetic session, unsigned, a day long: only the synthetic Auth service sees it, and it signs nothing. */
function session(tag = 'synthetic') {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const claims = { sub: DAVIDE.id, email: DAVIDE.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.${tag}`,
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

/** The refreshes the app asked the synthetic Auth for, per context. */
const refreshesOf = new WeakMap<BrowserContext, string[]>()

test.beforeEach(async ({ context }) => {
  test.setTimeout(120_000)
  const asked: string[] = []
  refreshesOf.set(context, asked)
  await context.route(
    (url) => url.origin !== APP && url.protocol.startsWith('http'),
    (route) => route.abort(),
  )
  // A refresh renews Davide's session with a new access token each time; nothing else is answered.
  await context.route(`${APP}/synthetic-auth/**`, (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/auth/v1/token'))
      return route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic Auth: nothing here' } })
    asked.push(route.request().url())
    return route.fulfill({ json: session(`renewed-${String(asked.length)}`) })
  })
})

/** A new tab of the app on `view` (`work=lost`), Davide's session kept before the app first loads. */
async function signedIn(context: BrowserContext, view: string) {
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  const kept = JSON.stringify(session())
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SESSION_KEY, kept] as const)
  await page.goto(`${APP}/p/${PROJECT}/${view}?work=lost`)
  return page
}

const askedOf = (page: Page) => page.evaluate(() => [...(window.appFixture?.asked ?? [])])
const refusedOf = (page: Page) => page.evaluate(() => [...(window.appFixture?.refused ?? [])])
const keysOf = (page: Page) => page.evaluate(() => [...(window.appFixture?.keys ?? [])])
const rows = (page: Page) => page.locator('section[aria-label="All conversations"] .conv-row')

/** The conversations' list read, and the first one open with its 6 messages: every read the view opens with is in. */
async function readingOpen(page: Page) {
  await expect(rows(page)).toHaveCount(3)
  await expect(page.locator('.conv-open')).toBeVisible()
  await expect(page.locator('.conv-msg')).toHaveCount(6)
}

/** The page has asked the API nothing for a second: what it asks next is the request that meets the expired token. */
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

/** What a step waits for: `text` in a `selector`, or the feed's pill back «Up to date» after it left. */
type Answer = { selector: string; text: string } | { feed: true }

/** From the press (or from the lever, pulled in the page as the clock starts) to the answer, in `limit` ms. */
interface Step {
  on: 'click' | 'keydown' | 'lever'
  answer: Answer
}

/** What the clock came to, and the header's pill states it saw on the way (`live`, `reconnecting`, …). */
interface Clocked extends Timed {
  via: string[]
}

declare global {
  interface Window {
    reliabilitySession?: Promise<Clocked>
  }
}

/**
 * Arms the clock in the page: it starts at the press (a click, or Enter) or with the lever (the token expired and the
 * stream dropped at once), and stops at the answer on screen; a sign-out's words, or the limit, stop it with none.
 */
const arm = (page: Page, step: Step) =>
  page.evaluate(
    ({ s, limit, signedOut }) => {
      window.reliabilitySession = new Promise<Clocked>((resolve) => {
        let start = 0
        const via: string[] = []
        const answered = () => {
          const state = document.querySelector('.topbar .connection')?.getAttribute('data-state') ?? 'none'
          if (state !== via.at(-1)) via.push(state)
          if ('feed' in s.answer) return via.length > 1 && state === 'live'
          const { selector, text } = s.answer
          return [...document.querySelectorAll(selector)].some((e) => e.textContent.includes(text))
        }
        const tick = () => {
          const now = performance.now()
          if (answered()) resolve({ ms: now - start, definitive: true, via })
          else if (signedOut.some((words) => document.body.innerText.includes(words)) || now - start > limit)
            resolve({ ms: null, definitive: false, via })
          else requestAnimationFrame(tick)
        }
        const begin = () => {
          start = performance.now()
          requestAnimationFrame(tick)
        }
        if (s.on === 'lever') {
          begin()
          window.appFixture?.expireToken()
          window.appFixture?.dropStream()
          return
        }
        const pressed = (event: Event) => {
          if (s.on === 'keydown' && !(event instanceof KeyboardEvent && event.key === 'Enter')) return
          document.removeEventListener(s.on, pressed, true)
          begin()
        }
        document.addEventListener(s.on, pressed, true)
      })
    },
    { s: step, limit: LIMIT, signedOut: SIGNED_OUT },
  )

const answered = (page: Page): Promise<Clocked> =>
  page.evaluate(async () => (await window.reliabilitySession) ?? { ms: null, definitive: false, via: [] })

/** What the page had asked, and the keys it had sent, before the lever. */
const before = async (page: Page) => ({ asked: (await askedOf(page)).length, keys: (await keysOf(page)).length })

/** Whether the page says it signed out, in any of its words. */
const saysSignedOut = (page: Page) =>
  page.evaluate((said) => said.some((words) => document.body.innerText.includes(words)), SIGNED_OUT)

/**
 * A round's sample, read once the page has gone quiet after the answer, so a late second refresh or request counts.
 * `refused`: the unique requests the expired token met (the report checks the one its kind measures). `resent`: every
 * request refused so went again and wasn't refused (a write's tries under one key). `refreshes`: asked of the
 * synthetic Auth since the round began.
 */
async function sampleOf(kind: string, page: Page, from: { asked: number; keys: number; refreshes: number }) {
  const timed = await answered(page)
  await quiet(page)
  const refused = await refusedOf(page)
  const asked = (await askedOf(page)).slice(from.asked)
  const keys = (await keysOf(page)).slice(from.keys)
  const again = (request: string) =>
    asked.filter((a) => a.startsWith(`${request} by `)).length > refused.filter((r) => r === request).length
  const oneKey = (request: string) => {
    const tries = keys.filter((k) => k.startsWith(`${request} `))
    return !request.startsWith('POST ') || (tries.length >= 2 && new Set(tries).size === 1)
  }
  const requests = [...new Set(refused)]
  return {
    kind,
    refused: requests,
    definitive: timed.definitive,
    ms: timed.ms,
    via: timed.via,
    signedOut: await saysSignedOut(page),
    resent: requests.length > 0 && requests.every((r) => again(r) && oneKey(r)),
    refreshes: (refreshesOf.get(page.context())?.length ?? 0) - from.refreshes,
  }
}

const refreshesNow = (page: Page) => refreshesOf.get(page.context())?.length ?? 0

/** A read: the second conversation opened after the token expired, until its messages show. */
async function read(context: BrowserContext) {
  const page = await signedIn(context, 'conversations')
  await readingOpen(page)
  await quiet(page)
  const from = { ...(await before(page)), refreshes: refreshesNow(page) }
  await arm(page, { on: 'click', answer: { selector: '.conv-msg', text: BRIEFS_LINE } })
  await page.evaluate(() => window.appFixture?.expireToken())
  await rows(page).nth(1).click()
  const sample = await sampleOf('read', page, from)
  await page.close()
  return sample
}

/** A keyed write: a message sent after the token expired, Sophia not asked, until it is listed. */
async function write(context: BrowserContext, round: number) {
  const page = await signedIn(context, 'conversations')
  await readingOpen(page)
  // No Sophia's answer, which would publish to the feed.
  await page.getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await quiet(page)
  const text = `Sent past an expired token, round ${round + 1}.`
  await page.getByLabel('Continue this question with the team').fill(text)
  const from = { ...(await before(page)), refreshes: refreshesNow(page) }
  await arm(page, { on: 'keydown', answer: { selector: '.conv-msg', text } })
  await page.evaluate(() => window.appFixture?.expireToken())
  await page.keyboard.press('Enter')
  const sample = await sampleOf('write', page, from)
  await page.close()
  return sample
}

/** The feed: the token expired and the stream dropped at once, until the pill is back «Up to date». */
async function feed(context: BrowserContext) {
  const page = await signedIn(context, 'studio')
  await expect(page.locator('.topbar .connection')).toHaveAttribute('data-state', 'live')
  const from = { ...(await before(page)), refreshes: refreshesNow(page) }
  await arm(page, { on: 'lever', answer: { feed: true } })
  const sample = await sampleOf('feed', page, from)
  await page.close()
  return sample
}

test('M8 · a conversation read after the token expired: renewed, asked again @reliability', async ({ context }) => {
  const samples = []
  for (let round = 0; round < ROUNDS; round++) samples.push(await read(context))
  await record(test.info(), 'M8', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M8 · a message sent after the token expired: renewed, sent again under its key @reliability', async ({
  context,
}) => {
  const samples = []
  for (let round = 0; round < ROUNDS; round++) samples.push(await write(context, round))
  await record(test.info(), 'M8', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M8 · the feed dropped after the token expired: renewed, back up to date @reliability', async ({ context }) => {
  const samples = []
  for (let round = 0; round < ROUNDS; round++) samples.push(await feed(context))
  await record(test.info(), 'M8', samples)
  expect(samples).toHaveLength(ROUNDS)
})
