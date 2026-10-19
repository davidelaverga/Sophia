import { expect, test, type Page } from '@playwright/test'

// The project feed loses its stream and comes back (docs/plans/feed-reconnect.md): the fixture's server ends it
// (`dropStream`), silences it (`stallStream`) or skips a sequence (`gap`), and the header's pill goes through
// «Reconnecting» or «Catching up» back to «Up to date», with what was said meanwhile in the chat. The pill's states are
// recorded in the page with their times, so each check says how long the feed took to come back.

const pill = (page: Page) => page.locator('.topbar .connection')
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })

interface Seen {
  state: string
  at: number
}

declare global {
  interface Window {
    /** The pill's states, recorded from the page's first paint (beforeEach). */
    feedStates?: Seen[]
  }
}

/** The states the pill has taken since the page opened, each with its time (`performance.now()`). */
const states = (page: Page) => page.evaluate(() => [...(window.feedStates ?? [])])
const now = (page: Page) => page.evaluate(() => performance.now())

/** How long after `from` the pill first said «Up to date», having said `via` on the way; null while it hasn't. */
async function backAfter(page: Page, from: number, via: string): Promise<number | null> {
  const after = (await states(page)).filter((s) => s.at >= from)
  const lost = after.findIndex((s) => s.state === via)
  const live = after.slice(lost + 1).find((s) => s.state === 'live')
  return lost >= 0 && live ? Math.round(live.at - from) : null
}

/** Opens the project with its chat, the feed live. */
async function open(page: Page) {
  await page.goto('/room.html?discussion=3')
  await expect(pill(page)).toHaveAttribute('data-state', 'live')
  await chatToggle(page).click()
  await expect(discussion(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.addInitScript(() => {
    const seen: Seen[] = []
    window.feedStates = seen
    new MutationObserver(() => {
      const state = document.querySelector('.topbar .connection')?.getAttribute('data-state')
      if (state && state !== seen.at(-1)?.state) seen.push({ state, at: performance.now() })
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })
  })
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('feed · the server ends the stream: Reconnecting, then Up to date, with what was said meanwhile', async ({
  page,
}) => {
  await open(page)
  const from = await now(page)
  await page.evaluate(() => {
    window.fixture?.dropStream()
    window.fixture?.say('Said while the stream was down.')
  })
  await expect(discussion(page).getByText('Said while the stream was down.')).toBeVisible()
  await expect.poll(() => backAfter(page, from, 'reconnecting')).not.toBeNull()
  const took = await backAfter(page, from, 'reconnecting')
  console.log(`feed · dropped stream back to Up to date in ${String(took)} ms`)
  expect(took).toBeLessThanOrEqual(3000)
})

test('feed · the stream goes silent, no ping either: given up after 25 s, then Up to date with what was said', async ({
  page,
}) => {
  test.setTimeout(75_000)
  await open(page)
  const from = await now(page)
  await page.evaluate(() => {
    window.fixture?.stallStream()
    window.fixture?.say('Said into a silent stream.')
  })
  await page.waitForTimeout(1500)
  await expect(pill(page), 'a silent stream still looks live at first').toHaveAttribute('data-state', 'live')
  await expect(discussion(page).getByText('Said into a silent stream.')).toHaveCount(0)
  await expect(discussion(page).getByText('Said into a silent stream.')).toBeVisible({ timeout: 40_000 })
  await expect.poll(() => backAfter(page, from, 'reconnecting')).not.toBeNull()
  const took = await backAfter(page, from, 'reconnecting')
  console.log(`feed · stalled stream back to Up to date in ${String(took)} ms`)
  // 25 s from the last bytes (the fixture pings every 5 s, so up to 5 s before the stall), then one backoff.
  expect(took).toBeGreaterThanOrEqual(20_000)
  expect(took).toBeLessThanOrEqual(28_000)
})

test('feed · a sequence is skipped: Catching up, then Up to date, with the message from the snapshot', async ({
  page,
}) => {
  await open(page)
  const from = await now(page)
  await page.evaluate(() => {
    window.fixture?.gap()
    window.fixture?.say('Said past a lost frame.')
  })
  await expect(discussion(page).getByText('Said past a lost frame.')).toBeVisible()
  await expect.poll(() => backAfter(page, from, 'resyncing')).not.toBeNull()
  const took = await backAfter(page, from, 'resyncing')
  console.log(`feed · skipped sequence back to Up to date in ${String(took)} ms`)
  expect(took).toBeLessThanOrEqual(3000)
  expect((await states(page)).filter((s) => s.at >= from).map((s) => s.state)).not.toContain('reconnecting')
})
