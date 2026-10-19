import { expect, test, type Page } from '@playwright/test'
import { record } from './measure.ts'

// M3 and M4 (docs/plans/reliability-measure.md, the baseline's §4 and gap 6): the project feed loses its stream and
// comes back. The fixture's server ends it (`dropStream`), silences it (`stallStream`) or skips a sequence (`gap`), or
// the network goes and comes back; the header's pill goes through «Reconnecting» or «Catching up» back to «Up to date».
// Its states are recorded in the page with performance.now(). The levers are reliability/feed-reconnect's: on a page
// without them a scenario is recorded as not run. Measured, not judged: the checks assert only that each scenario ran.

const pill = (page: Page) => page.locator('.topbar .connection')
const ROUNDS = 3

interface Seen {
  state: string
  at: number
}

declare global {
  interface Window {
    /** The pill's states from the page's first paint, each with its time. */
    reliabilityFeed?: Seen[]
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.addInitScript(() => {
    const seen: Seen[] = []
    window.reliabilityFeed = seen
    new MutationObserver(() => {
      const state = document.querySelector('.topbar .connection')?.getAttribute('data-state')
      if (state && state !== seen.at(-1)?.state) seen.push({ state, at: performance.now() })
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })
  })
})

/** Pulls a fixture lever by name if this page has it; false when it doesn't (a page without the feed's levers). */
const pull = (page: Page, name: string) =>
  page.evaluate((n) => {
    const fixture: unknown = window.fixture
    const lever: unknown = typeof fixture === 'object' && fixture !== null ? Reflect.get(fixture, n) : undefined
    if (typeof lever !== 'function') return false
    Reflect.apply(lever, fixture, [])
    return true
  }, name)

const now = (page: Page) => page.evaluate(() => performance.now())

/** How long after `from` the pill said «Up to date», having said `via` on the way (any state when null); else null. */
const backAfter = (page: Page, from: number, via: string | null) =>
  page.evaluate(
    ({ since, through }) => {
      const after = (window.reliabilityFeed ?? []).filter((s) => s.at >= since)
      const lost = through === null ? -1 : after.findIndex((s) => s.state === through)
      if (through !== null && lost < 0) return null
      const live = after.slice(lost + 1).find((s) => s.state === 'live')
      return live ? live.at - since : null
    },
    { since: from, through: via },
  )

/** Waits up to `ms` for the pill to be back, then says how long it took (null: not back in time). */
async function cameBack(page: Page, from: number, via: string | null, ms: number) {
  await expect
    .poll(() => backAfter(page, from, via), { timeout: ms })
    .not.toBeNull()
    .catch(() => undefined)
  return backAfter(page, from, via)
}

/** The project open, its feed live. */
async function open(page: Page) {
  await page.goto('/room.html?discussion=3')
  await expect(pill(page)).toHaveAttribute('data-state', 'live')
}

test('M3 · the server ends the stream: Reconnecting, then Up to date @reliability', async ({ page }) => {
  await open(page)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const from = await now(page)
    const lever = await pull(page, 'dropStream')
    const ms = lever ? await cameBack(page, from, 'reconnecting', 15_000) : null
    samples.push({ case: 'drop', lever, ms })
    if (!lever) break
  }
  await record(test.info(), 'M3', samples)
  expect(samples.length).toBeGreaterThan(0)
})

test('M3 · the stream goes silent, no ping either: given up, then Up to date @reliability', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page)
  const from = await now(page)
  const lever = await pull(page, 'stallStream')
  const ms = lever ? await cameBack(page, from, 'reconnecting', 45_000) : null
  await record(test.info(), 'M3', [{ case: 'stall', lever, ms }])
  expect(typeof lever).toBe('boolean')
})

test('M4 · a sequence is skipped: Catching up, then Up to date @reliability', async ({ page }) => {
  await open(page)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const from = await now(page)
    const lever = await pull(page, 'gap')
    // A frame after the skipped one, so the feed sees the hole.
    if (lever) await page.evaluate((r) => window.fixture?.say(`Said past a lost frame, round ${r}.`), round + 1)
    const ms = lever ? await cameBack(page, from, 'resyncing', 15_000) : null
    samples.push({ case: 'gap', lever, ms })
    if (!lever) break
  }
  await record(test.info(), 'M4', samples)
  expect(samples.length).toBeGreaterThan(0)
})

test('M3 · offline, then back online: from the network back to Up to date @reliability', async ({ page, context }) => {
  test.setTimeout(60_000)
  await open(page)
  await context.setOffline(true)
  // The fixture's API answers in the page, so the network goes with its levers: out of reach, the stream ended.
  await page.evaluate(() => window.fixture?.outage(true))
  const lever = await pull(page, 'dropStream')
  let ms: number | null = null
  if (lever) {
    await expect(pill(page)).toHaveAttribute('data-state', 'reconnecting')
    // Three asks refused (1, 2 and 4 s): the loop is in its longest wait so far.
    await page.waitForTimeout(8000)
    await page.evaluate(() => window.fixture?.outage(false))
    const from = await now(page)
    await context.setOffline(false)
    ms = await cameBack(page, from, null, 20_000)
  }
  await record(test.info(), 'M3', [{ case: 'online', lever, ms }])
  expect(typeof lever).toBe('boolean')
})
