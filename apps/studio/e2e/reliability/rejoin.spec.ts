import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { record } from './measure.ts'

// M5 (docs/plans/reliability-measure.md, the baseline's §4 and gap 9; call-rejoin.md): a dropped call tries once to
// come back. On the room's fixture page (`call=on`), `window.fixture.drop()` is LiveKit giving up, and `failToken()`
// refuses the try's token. Per case: back in without a press, and how long after the drop (offline, after the network
// came back); the room tokens asked since the drop (the tries); «Reconnected.» said once; a failed try said with Try
// again, and no second try on its own; and the microphone never turned on where the call or this device's choice had
// it off. Each round in a new browser context: one try per drop in two minutes, so a round in the same page would meet
// the last round's try. Timed in the page with performance.now(). Measured, not judged: the checks assert only that
// each scenario ran.

const FIXTURES = 'http://127.0.0.1:5199'
const ROUNDS = 3
/** How long a way back is waited for, from the drop (or the network's return). */
const LIMIT = 15_000
const DROPPED = 'You were disconnected from the room.'
const OFFLINE_REJOIN = 'You’re offline, so the call ended here. Back online, you rejoin it automatically.'
const RECONNECTED = 'Reconnected.'
/** This device's choice of microphone on joining, as Settings writes it (mic-on-join). */
const MIC_CHOICE = 'sophia.mic.v1'

interface Moment {
  live: boolean
  note: string
  at: number
}

declare global {
  interface Window {
    /** The dock's states from the page's first paint (in the call, what its notes say), and when the network came back. */
    reliabilityCall?: { moments: Moment[]; online: number | null }
  }
}

/** Installed before the page's scripts: each change of the dock (its microphone shown, its notes' words), timed. */
function watch() {
  const state: { moments: Moment[]; online: number | null } = { moments: [], online: null }
  window.reliabilityCall = state
  const read = () => {
    const dock = document.querySelector('.dock-wrap')
    const live = !!dock?.querySelector('nav[aria-label="Room controls"] button[aria-label="Microphone"]')
    const note = [...(dock?.querySelectorAll('.dock-note') ?? [])].map((p) => p.textContent).join(' | ')
    const last = state.moments.at(-1)
    if (!last || last.live !== live || last.note !== note) state.moments.push({ live, note, at: performance.now() })
  }
  new MutationObserver(read).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  window.addEventListener('online', () => {
    state.online = performance.now()
  })
}

const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
/** The room tokens asked for: one per join, the try's included (fixtures/fixture-api.ts). */
const tokens = async (page: Page) =>
  (await page.evaluate(() => [...(window.fixture?.served ?? [])])).filter((s) => s === 'room-token').length
const controls = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const microphone = (page: Page) => controls(page).getByRole('button', { name: 'Microphone' })
const tryAgain = (page: Page) => controls(page).getByRole('button', { name: /^Try again/ })
const notes = (page: Page) => page.locator('.dock-wrap .dock-note')
const choose = (page: Page, choice: 'on' | 'off') =>
  page.evaluate(([key, value]) => localStorage.setItem(key, value), [MIC_CHOICE, choice] as const)

/** A new browser context in the call: connected, and its microphone arrived. */
async function inCall(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: FIXTURES, viewport: { width: 1280, height: 800 } })
  await context.route(
    (url) => url.origin !== FIXTURES,
    (route) => route.abort(),
  )
  await context.addInitScript(watch)
  const page = await context.newPage()
  await page.goto('/room.html?call=on')
  await expect(controls(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect.poll(() => asked(page)).toContain('microphone:on')
  return { context, page }
}

/** Drops the call in the page as its clock starts (its one try refused when `failing`); when it was dropped. */
const drop = (page: Page, failing = false) =>
  page.evaluate((fail) => {
    const at = performance.now()
    if (fail) window.fixture?.failToken()
    window.fixture?.drop()
    return at
  }, failing)

/** When the call was live again after `from`, having left it; null if not. */
const liveAgain = (page: Page, from: number) =>
  page.evaluate((since) => {
    const after = (window.reliabilityCall?.moments ?? []).filter((m) => m.at >= since)
    const out = after.findIndex((m) => !m.live)
    return (out < 0 ? undefined : after.slice(out + 1).find((m) => m.live))?.at ?? null
  }, from)

/** Waits up to `LIMIT` for the call to be live again after `from`; when it was, or null. */
async function cameBack(page: Page, from: number) {
  await expect
    .poll(() => liveAgain(page, from), { timeout: LIMIT })
    .not.toBeNull()
    .catch(() => undefined)
  return liveAgain(page, from)
}

/** When the dock's notes first said `words` after `from`, and how many times they began to say them since. */
const saying = (page: Page, from: number, words: string) =>
  page.evaluate(
    ({ since, said }) => {
      const moments = window.reliabilityCall?.moments ?? []
      const starts = moments.filter(
        (m, i) => m.at >= since && m.note.includes(said) && !(moments[i - 1]?.note.includes(said) ?? false),
      )
      return { first: starts[0]?.at ?? null, times: starts.length }
    },
    { since: from, said: words },
  )

/** Waits, without failing the round, for what a step expects; what the round records says whether it came. */
const until = (check: Promise<void>) => check.catch(() => undefined)

/** Once back, «Reconnected.» is said for 4 s (REJOINED_FOR_MS); a second, then, for any further try to show. */
async function settledBack(page: Page, live: number | null) {
  if (live !== null) await until(expect(notes(page)).toHaveCount(0, { timeout: 10_000 }))
  await page.waitForTimeout(1000)
}

test('M5 · a call dropped online comes back without a press @reliability', async ({ browser }) => {
  test.setTimeout(120_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const { context, page } = await inCall(browser)
    const asking = await tokens(page)
    const from = await drop(page)
    const live = await cameBack(page, from)
    await settledBack(page, live)
    const reconnected = (await saying(page, from, RECONNECTED)).times
    const tries = (await tokens(page)) - asking
    samples.push({ case: 'online', back: live !== null, ms: live === null ? null : live - from, tries, reconnected })
    await context.close()
  }
  await record(test.info(), 'M5', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M5 · a call dropped offline comes back once the network does @reliability', async ({ browser }) => {
  test.setTimeout(120_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const { context, page } = await inCall(browser)
    const asking = await tokens(page)
    await context.setOffline(true)
    const from = await drop(page)
    await until(expect(notes(page)).toHaveText(OFFLINE_REJOIN))
    await page.waitForTimeout(1000) // a try made offline would have asked for its token by now
    const offlineTries = (await tokens(page)) - asking
    await context.setOffline(false)
    const live = await cameBack(page, from)
    const online = await page.evaluate(() => window.reliabilityCall?.online ?? null)
    await settledBack(page, live)
    const back = live !== null && online !== null
    samples.push({
      case: 'offline',
      back,
      ms: back ? live - online : null,
      tries: (await tokens(page)) - asking,
      offlineTries,
      reconnected: (await saying(page, from, RECONNECTED)).times,
    })
    await context.close()
  }
  await record(test.info(), 'M5', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M5 · a call whose one try fails says the dropped words with Try again, and tries no more @reliability', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    const { context, page } = await inCall(browser)
    const asking = await tokens(page)
    const from = await drop(page, true)
    await until(expect(tryAgain(page)).toBeEnabled({ timeout: LIMIT }))
    await page.waitForTimeout(3000) // a second try on its own would have asked for its token by now
    const words = await saying(page, from, DROPPED)
    const offered = (await tryAgain(page).count()) === 1 && (await tryAgain(page).isEnabled())
    samples.push({
      case: 'failed',
      dropped: (await notes(page).filter({ hasText: DROPPED }).count()) > 0,
      tryAgain: offered,
      tries: (await tokens(page)) - asking,
      ms: words.first === null ? null : words.first - from,
    })
    await context.close()
  }
  await record(test.info(), 'M5', samples)
  expect(samples).toHaveLength(ROUNDS)
})

/**
 * A way the microphone could come back: `off`, the call or this device's choice had it off (it must stay off); the
 * control has both on, and shows the check sees a microphone come back on. `ready` sets the case up in the call; `back`
 * drops it and brings it back: by the try, once online after an offline wait, or by Try again after a failed try.
 */
interface MicCase {
  how: string
  off: boolean
  ready?: (page: Page) => Promise<void>
  back: (page: Page, context: BrowserContext) => Promise<number>
}

/** Turned off from the dock, and shown off. */
async function muted(page: Page) {
  await microphone(page).click()
  await until(expect(microphone(page)).toHaveAttribute('aria-pressed', 'false'))
}

const byTheTry = (page: Page) => drop(page)

/** Dropped offline; «off» chosen during the wait; the network back. */
async function offlineChoosingOff(page: Page, context: BrowserContext) {
  await context.setOffline(true)
  const from = await drop(page)
  await until(expect(notes(page)).toHaveText(OFFLINE_REJOIN))
  await choose(page, 'off')
  await context.setOffline(false)
  return from
}

/** The try fails; «off» chosen after; Try again pressed. */
async function tryAgainChoosingOff(page: Page) {
  const from = await drop(page, true)
  await until(expect(tryAgain(page)).toBeEnabled({ timeout: LIMIT }))
  await choose(page, 'off')
  if ((await tryAgain(page).count()) === 1) await tryAgain(page).click()
  return from
}

const BY_THE_TRY: MicCase[] = [
  { how: 'muted in the call', off: true, ready: muted, back: byTheTry },
  {
    how: 'muted while the call reconnects',
    off: true,
    ready: async (page) => {
      await page.evaluate(() => window.fixture?.linkLost(true)) // «Reconnecting…», then LiveKit gives up
      await muted(page)
    },
    back: byTheTry,
  },
  {
    how: 'muted by an admin',
    off: true,
    ready: async (page) => {
      await page.evaluate(() => window.fixture?.mutedByHost())
      await until(expect(microphone(page)).toHaveAttribute('aria-pressed', 'false'))
    },
    back: byTheTry,
  },
  { how: 'on in the call, «off» chosen since', off: true, ready: (page) => choose(page, 'off'), back: byTheTry },
  { how: 'on, and the preference on', off: false, back: byTheTry },
]

const BY_WAITING: MicCase[] = [
  { how: '«off» chosen during the offline wait', off: true, back: offlineChoosingOff },
  { how: '«off» chosen, then Try again after a failed try', off: true, back: tryAgainChoosingOff },
]

/** One round of a microphone case: back in or not, and whether the microphone turned on since the drop. */
async function micRound(browser: Browser, c: MicCase) {
  const { context, page } = await inCall(browser)
  await c.ready?.(page)
  const before = (await asked(page)).length
  const from = await c.back(page, context)
  const live = await cameBack(page, from)
  // The microphone turns on as the join connects, before the call is shown: a second more, for one that would.
  await until(
    expect.poll(async () => (await asked(page)).slice(before).includes('microphone:on'), { timeout: 1000 }).toBe(true),
  )
  const turnedOn = (await asked(page)).slice(before).includes('microphone:on')
  const shownOn = live !== null && (await microphone(page).getAttribute('aria-pressed')) === 'true'
  await context.close()
  return { case: 'mic', how: c.how, off: c.off, back: live !== null, micOn: turnedOn || shownOn }
}

async function micRounds(browser: Browser, cases: MicCase[]) {
  const samples = []
  for (const c of cases) for (let round = 0; round < ROUNDS; round++) samples.push(await micRound(browser, c))
  return samples
}

test('M5 · the microphone stays off through the try when the call or the choice had it off @reliability', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const samples = await micRounds(browser, BY_THE_TRY)
  await record(test.info(), 'M5', samples)
  expect(samples).toHaveLength(BY_THE_TRY.length * ROUNDS)
})

test('M5 · the microphone stays off through an offline wait and a Try again when chosen off @reliability', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const samples = await micRounds(browser, BY_WAITING)
  await record(test.info(), 'M5', samples)
  expect(samples).toHaveLength(BY_WAITING.length * ROUNDS)
})
