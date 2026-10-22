import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { record } from './measure.ts'

// M9 (docs/plans/version-probe.md; the baseline's §4 row M9, «aviso ≤ 15 min tras el despliegue»): a tab left open
// while the host starts serving another version. On the app's own page, which names `fixture-build` and serves it as
// version.json (vite.app.config.ts), a route serves another from the lever on. Per trigger: back into focus, back into
// view, and the tab left in view (the probe's interval, on the page's clock: Playwright's, so its minutes take none),
// whether «Sophia was updated» came, how long after, and whether the page reloaded by itself (never wanted: it would
// cut a call). Measured, not judged: the checks assert only that each scenario ran.

const APP = 'http://127.0.0.1:5198'
const ROUNDS = 3
/** How long a trigger's notice is waited for, in real time. */
const LIMIT_MS = 15_000
/** The interval's rounds: the version changes this long after the page loaded (its probe's clock began). */
const PHASES_MS = [0, 3 * 60_000, 7 * 60_000]
/** The page's clock jumps in steps this long: the interval's times are this precise. */
const STEP_MS = 5_000
/** How far the page's clock jumps for the interval's notice: past the baseline's 15 minutes. */
const CLOCK_LIMIT_MS = 16 * 60_000

declare global {
  interface Window {
    reliabilityVersion?: Promise<number | null>
  }
}

/** A deploy: the host serves another version from now on; `asked` counts the page's requests for it. */
async function deploy(page: Page) {
  const asked = { count: 0 }
  await page.route(`${APP}/version.json`, (route) => {
    asked.count += 1
    return route.fulfill({ json: { version: 'fixture-deployed' } })
  })
  return asked
}

/** A fresh tab of the app, marked, so a reload by itself shows as the mark gone. */
async function opened(context: BrowserContext, clock = false) {
  const page = await context.newPage()
  if (clock) await page.clock.install()
  await page.goto(`${APP}/app.html`)
  await expect(page.locator('#root')).not.toBeEmpty()
  // The page's clock stops a moment after its probe began: from here only the check moves it.
  if (clock) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
  await page.evaluate(() => Reflect.set(window, 'notReloaded', true))
  return page
}

const reloadedOf = (page: Page) => page.evaluate(() => Reflect.get(window, 'notReloaded') !== true)
const noticeShown = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Sophia was updated' }).isVisible({ timeout: 0 })

/**
 * Back into focus or into view, the version already changed: the clock starts with the trigger, in the page, and stops
 * when the notice is on screen (null past the limit).
 */
async function triggered(context: BrowserContext, trigger: 'focus' | 'visible') {
  const page = await opened(context)
  await deploy(page)
  await page.evaluate(
    ({ how, limit }) => {
      window.reliabilityVersion = new Promise<number | null>((resolve) => {
        const start = performance.now()
        const tick = () => {
          const shown = [...document.querySelectorAll('[role="status"]')].some((e) =>
            e.textContent.includes('Sophia was updated'),
          )
          if (shown) resolve(performance.now() - start)
          else if (performance.now() - start > limit) resolve(null)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        if (how === 'focus') {
          window.dispatchEvent(new Event('focus'))
          return
        }
        // Hidden, then back into view, as a tab switched away from and back to.
        let state: DocumentVisibilityState = 'hidden'
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
        document.dispatchEvent(new Event('visibilitychange'))
        state = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
      })
    },
    { how: trigger, limit: LIMIT_MS },
  )
  const ms = await page.evaluate(async () => (await window.reliabilityVersion) ?? null)
  const sample = { trigger, noticed: ms !== null, ms, reloaded: await reloadedOf(page) }
  await page.close()
  return sample
}

/**
 * Left in view: the version changes `phase` after the page loaded, and the page's clock jumps in steps (each due timer fires once) until the page
 * asks again (its interval) and the notice shows. Then ten more minutes, so a later reload by itself would show too.
 */
async function interval(context: BrowserContext, phase: number) {
  const page = await opened(context, true)
  if (phase > 0) await page.clock.fastForward(phase)
  const asked = await deploy(page)
  let elapsed = 0
  while (asked.count === 0 && elapsed < CLOCK_LIMIT_MS) {
    await page.clock.fastForward(STEP_MS)
    elapsed += STEP_MS
  }
  const notice = page.getByRole('status').filter({ hasText: 'Sophia was updated' })
  const shown =
    asked.count > 0 &&
    (await notice.waitFor({ state: 'visible', timeout: LIMIT_MS }).then(
      () => true,
      () => false,
    ))
  await page.clock.fastForward(10 * 60_000)
  const noticed = shown && (await noticeShown(page))
  const sample = {
    trigger: 'interval',
    phaseMs: phase,
    noticed,
    ms: shown ? elapsed : null,
    reloaded: await reloadedOf(page),
  }
  await page.close()
  return sample
}

test('M9 · a deploy heard as the tab comes back into focus @reliability', async ({ context }) => {
  test.setTimeout(180_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) samples.push(await triggered(context, 'focus'))
  await record(test.info(), 'M9', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M9 · a deploy heard as the tab comes back into view @reliability', async ({ context }) => {
  test.setTimeout(180_000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) samples.push(await triggered(context, 'visible'))
  await record(test.info(), 'M9', samples)
  expect(samples).toHaveLength(ROUNDS)
})

test('M9 · a deploy heard by a tab left in view, on its interval @reliability', async ({ context }) => {
  test.setTimeout(180_000)
  const samples = []
  for (const phase of PHASES_MS) samples.push(await interval(context, phase))
  await record(test.info(), 'M9', samples)
  expect(samples).toHaveLength(PHASES_MS.length)
})
