import { expect, test, type Page } from '@playwright/test'

// R-C1 P1 r4307481560 (controlled room fixture, synthetic people and words, the app's real components, owned readers
// and QueryClient): after a permitted render, TanStack's observer delivery is held (the app's own notifyManager, as
// updates-refusal.spec does). The report's / task's own read is set out again through its owned query function and
// refused by the fixture; its fence marker is then in the page's cache while observer deliveries are still held, and
// over the next animation frames nothing of the report or the task's permitted detail is drawn. Only a fence read from
// the cache as it changes (useSyncExternalStore) can hide them then.

declare global {
  interface Window {
    heldDelivery?: { held: (() => void)[]; release: () => void }
  }
}

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
const DESIGN_TASK = '00000000-0000-4000-8000-0000000000e2'
const FIRST = 'The first version of a labelled fixture report.'

/** Holds every observer delivery on the app's own @tanstack/react-query module instance (updates-refusal.spec). */
async function holdObserverDelivery(page: Page) {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((name) => name.includes('/.vite/deps/@tanstack_react-query.js'))
    if (!url) throw new Error('the page loaded no @tanstack/react-query module')
    const query: unknown = await import(/* @vite-ignore */ url)
    const manager = query && typeof query === 'object' && 'notifyManager' in query ? query.notifyManager : undefined
    if (!manager || typeof manager !== 'object' || !('setScheduler' in manager)) throw new Error('no notifyManager')
    const set = manager.setScheduler
    if (typeof set !== 'function') throw new Error('no setScheduler')
    const held: (() => void)[] = []
    window.heldDelivery = {
      held,
      release: () => {
        Reflect.apply(set, manager, [(cb: () => void) => setTimeout(cb, 0)])
        for (const cb of held.splice(0)) cb()
      },
    }
    Reflect.apply(set, manager, [(cb: () => void) => held.push(cb)])
  })
}

const fenced = (page: Page, key: readonly string[]) =>
  page.evaluate((k) => {
    const f = window.fixture?.fenceOf(k)
    const num = (name: string) =>
      f && typeof f === 'object' && name in f && typeof Reflect.get(f, name) === 'number'
        ? Number(Reflect.get(f, name))
        : 0
    return { refusedAt: num('refusedAt'), allowedFrom: num('allowedFrom'), held: window.heldDelivery?.held.length ?? 0 }
  }, key)

/**
 * What the DOM shows over the next `n` animation frames (marker written, deliveries held), sampled each frame: for the
 * report, its text or its titled pane; for the task, its card in its permitted state or with its design header.
 */
const frames = (page: Page, n: number, surface: 'report' | 'task') =>
  page.evaluate(
    ([count, what, first, task]) =>
      new Promise<{ frame: number; held: number; hit: boolean }[]>((resolve) => {
        const hit = () => {
          if (what === 'report')
            return document.body.innerText.includes(first) || !!document.querySelector('[aria-label="Fixture report"]')
          const c = document.querySelector(`.work-card[data-task="${task}"]`)
          return !!c && (c.getAttribute('data-state') === 'published' || c.textContent.includes('HTML page design'))
        }
        const out: { frame: number; held: number; hit: boolean }[] = []
        const step = () => {
          out.push({ frame: out.length + 1, held: window.heldDelivery?.held.length ?? 0, hit: hit() })
          if (out.length >= count) resolve(out)
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    [n, surface, FIRST, DESIGN_TASK] as const,
  )

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.heldDelivery?.release()).catch(() => undefined)
})

test('fence frame · report: refused while observer delivery is held, no frame shows the report', async ({
  page,
}, info) => {
  await page.goto(`/room.html?report=${REPORT}`)
  await expect(page.getByText(FIRST)).toBeVisible() // permitted, cached
  await holdObserverDelivery(page)
  await page.evaluate(() => window.fixture?.failVersions('not_found'))
  await page.evaluate((r) => window.fixture?.refetch(['report-versions', r]), REPORT)
  await expect
    .poll(
      async () => {
        const f = await fenced(page, ['report-fence', REPORT])
        return f.refusedAt > f.allowedFrom && f.held > 0
      },
      { timeout: 10_000 },
    )
    .toBe(true)
  const marker = await fenced(page, ['report-fence', REPORT])
  const trace = await frames(page, 3, 'report')
  await info.attach('report-frames.json', {
    body: JSON.stringify({ marker, trace }, null, 1),
    contentType: 'application/json',
  })
  console.log(`REPORT marker=${JSON.stringify(marker)} frames=${JSON.stringify(trace)}`)
  expect(trace.every((t) => t.held > 0)).toBe(true)
  expect(trace.filter((t) => t.hit)).toEqual([])
})

test('fence frame · task: refused while observer delivery is held, no frame shows its permitted state; Try again restores', async ({
  page,
}, info) => {
  await page.goto('/room.html?place=work&designcard=on&designed=on')
  const card = page.locator(`.work-card[data-task="${DESIGN_TASK}"]`)
  await expect(card).toHaveAttribute('data-state', 'published') // permitted, cached
  await holdObserverDelivery(page)
  await page.evaluate(() => window.fixture?.failDesign('forbidden'))
  await page.evaluate(() => window.fixture?.refetch(['native-task']))
  await expect
    .poll(
      async () => {
        const f = await fenced(page, ['task-fence', PROJECT, DESIGN_TASK])
        return f.refusedAt > f.allowedFrom && f.held > 0
      },
      { timeout: 10_000 },
    )
    .toBe(true)
  const marker = await fenced(page, ['task-fence', PROJECT, DESIGN_TASK])
  const trace = await frames(page, 3, 'task')
  await info.attach('task-frames.json', {
    body: JSON.stringify({ marker, trace }, null, 1),
    contentType: 'application/json',
  })
  console.log(`TASK marker=${JSON.stringify(marker)} frames=${JSON.stringify(trace)}`)
  expect(trace.every((t) => t.held > 0)).toBe(true)
  expect(trace.filter((t) => t.hit)).toEqual([])
  // Positive: released, the refusal stays; a genuine allowed read set out by Try again restores the card.
  await page.evaluate(() => window.heldDelivery?.release())
  await expect(card).toHaveAttribute('data-state', 'refused')
  await page.evaluate(() => window.fixture?.failDesign(false))
  await card.getByRole('button', { name: 'Try again' }).click()
  await expect(card).toHaveAttribute('data-state', 'published')
})
