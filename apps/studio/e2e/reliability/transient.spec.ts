import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { record, withProbe, type Rule } from './measure.ts'

// M7 (docs/plans/reliability-measure.md, the baseline's §4 and gap 2): a read answered 502 or 503 with an HTML body (a
// proxy's page, as Render's while it deploys or wakes, not the API's contract) once or twice, then 200. Does the view
// come back without a press, and how long after the first error? On the Studio app itself (fixtures/app.tsx: App, its
// own query client and retry rule, the API answered in the page with `work=lost`), not a fixture page, whose plain
// query client retries every failure. Measured, not judged: the checks assert only that the scenario ran.

const APP = 'http://127.0.0.1:5198'
/** supabase-js's own key for a session with the synthetic Auth service at 127.0.0.1 (e2e/app-auth.spec.ts). */
const SESSION_KEY = 'sb-127-auth-token'
/** The project `work=lost` serves (fixtures/data.ts's PROJECT). */
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
/** How long a view is given to come back on its own, from the first error. */
const PATIENCE = 15_000

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A synthetic session, unsigned, a day long: only the synthetic Auth service would see it, and it signs nothing. */
function session() {
  const id = '00000000-0000-4000-8000-00000000d001'
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const claims = { sub: id, email: 'davide@sophia.test', role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.synthetic`,
    refresh_token: `synthetic-refresh-${id}`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    user: {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: claims.email,
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

test.beforeEach(async ({ context }) => {
  test.setTimeout(120_000)
  await context.route(
    (url) => url.origin !== APP && url.protocol.startsWith('http'),
    (route) => route.abort(),
  )
  await context.route(`${APP}/synthetic-auth/**`, (route) =>
    route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic Auth: nothing here' } }),
  )
})

/** The read under test, the view that makes it, and what that view shows once it has the read's answer. */
interface Read {
  read: string
  view: string
  pattern: string
  loaded: string
}

const READS: Read[] = [
  {
    read: 'conversations',
    view: 'conversations',
    pattern: '/conversations$',
    loaded: 'section[aria-label="All conversations"] .conv-row',
  },
  { read: 'knowledge-reports', view: 'knowledge', pattern: '/knowledge/reports', loaded: '.report-card' },
  {
    read: 'since-you-looked',
    view: 'updates',
    pattern: '/since$',
    loaded: 'section[aria-labelledby="since-title"] .sheet-lead:not([role])',
  },
]

/** A tab of the app with the synthetic session kept, before the app first loads. */
async function signedIn(context: BrowserContext) {
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  const kept = JSON.stringify(session())
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SESSION_KEY, kept] as const)
  return page
}

/** In the page: from the first error, whether `loaded` shows within `patience` ms, and when. */
const cameBack = (page: Page, loaded: string) =>
  page.evaluate(
    ({ selector, patience }) =>
      new Promise<{ recovered: boolean; ms: number | null; reached: boolean }>((resolve) => {
        const since = performance.now()
        const tick = () => {
          const first = window.reliability?.hits[0]
          const now = performance.now()
          if (first && document.querySelector(selector)) resolve({ recovered: true, ms: now - first.at, reached: true })
          else if (first && now - first.at > patience) resolve({ recovered: false, ms: null, reached: true })
          else if (!first && now - since > patience) resolve({ recovered: false, ms: null, reached: false })
          else requestAnimationFrame(tick)
        }
        tick()
      }),
    { selector: loaded, patience: PATIENCE },
  )

/** One read: a control (nothing failing, the view shows what `loaded` looks for), then answered `failures` times. */
async function measure(context: BrowserContext, read: Read, failures: number) {
  const calm = await signedIn(context)
  await calm.goto(`${APP}/p/${PROJECT}/${read.view}?work=lost`)
  await expect(calm.locator(read.loaded).first()).toBeVisible({ timeout: PATIENCE })
  await calm.close()
  const page = await signedIn(context)
  const rule: Rule = { pattern: read.pattern, answer: failures === 1 ? 'html502' : 'html503', times: failures }
  await withProbe(page, [rule])
  await page.goto(`${APP}/p/${PROJECT}/${read.view}?work=lost`)
  const outcome = await cameBack(page, read.loaded)
  const errors = await page.evaluate(() => window.reliability?.hits.length ?? 0)
  await page.close()
  return { read: read.read, failures, errors, ...outcome }
}

for (const failures of [1, 2]) {
  test(`M7 · reads answered ${failures === 1 ? '502 once' : '503 twice'} in HTML, then 200 @reliability`, async ({
    context,
  }) => {
    const samples = []
    for (const read of READS) samples.push(await measure(context, read, failures))
    await record(test.info(), 'M7', samples)
    expect(samples).toHaveLength(READS.length)
  })
}
